import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cap, dateFmt, lang, t } from "../../i18n";
import { ArrowLeft, ChevronLeft, ChevronRight, Feather, Moon, NotebookPen, Shuffle, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { isoDate } from "../../data/dates";
import { openDay, shiftDay } from "../../data/journal";
import type { Note } from "../../data/notes";
import {
  QUESTIONS,
  VIRTUES,
  heading,
  isEmptyReview,
  joinReview,
  loadReviews,
  reviewPath,
  splitReview,
  virtuesOf,
  type Parts,
  type Question,
  type ReviewEntry,
  type Virtue,
} from "../../data/review";
import { citation, pickForDay, randomThought, thoughtOfDay, type Thought } from "../../data/thoughts";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useApp } from "../context";
import { Calendar, monthOf } from "../journal/Calendar";
import { CloseDay } from "../journal/CloseDay";
import type { ThoughtsData } from "../thoughts/ThoughtsView";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";

// Review, the evening examination (SPEC 5.8): calendar and the month's reviews on the left, the
// day's questions on the right (one at a time on the phone). Built like the Journal: a day gets a
// file only once something is written.

/** Written reviews, newest first, reloaded whenever data on disk changes. */
export function useReviews(): ReviewEntry[] {
  const { notes, version, toast } = useApp();
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  useEffect(() => {
    let alive = true;
    loadReviews(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(l => alive && setEntries(l));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return entries;
}

const LONG = () => dateFmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const ROW = () => dateFmt({ weekday: "short", day: "numeric", month: "short" });
const at = (day: string) => new Date(`${day}T12:00`);
const wide = () => matchMedia("(min-width: 720px)").matches;

interface Props {
  entries: ReviewEntry[];
  thoughts: ThoughtsData;
  /** A day to open (from Today, Search or the Journal). */
  openDay?: { day: string; key: number };
  onJournal(day: string): void;
  onThought(t: Thought): void;
}

export function ReviewView({ entries, thoughts, openDay: target, onJournal, onThought }: Props) {
  const [open, setOpen] = useState<string | null>(() => target?.day ?? (wide() ? isoDate() : null));
  const [month, setMonth] = useState(monthOf(open ?? isoDate()));
  const [closing, setClosing] = useState<string | null>(null);
  const byDay = new Map(entries.map(e => [e.day, e]));

  const pick = (day: string) => {
    setOpen(day);
    setMonth(monthOf(day));
  };

  useEffect(() => {
    if (target) pick(target.day);
  }, [target]);

  // Alt+←/→: previous/next day (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      setOpen(d => {
        const next = shiftDay(d ?? isoDate(), e.key === "ArrowLeft" ? -1 : 1);
        setMonth(monthOf(next));
        return next;
      });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const shown = entries.filter(e => monthOf(e.day) === month);

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>{t.review.title}</h1>
          <button className="btn primary" onClick={() => pick(isoDate())}>
            {t.journal.today}
          </button>
        </div>
        <Calendar month={month} setMonth={setMonth} selected={open} entries={byDay} onPick={pick} />
        {shown.length === 0 ? (
          <p className="muted empty-note">
            {entries.length === 0 ? t.review.none : t.review.noneMonth}
          </p>
        ) : (
          <ul className="list">
            {shown.map(e => (
              <li key={e.day}>
                <button className={`list-item${open === e.day ? " active" : ""}`} onClick={() => pick(e.day)}>
                  <span className="list-meta mono">
                    {cap(ROW().format(at(e.day)))} · {e.answered}/{QUESTIONS.length}
                    {e.virtues.length > 0 && <VirtueDots list={e.virtues} />}
                  </span>
                  <span className="list-title journal-preview">
                    {e.preview || <span className="muted">{t.review.onlyVirtues}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="detail-pane">
        {open ? (
          <ReviewDay
            key={open}
            day={open}
            thoughts={thoughts}
            onBack={() => setOpen(null)}
            onDay={pick}
            onJournal={() => onJournal(open)}
            onThought={onThought}
            onClose={() => setClosing(open)}
          />
        ) : (
          <div className="detail-empty muted">{t.journal.pickDay}</div>
        )}
      </div>
      {closing && <CloseDay day={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

function VirtueDots({ list }: { list: Virtue[] }) {
  return (
    <span className="virtue-dots" aria-label={t.review.practisedList(list.map(v => t.review.virtues[v][0]).join(", "))}>
      {list.map(v => (
        <span key={v} className="dot" style={{ background: `var(--${VIRTUES.find(x => x.id === v)!.color})` }} />
      ))}
    </span>
  );
}

interface DayProps {
  day: string;
  thoughts: ThoughtsData;
  onBack(): void;
  onDay(day: string): void;
  onJournal(): void;
  onThought(t: Thought): void;
  onClose(): void;
}

/** What the first action asked for once the file exists (`created`: made here, show everything). */
type Start = { focus?: string; created?: boolean };

/** One day: the page when it has a file, otherwise the same questions that create it on first use. */
function ReviewDay(props: DayProps) {
  const { day, onBack, onDay } = props;
  const { notes, version, toast, bump } = useApp();
  const path = reviewPath(day);
  const [exists, setExists] = useState<boolean | null>(null);
  const [start, setStart] = useState<Start>({});
  useBack(true, onBack);

  useEffect(() => {
    let alive = true;
    notes.exists(path).then(x => alive && setExists(x));
    return () => {
      alive = false;
    };
  }, [notes, path, version]);

  const create = async (data: { virtues?: Virtue[]; develop?: Virtue[] }, how: Start) => {
    try {
      const n = await openDay(notes, "review", day);
      if (data.virtues || data.develop) await notes.save(n, { ...n.data, ...data }, n.body);
      setStart({ ...how, created: true });
      setExists(true);
      bump();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  const bar = (status: string, extra?: ReactNode) => (
    <div className="note-bar">
      <button className="btn ghost icon back" onClick={onBack} aria-label={t.common.back}>
        <ArrowLeft size={20} />
      </button>
      <button className="btn ghost icon" aria-label={t.journal.prevDay} title={t.journal.prevDayKey} onClick={() => onDay(shiftDay(day, -1))}>
        <ChevronLeft size={20} />
      </button>
      <button className="btn ghost icon" aria-label={t.journal.nextDay} title={t.journal.nextDayKey} onClick={() => onDay(shiftDay(day, 1))}>
        <ChevronRight size={20} />
      </button>
      <span className="note-status mono" aria-live="polite">
        {status}
      </span>
      <button className="btn ghost icon" aria-label={t.journal.journalOfDay} title={t.journal.journalOfDay} onClick={props.onJournal}>
        <NotebookPen size={18} />
      </button>
      {extra}
    </div>
  );

  const head = (
    <div className="journal-head">
      <h2 className="journal-date">{cap(LONG().format(at(day)))}</h2>
      {day === isoDate() && <span className="muted small">{t.journal.today}</span>}
    </div>
  );

  if (exists === null) return <div className="note-editor">{bar("")}</div>;

  if (!exists)
    return (
      <div className="note-editor">
        {bar("")}
        <div className="page task-page">
          <div className="page-inner stack review-page">
            {head}
            <DayThought day={day} data={props.thoughts} onOpen={props.onThought} />
            {QUESTIONS.map(q => (
              <QuestionBlock key={q.title} q={q}>
                {q.title === "Virtues" && (
                  <VirtuePicker
                    virtues={[]}
                    develop={[]}
                    onChange={(field, list) => create({ [field]: list }, {})}
                  />
                )}
                <button className="review-empty" onClick={() => create({}, { focus: q.title })}>
                  {t.review.writeHere}
                </button>
              </QuestionBlock>
            ))}
            <DayActions onClose={props.onClose} />
          </div>
        </div>
      </div>
    );

  return <ReviewPage {...props} path={path} head={head} bar={bar} start={start} onGone={() => setExists(false)} />;
}

/** The thought of the day at the top (SPEC 5.8): the review's own pick, else the day's thought. */
function DayThought(props: { day: string; data: ThoughtsData; picked?: string; onOpen(t: Thought): void; onPick?(id: string): void }) {
  const { notes, bump, toast } = useApp();
  const { data, day } = props;
  if (!data.loaded) return null;
  const own = props.picked ? data.all.find(x => x.id === props.picked) : undefined;
  const d = own ? { thought: own, picked: true } : thoughtOfDay(data.all, data.state, day);
  if (!d) return null;
  const th = d.thought;

  const another = async () => {
    const next = randomThought(data.all, th.id);
    if (!next) return;
    try {
      await pickForDay(notes.storage, next.id, day);
      props.onPick?.(next.id);
      bump();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <div className="today-card quote-review review-thought" aria-label={t.review.thoughtOfDay}>
      <div className="qr-head muted small">
        <Feather size={16} />
        <span>{day === isoDate() ? t.review.thoughtOfDay : t.review.thoughtOfThisDay}</span>
        {d.picked && <span className="count">{t.thoughts.picked}</span>}
      </div>
      <blockquote className="qr-text">{th.text}</blockquote>
      {(th.author || th.work) && <div className="qr-source muted small">— {citation(th)}</div>}
      <div className="row qr-actions">
        <button className="btn ghost" onClick={another} title={t.review.anotherTitle}>
          <Shuffle size={16} /> {t.review.another}
        </button>
        <button className="btn ghost" onClick={() => props.onOpen(th)}>
          {t.common.open}
        </button>
      </div>
    </div>
  );
}

function QuestionBlock({ q, title, note, children }: { q?: Question; title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="review-q" aria-label={q ? heading(q) : title}>
      <h3>{q ? heading(q) : title}</h3>
      {q && <p className="review-question">{t.review.questions[q.title]}</p>}
      {q?.support && (
        <p className="review-support muted small">
          {t.review.leads[q.title]} “{lang === "pt-BR" ? q.support.textPt : q.support.text}”
        </p>
      )}
      {note && <p className="review-support muted small">{note}</p>}
      {children}
    </section>
  );
}

function VirtuePicker(props: { virtues: Virtue[]; develop: Virtue[]; onChange(field: "virtues" | "develop", list: Virtue[]): void }) {
  const row = (field: "virtues" | "develop", label: string, list: Virtue[]) => (
    <div className="virtue-row">
      <span className="fl">{label}</span>
      <div className="moods" role="group" aria-label={label}>
        {VIRTUES.map(v => {
          const on = list.includes(v.id);
          return (
            <button
              key={v.id}
              className={`chip mood${on ? " active" : ""}`}
              style={{ "--mood": `var(--${v.color})` } as CSSProperties}
              aria-pressed={on}
              title={t.review.virtues[v.id][1]}
              onClick={() => props.onChange(field, virtuesOf(on ? list.filter(x => x !== v.id) : [...list, v.id]))}
            >
              {t.review.virtues[v.id][0]}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="virtues">
      {row("virtues", t.review.practised, props.virtues)}
      {row("develop", t.review.toDevelop, props.develop)}
    </div>
  );
}

function DayActions({ onClose }: { onClose(): void }) {
  return (
    <div className="row task-actions">
      <button className="btn" onClick={onClose}>
        <Moon size={18} /> {t.shell.closeDay}
      </button>
    </div>
  );
}

interface PageProps extends DayProps {
  path: string;
  head: ReactNode;
  bar(status: string, extra?: ReactNode): ReactNode;
  start: Start;
  onGone(): void;
}

function ReviewPage(props: PageProps) {
  const { path, bar } = props;
  const { notes, bump, toast, confirmDelete } = useApp();
  const f = useNoteFile(path, { removeIfEmpty: isEmptyReview });
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const remove = async () => {
    if (!(await confirmDelete())) return;
    try {
      await f.saveNow();
      const trashed = await moveToTrash(notes.storage, path);
      props.onGone();
      bump();
      toast({
        text: t.review.deleted,
        action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="note-editor">
      {bar(
        f.note ? t.note.status[f.status] : "",
        f.note && (
          <button className="btn ghost icon" aria-label={t.review.deleteReview} title={t.common.delete} onClick={remove}>
            <Trash2 size={18} />
          </button>
        ),
      )}
      {f.gone ? (
        <div className="page">
          <div className="page-inner">
            <p className="err">{f.gone}</p>
          </div>
        </div>
      ) : (
        f.note && <ReviewForm key={f.rev} {...props} file={f} note={f.note} start={f.rev <= 1 ? props.start : {}} />
      )}
      {f.dialog}
    </div>
  );
}

function ReviewForm(props: PageProps & { file: NoteFile; note: Note }) {
  const { file: f, note, start, day } = props;
  const [parts] = useState<Parts>(() => splitReview(note.body));
  const [virtues, setVirtues] = useState(() => virtuesOf(note.data.virtues));
  const [develop, setDevelop] = useState(() => virtuesOf(note.data.develop));
  const [picked, setPicked] = useState(() => (typeof note.data.thought === "string" ? note.data.thought : undefined));
  // A past review shows only what was answered; a button brings back the blank questions.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (day >= isoDate() || start.created) return new Set();
    const blank = QUESTIONS.filter(q => !(parts.answers[q.title] ?? "").trim()).map(q => q.title);
    return new Set(blank.filter(x => x !== "Virtues" || !(virtues.length || develop.length)));
  });

  const write = () => f.setBody(joinReview(parts));
  const setAnswer = (title: string, text: string) => {
    parts.answers[title] = text;
    write();
  };

  const field = (key: string, text: string, onChange: (t: string) => void) => (
    <div className="task-notes review-field">
      <Editor text={text} autoFocus={start.focus === key} placeholder={t.review.writeHere} onSaveNow={f.saveNow} onChange={onChange} />
    </div>
  );

  return (
    <div className="page task-page">
      <div className="page-inner stack review-page">
        {props.head}
        <DayThought
          day={day}
          data={props.thoughts}
          picked={picked}
          onOpen={props.onThought}
          onPick={id => {
            setPicked(id);
            f.setData({ thought: id });
          }}
        />
        {parts.free.trim() && (
          <QuestionBlock title={t.review.freeText} note={t.review.freeNote}>
            {field("", parts.free, text => {
              parts.free = text;
              write();
            })}
          </QuestionBlock>
        )}
        {QUESTIONS.filter(q => !hidden.has(q.title)).map(q => (
          <QuestionBlock key={q.title} q={q}>
            {q.title === "Virtues" && (
              <VirtuePicker
                virtues={virtues}
                develop={develop}
                onChange={(fld, list) => {
                  (fld === "virtues" ? setVirtues : setDevelop)(list);
                  f.setData({ [fld]: list.length ? list : undefined });
                }}
              />
            )}
            {field(q.title, parts.answers[q.title] ?? "", text => setAnswer(q.title, text))}
          </QuestionBlock>
        ))}
        {hidden.size > 0 && (
          <button className="btn ghost review-more" onClick={() => setHidden(new Set())}>
            {t.review.showBlank(hidden.size)}
          </button>
        )}
        {parts.extras.map((x, i) => (
          <QuestionBlock key={i} title={x.title} note={t.review.otherSection}>
            {field(`extra-${i}`, x.text, text => {
              x.text = text;
              write();
            })}
          </QuestionBlock>
        ))}
        <DayActions onClose={props.onClose} />
      </div>
    </div>
  );
}

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Feather, Moon, NotebookPen, Shuffle, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { isoDate } from "../../data/dates";
import { openDay, shiftDay } from "../../data/journal";
import type { Note } from "../../data/notes";
import {
  QUESTIONS,
  VIRTUES,
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
import { STATUS_TEXT, useNoteFile, type NoteFile } from "../useNoteFile";

// Review, the evening examination (SPEC 5.8): calendar and the month's reviews on the left, the
// day's questions on the right (one at a time on the phone). Built like the Journal: a day gets a
// file only once something is written.

/** Written reviews, newest first, reloaded whenever data on disk changes. */
export function useReviews(): ReviewEntry[] {
  const { notes, version, toast } = useApp();
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  useEffect(() => {
    let alive = true;
    loadReviews(notes, p => toast({ text: `Could not read ${p}`, error: true })).then(l => alive && setEntries(l));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return entries;
}

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const ROW = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
          <h1>Review</h1>
          <button className="btn primary" onClick={() => pick(isoDate())}>
            Today
          </button>
        </div>
        <Calendar month={month} setMonth={setMonth} selected={open} entries={byDay} onPick={pick} />
        {shown.length === 0 ? (
          <p className="muted empty-note">
            {entries.length === 0
              ? "No reviews yet. Pick a day, or press Today, and answer what you want. An empty day keeps no file."
              : "No reviews this month."}
          </p>
        ) : (
          <ul className="list">
            {shown.map(e => (
              <li key={e.day}>
                <button className={`list-item${open === e.day ? " active" : ""}`} onClick={() => pick(e.day)}>
                  <span className="list-meta mono">
                    {ROW.format(at(e.day))} · {e.answered}/{QUESTIONS.length}
                    {e.virtues.length > 0 && <VirtueDots list={e.virtues} />}
                  </span>
                  <span className="list-title journal-preview">
                    {e.preview || <span className="muted">(only virtues)</span>}
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
          <div className="detail-empty muted">Pick a day.</div>
        )}
      </div>
      {closing && <CloseDay day={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

function VirtueDots({ list }: { list: Virtue[] }) {
  return (
    <span className="virtue-dots" aria-label={`Practised: ${list.join(", ")}`}>
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
      <button className="btn ghost icon back" onClick={onBack} aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <button className="btn ghost icon" aria-label="Previous day" title="Previous day (Alt+←)" onClick={() => onDay(shiftDay(day, -1))}>
        <ChevronLeft size={20} />
      </button>
      <button className="btn ghost icon" aria-label="Next day" title="Next day (Alt+→)" onClick={() => onDay(shiftDay(day, 1))}>
        <ChevronRight size={20} />
      </button>
      <span className="note-status mono" aria-live="polite">
        {status}
      </span>
      <button className="btn ghost icon" aria-label="Journal of this day" title="Journal of this day" onClick={props.onJournal}>
        <NotebookPen size={18} />
      </button>
      {extra}
    </div>
  );

  const head = (
    <div className="journal-head">
      <h2 className="journal-date">{LONG.format(at(day))}</h2>
      {day === isoDate() && <span className="muted small">Today</span>}
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
                  Write here, if you want…
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
  const own = props.picked ? data.all.find(t => t.id === props.picked) : undefined;
  const d = own ? { thought: own, picked: true } : thoughtOfDay(data.all, data.state, day);
  if (!d) return null;
  const t = d.thought;

  const another = async () => {
    const next = randomThought(data.all, t.id);
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
    <div className="today-card quote-review review-thought" aria-label="Thought of the day">
      <div className="qr-head muted small">
        <Feather size={16} />
        <span>{day === isoDate() ? "Thought of the day" : "Thought of this day"}</span>
        {d.picked && <span className="count">picked</span>}
      </div>
      <blockquote className="qr-text">{t.text}</blockquote>
      {(t.author || t.work) && <div className="qr-source muted small">— {citation(t)}</div>}
      <div className="row qr-actions">
        <button className="btn ghost" onClick={another} title="Another thought for this day, drawn from the library">
          <Shuffle size={16} /> Another
        </button>
        <button className="btn ghost" onClick={() => props.onOpen(t)}>
          Open
        </button>
      </div>
    </div>
  );
}

function QuestionBlock({ q, title, note, children }: { q?: Question; title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="review-q" aria-label={q?.title ?? title}>
      <h3>{q?.title ?? title}</h3>
      {q && <p className="review-question">{q.question}</p>}
      {q?.support && (
        <p className="review-support muted small">
          {q.support.lead} “{q.support.text}”
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
              title={v.hint}
              onClick={() => props.onChange(field, virtuesOf(on ? list.filter(x => x !== v.id) : [...list, v.id]))}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="virtues">
      {row("virtues", "Practised", props.virtues)}
      {row("develop", "To develop", props.develop)}
    </div>
  );
}

function DayActions({ onClose }: { onClose(): void }) {
  return (
    <div className="row task-actions">
      <button className="btn" onClick={onClose}>
        <Moon size={18} /> Close the day
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
  const { notes, bump, toast } = useApp();
  const f = useNoteFile(path, { removeIfEmpty: isEmptyReview });
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const remove = async () => {
    try {
      await f.saveNow();
      const trashed = await moveToTrash(notes.storage, path);
      props.onGone();
      bump();
      toast({
        text: "Review deleted",
        action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="note-editor">
      {bar(
        f.note ? STATUS_TEXT[f.status] : "",
        f.note && (
          <button className="btn ghost icon" aria-label="Delete review" title="Delete" onClick={remove}>
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
    return new Set(blank.filter(t => t !== "Virtues" || !(virtues.length || develop.length)));
  });

  const write = () => f.setBody(joinReview(parts));
  const setAnswer = (title: string, text: string) => {
    parts.answers[title] = text;
    write();
  };

  const field = (key: string, text: string, onChange: (t: string) => void) => (
    <div className="task-notes review-field">
      <Editor text={text} autoFocus={start.focus === key} placeholder="Write here, if you want…" onSaveNow={f.saveNow} onChange={onChange} />
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
          <QuestionBlock title="Free text" note="Text written outside the questions.">
            {field("", parts.free, t => {
              parts.free = t;
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
            {field(q.title, parts.answers[q.title] ?? "", t => setAnswer(q.title, t))}
          </QuestionBlock>
        ))}
        {hidden.size > 0 && (
          <button className="btn ghost review-more" onClick={() => setHidden(new Set())}>
            {hidden.size > 1 ? `Show the ${hidden.size} blank questions` : "Show the blank question"}
          </button>
        )}
        {parts.extras.map((x, i) => (
          <QuestionBlock key={i} title={x.title} note="A section with another name, kept as it was.">
            {field(`extra-${i}`, x.text, t => {
              x.text = t;
              write();
            })}
          </QuestionBlock>
        ))}
        <DayActions onClose={props.onClose} />
      </div>
    </div>
  );
}

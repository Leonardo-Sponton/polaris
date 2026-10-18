import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cap, dateFmt, isWord, t, word } from "../../i18n";
import { ArrowLeft, ChevronLeft, ChevronRight, Moon, Plus, Scale, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { isoDate } from "../../data/dates";
import { addSection, sectionsOf } from "../../data/ideas";
import {
  JOURNAL_SECTIONS,
  MOODS,
  isEmptyDay,
  journalPath,
  loadJournal,
  openDay,
  shiftDay,
  type Entry,
  type Mood,
} from "../../data/journal";
import type { Note } from "../../data/notes";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { Calendar, monthOf } from "./Calendar";
import { CloseDay } from "./CloseDay";

// Journal (SPEC 5.7): the calendar and the month's entries on the left, the day's page on the
// right (one at a time on the phone). A day gets a file only once something is written.

/** Written days, newest first, reloaded whenever data on disk changes. */
export function useJournal(): Entry[] {
  const { notes, version, toast } = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    let alive = true;
    loadJournal(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(l => alive && setEntries(l));
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

export function MoodPicker({ mood, onPick }: { mood?: Mood; onPick(m: Mood | undefined): void }) {
  return (
    <div className="moods" role="group" aria-label={t.journal.dayWas}>
      {MOODS.map(m => (
        <button
          key={m.id}
          className={`chip mood${mood === m.id ? " active" : ""}`}
          style={{ "--mood": `var(--${m.color})` } as CSSProperties}
          aria-pressed={mood === m.id}
          onClick={() => onPick(mood === m.id ? undefined : m.id)}
        >
          {t.journal.moods[m.id]}
        </button>
      ))}
    </div>
  );
}

interface Props {
  entries: Entry[];
  /** A day to open (from Today or Search). */
  openDay?: { day: string; key: number };
  /** The Review of a day (button in the day's bar). */
  onReview(day: string): void;
}

export function JournalView({ entries, openDay: target, onReview }: Props) {
  const [open, setOpen] = useState<string | null>(() => target?.day ?? (wide() ? isoDate() : null));
  const [month, setMonth] = useState(monthOf(open ?? isoDate()));
  const [closing, setClosing] = useState<string | null>(null);
  const byDay = new Map(entries.map(e => [e.day, e]));

  const pick = useCallback((day: string) => {
    setOpen(day);
    setMonth(monthOf(day));
  }, []);

  useEffect(() => {
    if (target) pick(target.day);
  }, [target, pick]);

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
          <h1>{t.journal.title}</h1>
          <button className="btn primary" onClick={() => pick(isoDate())}>
            {t.journal.today}
          </button>
        </div>
        <Calendar month={month} setMonth={setMonth} selected={open} entries={byDay} onPick={pick} />
        {shown.length === 0 ? (
          <p className="muted empty-note">
            {entries.length === 0 ? t.journal.none : t.journal.nothingMonth}
          </p>
        ) : (
          <ul className="list">
            {shown.map(e => {
              const mood = MOODS.find(m => m.id === e.mood);
              return (
                <li key={e.day}>
                  <button className={`list-item${open === e.day ? " active" : ""}`} onClick={() => pick(e.day)}>
                    <span className="list-meta mono">
                      {cap(ROW().format(at(e.day)))}
                      {mood && (
                        <>
                          {" · "}
                          <span style={{ color: `var(--${mood.color})` }}>{t.journal.moods[mood.id]}</span>
                        </>
                      )}
                    </span>
                    <span className="list-title journal-preview">
                      {e.preview || <span className="muted">{t.shell.onlyMood}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="detail-pane">
        {open ? (
          <JournalDay
            key={open}
            day={open}
            onBack={() => setOpen(null)}
            onDay={pick}
            onReview={() => onReview(open)}
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

interface DayProps {
  day: string;
  onBack(): void;
  onDay(day: string): void;
  onReview(): void;
  onClose(): void;
}

/** One day: the page when it has a file, otherwise the same form that creates it on first use. */
function JournalDay({ day, onBack, onDay, onReview, onClose }: DayProps) {
  const { notes, version, toast, bump } = useApp();
  const path = journalPath(day);
  const [exists, setExists] = useState<boolean | null>(null);
  // What the first action asked for once the file exists: focus the text, or add a section.
  const [start, setStart] = useState<{ focus?: boolean; section?: string }>({});
  useBack(true, onBack);

  useEffect(() => {
    let alive = true;
    notes.exists(path).then(x => alive && setExists(x));
    return () => {
      alive = false;
    };
  }, [notes, path, version]);

  const create = async (data: { mood?: Mood }, how: { focus?: boolean; section?: string }) => {
    try {
      const n = await openDay(notes, "journal", day);
      if (data.mood) await notes.save(n, { ...n.data, mood: data.mood }, n.body);
      setStart(how);
      setExists(true);
      bump();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  const today = isoDate();
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
      <button className="btn ghost icon" aria-label={t.journal.reviewOfDay} title={t.journal.reviewOfDay} onClick={onReview}>
        <Scale size={18} />
      </button>
      {extra}
    </div>
  );

  const head = (
    <div className="journal-head">
      <h2 className="journal-date">{cap(LONG().format(at(day)))}</h2>
      {day === today && <span className="muted small">{t.journal.today}</span>}
    </div>
  );

  if (exists === null) return <div className="note-editor">{bar("")}</div>;

  if (!exists)
    return (
      <div className="note-editor">
        {bar("")}
        <div className="page task-page">
          <div className="page-inner stack">
            {head}
            <span className="fl">{t.journal.dayWas}</span>
            <MoodPicker onPick={m => m && create({ mood: m }, {})} />
            <button className="journal-empty" onClick={() => create({}, { focus: true })}>
              {t.journal.writeAbout}
            </button>
            <SectionButtons body="" onAdd={s => create({}, { section: s })} />
            <DayActions onClose={onClose} />
          </div>
        </div>
      </div>
    );

  return <DayPage path={path} head={head} bar={bar} start={start} onClose={onClose} onGone={() => setExists(false)} />;
}

function SectionButtons({ body, onAdd }: { body: string; onAdd(s: string): void }) {
  const have = sectionsOf(body);
  const missing = JOURNAL_SECTIONS.filter(s => !have.some(h => isWord(s, h))).map(word);
  if (!missing.length) return null;
  return (
    <div className="row idea-sections" aria-label={t.ideas.addSection}>
      {missing.map(s => (
        <button key={s} className="btn ghost" onClick={() => onAdd(s)}>
          <Plus size={16} /> {s}
        </button>
      ))}
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

interface PageProps {
  path: string;
  head: ReactNode;
  bar(status: string, extra?: ReactNode): ReactNode;
  start: { focus?: boolean; section?: string };
  onClose(): void;
  onGone(): void;
}

function DayPage({ path, head, bar, start, onClose, onGone }: PageProps) {
  const { notes, bump, toast, confirmDelete } = useApp();
  const f = useNoteFile(path, { removeIfEmpty: isEmptyDay });
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const remove = async () => {
    if (!(await confirmDelete())) return;
    try {
      await f.saveNow();
      const trashed = await moveToTrash(notes.storage, path);
      onGone();
      bump();
      toast({
        text: t.journal.deleted,
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
          <button className="btn ghost icon" aria-label={t.journal.deleteEntry} title={t.common.delete} onClick={remove}>
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
        f.note && <DayForm key={f.rev} file={f} note={f.note} head={head} start={f.rev <= 1 ? start : {}} onClose={onClose} />
      )}
      {f.dialog}
    </div>
  );
}

function DayForm(props: { file: NoteFile; note: Note; head: ReactNode; start: PageProps["start"]; onClose(): void }) {
  const { file: f, note, start } = props;
  const [mood, setMood] = useState(MOODS.find(m => m.id === note.data.mood)?.id);
  const [body, setBody] = useState(() => (start.section ? addSection(note.body, start.section) : note.body));
  const [rev, setRev] = useState(0);

  // A section asked for before the file existed is written right away.
  useEffect(() => {
    if (start.section) f.setBody(body);
  }, []);

  const add = (s: string) => {
    const next = addSection(body, s);
    setBody(next);
    setRev(r => r + 1);
    f.setBody(next);
  };

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        {props.head}
        <span className="fl">{t.journal.dayWas}</span>
        <MoodPicker
          mood={mood}
          onPick={m => {
            setMood(m);
            f.setData({ mood: m });
          }}
        />
        <div className="task-notes journal-text">
          <Editor
            key={rev}
            text={body}
            autoFocus={rev > 0 || !!start.focus || !!start.section}
            placeholder={t.journal.writeAbout}
            onSaveNow={f.saveNow}
            onChange={text => {
              setBody(text);
              f.setBody(text);
            }}
          />
        </div>
        <SectionButtons body={body} onAdd={add} />
        <DayActions onClose={props.onClose} />
      </div>
    </div>
  );
}

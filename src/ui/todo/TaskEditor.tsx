import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, Check, ListPlus, RotateCcw, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { addDays, isoDate, parseLocal, slugify } from "../../data/dates";
import type { Data } from "../../data/frontmatter";
import type { TodoList } from "../../data/lists";
import { parseQuickAdd } from "../../data/quickadd";
import { describeRule, firstOnOrAfter, formatRule, parseRule, pinRule } from "../../data/recur";
import { dayLabel, joinTitle, splitTitle, toTask } from "../../data/todo";
import type { Note } from "../../data/notes";
import { reminderOf } from "../../data/reminders";
import { useApp } from "../context";
import { AskText } from "../Dialog";
import { useBack } from "../useBack";
import { STATUS_TEXT, useNoteFile, type NoteFile } from "../useNoteFile";
import { ScheduleDialog } from "./Schedule";

// The task screen (SPEC 5.3): title, when / evening / time / due / repeat, list, priority,
// notes with one level of subtasks ("- [ ]" lines). Everything is saved as you go.

interface Props {
  path: string;
  lists: TodoList[];
  ensureList(id: string, name: string): Promise<string>;
  onBack(): void;
  /** Done / canceled / reopen go through the list, which handles repeats and undo. */
  onFinish(status: "done" | "canceled"): void;
  onReopen(): void;
  onDelete(): void;
}

export function TaskEditor(props: Props) {
  const f = useNoteFile(props.path);
  useBack(true, props.onBack);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={props.onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? STATUS_TEXT[f.status] : ""}
        </span>
        {f.note && (
          <button
            className="btn ghost icon"
            aria-label="Delete task"
            title="Delete"
            onClick={() => f.saveNow().then(props.onDelete)}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      {f.gone ? (
        <div className="page">
          <div className="page-inner">
            <p className="err">{f.gone}</p>
          </div>
        </div>
      ) : (
        f.note && <TaskForm key={f.rev} file={f} note={f.note} {...props} />
      )}
      {f.dialog}
    </div>
  );
}

const PRIOS: [number | undefined, string][] = [
  [undefined, "None"],
  [1, "High"],
  [2, "Medium"],
  [3, "Low"],
];

function TaskForm({ file: f, note, lists, ensureList, onFinish, onReopen }: Props & { file: NoteFile; note: Note }) {
  const split = splitTitle(note.body);
  const [title, setTitle] = useState(split.title);
  const [d, setD] = useState<Data>(note.data);
  const [rest, setRest] = useState(split.rest);
  const [notesRev, setNotesRev] = useState(0);
  const [picking, setPicking] = useState(false);
  const [newList, setNewList] = useState(false);
  const restRef = useRef(split.rest);
  const titleRef = useRef(split.title);

  const t = toTask({ ...note, data: d, body: joinTitle(title, rest) });
  const open = t.status === "open";
  const rule = t.repeat ? parseRule(t.repeat) : null;
  const [repeatText, setRepeatText] = useState(rule ? describeRule(rule) : "");
  const [repeatErr, setRepeatErr] = useState(false);

  const patch = (p: Data) => {
    setD(old => ({ ...old, ...p }));
    f.setData(p);
  };
  const writeBody = () => f.setBody(joinTitle(titleRef.current, restRef.current));

  const commitRepeat = () => {
    const text = repeatText.trim();
    if (!text) {
      setRepeatErr(false);
      if (t.repeat) patch({ repeat: undefined });
      return;
    }
    const q = parseQuickAdd(/^every\b|^(daily|weekly|monthly|yearly|annually)\b/i.test(text) ? text : `every ${text}`);
    if (!q.repeat) return setRepeatErr(true);
    setRepeatErr(false);
    const r = parseRule(q.repeat)!;
    // A repeating task needs a date to count from: without one it starts on its first day.
    const start = parseLocal(t.when) ?? firstOnOrAfter(r, parseLocal(isoDate())!);
    const value = formatRule(pinRule(r, start));
    setRepeatText(describeRule(parseRule(value)!));
    patch({ repeat: value, ...(t.when && t.when !== "someday" ? {} : { when: isoDate(start) }) });
  };

  const addSubtask = () => {
    const base = restRef.current.replace(/\s+$/, "");
    const next = `${base}${base ? "\n" : ""}- [ ] `;
    restRef.current = next;
    setRest(next);
    setNotesRev(r => r + 1);
    writeBody();
  };

  const whenLabel = !t.when
    ? "No date"
    : t.when === "someday"
      ? "Someday"
      : `${dayLabel(t.when)}${t.evening ? " · Evening" : ""}`;

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <div className="task-head">
          <button
            className={`check big${!open ? " on" : ""}${t.priority ? ` p${t.priority}` : ""}`}
            role="checkbox"
            aria-checked={!open}
            aria-label={open ? "Mark as done" : "Mark as not done"}
            onClick={() => (open ? onFinish("done") : onReopen())}
          >
            {!open && <Check size={16} strokeWidth={3} />}
          </button>
          <textarea
            className={`task-title-input${t.status === "canceled" ? " canceled" : ""}`}
            rows={1}
            value={title}
            placeholder="Task title"
            aria-label="Title"
            onChange={e => {
              const v = e.target.value.replace(/\n/g, " ");
              setTitle(v);
              titleRef.current = v;
              writeBody();
            }}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
          />
        </div>

        {!open && (
          <p className="muted task-closed">
            {t.status === "done" ? "Done" : "Canceled"}
            {t.doneAt ? ` · ${t.doneAt.replace("T", " ")}` : ""}
          </p>
        )}

        <div className="task-fields">
          <span className="fl">When</span>
          <button className="btn field-btn" onClick={() => setPicking(true)}>
            {whenLabel}
          </button>

          <span className="fl">Time</span>
          <div className="row">
            <input
              type="time"
              className="field"
              value={t.time ?? ""}
              onChange={e => patch({ time: e.target.value || undefined })}
            />
          </div>

          <span className="fl">Reminder</span>
          <ReminderField task={t} patch={patch} />

          <span className="fl">Deadline</span>
          <div className="row">
            <input
              type="date"
              className="field"
              value={t.due ?? ""}
              onChange={e => patch({ due: e.target.value || undefined })}
            />
          </div>

          <span className="fl">Repeat</span>
          <div className="stack" style={{ gap: 4 }}>
            <input
              className={`field${repeatErr ? " bad" : ""}`}
              value={repeatText}
              placeholder="e.g. every monday, every 2 weeks"
              onChange={e => setRepeatText(e.target.value)}
              onBlur={commitRepeat}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLElement).blur()}
            />
            {repeatErr && (
              <span className="err small">
                Not understood. Try “every day”, “every mon and thu”, “every month on the 5th”.
              </span>
            )}
          </div>

          <span className="fl">List</span>
          <select
            className="field"
            value={t.list ?? ""}
            onChange={e =>
              e.target.value === "\u0000new" ? setNewList(true) : patch({ list: e.target.value || undefined })
            }
          >
            <option value="">No list</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value={"\u0000new"}>New list…</option>
          </select>

          <span className="fl">Priority</span>
          <div className="segmented">
            {PRIOS.map(([p, label]) => (
              <button key={label} aria-pressed={t.priority === p} onClick={() => patch({ priority: p })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="task-notes-head">
          <span className="fl">Notes and subtasks</span>
          <button className="btn ghost" onClick={addSubtask}>
            <ListPlus size={18} /> Subtask
          </button>
        </div>
        <div className="task-notes">
          <Editor
            key={notesRev}
            text={rest}
            autoFocus={notesRev > 0}
            placeholder="Notes…"
            onSaveNow={f.saveNow}
            onChange={text => {
              restRef.current = text;
              writeBody();
            }}
          />
        </div>

        <div className="row task-actions">
          {open ? (
            <button className="btn" onClick={() => onFinish("canceled")}>
              <Ban size={18} /> Cancel task
            </button>
          ) : (
            <button className="btn" onClick={onReopen}>
              <RotateCcw size={18} /> Reopen
            </button>
          )}
          <span className="muted small mono">Created {String(d.created ?? "").replace("T", " ")}</span>
        </div>
      </div>

      {picking && (
        <ScheduleDialog
          current={{ when: t.when, evening: t.evening }}
          onPick={w => patch({ when: w.when, evening: w.evening || undefined })}
          onClose={() => setPicking(false)}
        />
      )}
      {newList && (
        <AskText
          title="New list"
          placeholder="e.g. Home"
          okLabel="Create"
          onClose={() => setNewList(false)}
          onOk={async name => {
            setNewList(false);
            patch({ list: await ensureList(slugify(name), name) });
          }}
        />
      )}
    </div>
  );
}

/**
 * Reminder (SPEC 5.3): by default a task with a date and a time reminds at that time. It can be
 * turned off (`remind: none`) or set to any other moment (`remind: <date>T<time>`).
 */
function ReminderField({ task: t, patch }: { task: ReturnType<typeof toTask>; patch(p: Data): void }) {
  const { platform } = useApp();
  const [blocked, setBlocked] = useState(false);
  const hasAuto = !!t.time && !!t.when && t.when !== "someday";
  const mode = t.remind === "none" ? "none" : t.remind ? "custom" : hasAuto ? "auto" : "none";
  const at = reminderOf(t);

  // Shown only when a reminder is set but Android does not allow notifications.
  useEffect(() => {
    if (!at || !platform.reminderAccess) return setBlocked(false);
    let alive = true;
    const check = () => platform.reminderAccess!().then(a => alive && setBlocked(!a.notifications));
    check();
    const stop = platform.onResume?.(check);
    return () => {
      alive = false;
      stop?.();
    };
  }, [at, platform]);

  const choose = (m: string) => {
    if (m === "none") patch({ remind: hasAuto ? "none" : undefined });
    else if (m === "auto") patch({ remind: undefined });
    else {
      const day = t.when && t.when !== "someday" ? t.when : isoDate(addDays(new Date(), 1));
      patch({ remind: at ?? `${day}T${t.time ?? "09:00"}` });
    }
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <select className="field" value={mode} onChange={e => choose(e.target.value)} aria-label="Reminder">
        <option value="none">None</option>
        <option value="auto" disabled={!hasAuto}>
          {hasAuto ? `At the task time (${t.time})` : "At the task time (set a date and time)"}
        </option>
        <option value="custom">Other time…</option>
      </select>
      {mode === "custom" && (
        <input
          type="datetime-local"
          className="field"
          value={t.remind}
          aria-label="Reminder time"
          onChange={e => e.target.value && patch({ remind: e.target.value.slice(0, 16) })}
        />
      )}
      {blocked && (
        <div className="row">
          <span className="err small">Notifications are off for Hypomnemata.</span>
          <button className="btn" onClick={() => platform.askNotifications?.()}>
            Allow
          </button>
        </div>
      )}
    </div>
  );
}

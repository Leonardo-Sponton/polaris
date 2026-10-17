import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { ArrowLeft, Ban, Check, ListPlus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { addDays, isoDate, parseLocal, slugify } from "../../data/dates";
import type { Data } from "../../data/frontmatter";
import type { TodoList } from "../../data/lists";
import { asRepeat, parseQuickAdd } from "../../data/quickadd";
import { describeRule, firstOnOrAfter, formatRule, parseRule, pinRule } from "../../data/recur";
import { dayLabel, joinTitle, splitTitle, toTask } from "../../data/todo";
import type { Note } from "../../data/notes";
import type { Project } from "../../data/projects";
import { reminderOf } from "../../data/reminders";
import { useApp } from "../context";
import { AskText } from "../Dialog";
import { useFiveW2H } from "../FiveW2H";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { ScheduleDialog } from "./Schedule";

// The task screen (SPEC 5.3): title, when / evening / time / due / repeat, list, priority,
// notes with one level of subtasks ("- [ ]" lines). Everything is saved as you go.

interface Props {
  path: string;
  lists: TodoList[];
  /** For the Project and Step fields. */
  projects: Project[];
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
        <button className="btn ghost icon back" onClick={props.onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? t.note.status[f.status] : ""}
        </span>
        {f.note && (
          <button
            className="btn ghost icon"
            aria-label={t.todo.deleteTask}
            title={t.common.delete}
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

const PRIOS = [undefined, 1, 2, 3] as const;

function TaskForm({ file: f, note, lists, projects, ensureList, onFinish, onReopen }: Props & { file: NoteFile; note: Note }) {
  const split = splitTitle(note.body);
  const [title, setTitle] = useState(split.title);
  const [d, setD] = useState<Data>(note.data);
  const [notesRev, setNotesRev] = useState(0);
  const [picking, setPicking] = useState(false);
  const [newList, setNewList] = useState(false);
  const titleRef = useRef(split.title);
  const writeBody = () => f.setBody(joinTitle(titleRef.current, w.body()));
  const w = useFiveW2H(split.rest, writeBody);
  const [rest, setRest] = useState(w.initialText);

  const k = toTask({ ...note, data: d, body: joinTitle(title, rest) });
  const open = k.status === "open";
  const rule = k.repeat ? parseRule(k.repeat) : null;
  const [repeatText, setRepeatText] = useState(rule ? describeRule(rule) : "");
  const [repeatErr, setRepeatErr] = useState(false);

  const patch = (p: Data) => {
    setD(old => ({ ...old, ...p }));
    f.setData(p);
  };

  const commitRepeat = () => {
    const text = repeatText.trim();
    if (!text) {
      setRepeatErr(false);
      if (k.repeat) patch({ repeat: undefined });
      return;
    }
    const q = parseQuickAdd(asRepeat(text));
    if (!q.repeat) return setRepeatErr(true);
    setRepeatErr(false);
    const r = parseRule(q.repeat)!;
    // A repeating task needs a date to count from: without one it starts on its first day.
    const start = parseLocal(k.when) ?? firstOnOrAfter(r, parseLocal(isoDate())!);
    const value = formatRule(pinRule(r, start));
    setRepeatText(describeRule(parseRule(value)!));
    patch({ repeat: value, ...(k.when && k.when !== "someday" ? {} : { when: isoDate(start) }) });
  };

  const addSubtask = () => {
    const base = w.text().replace(/\s+$/, "");
    const next = `${base}${base ? "\n" : ""}- [ ] `;
    w.setText(next);
    setRest(next);
    setNotesRev(r => r + 1);
    writeBody();
  };

  const whenLabel = !k.when
    ? t.todo.noDate
    : k.when === "someday"
      ? t.todo.views.someday
      : `${dayLabel(k.when)}${k.evening ? t.todo.eveningSuffix : ""}`;

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <div className="task-head">
          <button
            className={`check big${!open ? " on" : ""}${k.priority ? ` p${k.priority}` : ""}`}
            role="checkbox"
            aria-checked={!open}
            aria-label={open ? t.todo.markDone : t.todo.markNotDone}
            onClick={() => (open ? onFinish("done") : onReopen())}
          >
            {!open && <Check size={16} strokeWidth={3} />}
          </button>
          <textarea
            className={`task-title-input${k.status === "canceled" ? " canceled" : ""}`}
            rows={1}
            value={title}
            placeholder={t.todo.titlePlaceholder}
            aria-label={t.todo.title}
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
            {k.status === "done" ? t.todo.done : t.todo.canceled}
            {k.doneAt ? ` · ${k.doneAt.replace("T", " ")}` : ""}
          </p>
        )}

        <div className="task-fields">
          <span className="fl">{t.todo.fWhen}</span>
          <button className="btn field-btn" onClick={() => setPicking(true)}>
            {whenLabel}
          </button>

          <span className="fl">{t.todo.fTime}</span>
          <div className="row">
            <input
              type="time"
              className="field"
              value={k.time ?? ""}
              onChange={e => patch({ time: e.target.value || undefined })}
            />
          </div>

          <span className="fl">{t.todo.fReminder}</span>
          <ReminderField task={k} patch={patch} />

          <span className="fl">{t.todo.fDeadline}</span>
          <div className="row">
            <input
              type="date"
              className="field"
              value={k.due ?? ""}
              onChange={e => patch({ due: e.target.value || undefined })}
            />
          </div>

          <span className="fl">{t.todo.fRepeat}</span>
          <div className="stack" style={{ gap: 4 }}>
            <input
              className={`field${repeatErr ? " bad" : ""}`}
              value={repeatText}
              placeholder={t.todo.repeatEg}
              onChange={e => setRepeatText(e.target.value)}
              onBlur={commitRepeat}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLElement).blur()}
            />
            {repeatErr && (
              <span className="err small">
                {t.todo.repeatBad}
              </span>
            )}
          </div>

          <span className="fl">{t.todo.fList}</span>
          <select
            className="field"
            value={k.list ?? ""}
            onChange={e =>
              e.target.value === "\u0000new" ? setNewList(true) : patch({ list: e.target.value || undefined })
            }
          >
            <option value="">{t.todo.noList}</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value={"\u0000new"}>{t.todo.newListDots}</option>
          </select>

          <ProjectField task={k} projects={projects} patch={patch} />

          <span className="fl">{t.todo.fPriority}</span>
          <div className="segmented">
            {PRIOS.map(p => (
              <button key={p ?? 0} aria-pressed={k.priority === p} onClick={() => patch({ priority: p })}>
                {t.todo.prio[p ?? "none"]}
              </button>
            ))}
          </div>
        </div>

        <div className="task-notes-head">
          <span className="fl">{t.todo.notesAndSubtasks}</span>
          <div className="row" style={{ gap: 2 }}>
            {!w.has && (
              <button className="btn ghost" onClick={w.insert}>
                <Plus size={18} /> 5W2H
              </button>
            )}
            <button className="btn ghost" onClick={addSubtask}>
              <ListPlus size={18} /> {t.todo.subtask}
            </button>
          </div>
        </div>
        <div className="task-notes">
          <Editor
            key={notesRev}
            text={rest}
            autoFocus={notesRev > 0}
            placeholder={t.todo.notes}
            onSaveNow={f.saveNow}
            commands={{ "5w2h": w.insert }}
            onChange={text => {
              w.setText(text);
              writeBody();
            }}
          />
        </div>
        {w.form}

        <div className="row task-actions">
          {open ? (
            <button className="btn" onClick={() => onFinish("canceled")}>
              <Ban size={18} /> {t.todo.cancelTask}
            </button>
          ) : (
            <button className="btn" onClick={onReopen}>
              <RotateCcw size={18} /> {t.todo.reopen}
            </button>
          )}
          <span className="muted small mono">{t.todo.created(String(d.created ?? "").replace("T", " "))}</span>
        </div>
      </div>

      {picking && (
        <ScheduleDialog
          current={{ when: k.when, evening: k.evening }}
          onPick={w => patch({ when: w.when, evening: w.evening || undefined })}
          onClose={() => setPicking(false)}
        />
      )}
      {newList && (
        <AskText
          title={t.todo.newList}
          placeholder={t.todo.newListEg}
          okLabel={t.todo.create}
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
 * Project and step (SPEC 5.5): a project task shows up under its step on the project page.
 * Picking a project puts the task on the project's current step.
 */
function ProjectField({ task: k, projects, patch }: { task: ReturnType<typeof toTask>; projects: Project[]; patch(p: Data): void }) {
  const p = projects.find(x => x.slug === k.project);
  const choices = projects.filter(x => x === p || x.status === "active" || x.status === "on-hold");
  return (
    <>
      <span className="fl">{t.todo.fProject}</span>
      <select
        className="field"
        value={k.project ?? ""}
        aria-label={t.todo.fProject}
        onChange={e => {
          const to = projects.find(x => x.slug === e.target.value);
          patch(to ? { project: to.slug, step: to.step.id } : { project: undefined, step: undefined });
        }}
      >
        <option value="">{t.todo.noProject}</option>
        {k.project && !p && <option value={k.project}>{t.todo.notFound(k.project)}</option>}
        {choices.map(x => (
          <option key={x.slug} value={x.slug}>
            {x.title || x.slug}
          </option>
        ))}
      </select>
      {p && (
        <>
          <span className="fl">{t.todo.fStep}</span>
          <select
            className="field"
            value={k.step ?? ""}
            aria-label={t.todo.fStep}
            onChange={e => patch({ step: e.target.value || undefined })}
          >
            <option value="">{t.todo.noStep}</option>
            {k.step && !p.flow.steps.some(s => s.id === k.step) && <option value={k.step}>{k.step}</option>}
            {p.flow.steps.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.name}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
}

/**
 * Reminder (SPEC 5.3): by default a task with a date and a time reminds at that time. It can be
 * turned off (`remind: none`) or set to any other moment (`remind: <date>T<time>`).
 */
function ReminderField({ task: k, patch }: { task: ReturnType<typeof toTask>; patch(p: Data): void }) {
  const { platform } = useApp();
  const [blocked, setBlocked] = useState(false);
  const hasAuto = !!k.time && !!k.when && k.when !== "someday";
  const mode = k.remind === "none" ? "none" : k.remind ? "custom" : hasAuto ? "auto" : "none";
  const at = reminderOf(k);

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
      const day = k.when && k.when !== "someday" ? k.when : isoDate(addDays(new Date(), 1));
      patch({ remind: at ?? `${day}T${k.time ?? "09:00"}` });
    }
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <select className="field" value={mode} onChange={e => choose(e.target.value)} aria-label={t.todo.fReminder}>
        <option value="none">{t.todo.remindNone}</option>
        <option value="auto" disabled={!hasAuto}>
          {hasAuto ? t.todo.remindAuto(k.time!) : t.todo.remindAutoOff}
        </option>
        <option value="custom">{t.todo.remindOther}</option>
      </select>
      {mode === "custom" && (
        <input
          type="datetime-local"
          className="field"
          value={k.remind}
          aria-label={t.todo.remindTime}
          onChange={e => e.target.value && patch({ remind: e.target.value.slice(0, 16) })}
        />
      )}
      {blocked && (
        <div className="row">
          <span className="err small">{t.todo.notificationsOff}</span>
          <button className="btn" onClick={() => platform.askNotifications?.()}>
            {t.settings.allow}
          </button>
        </div>
      )}
    </div>
  );
}

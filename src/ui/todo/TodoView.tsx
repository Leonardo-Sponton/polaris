import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, BookCheck, CalendarDays, Layers, Palette, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { isoDate, slugify } from "../../data/dates";
import type { Data } from "../../data/frontmatter";
import { LIST_COLORS } from "../../data/lists";
import { flushAll } from "../../data/pending";
import type { Capture } from "../../data/inbox";
import type { QuickAdd as Parsed } from "../../data/quickadd";
import {
  createTask,
  dayLabel,
  finishTask,
  inView,
  reopenTask,
  sections,
  toTask,
  undoFinish,
  updateTask,
  type Task,
  type View,
} from "../../data/todo";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { AskText, Confirm } from "../Dialog";
import { useApp } from "../context";
import { QuickAdd } from "./QuickAdd";
import { ScheduleDialog } from "./Schedule";
import { TaskEditor } from "./TaskEditor";
import { TaskMenu } from "./TaskMenu";
import { TaskRow } from "./TaskRow";
import type { TodoData } from "./useTodo";

// To-do (SPEC 5.3): Things-style lists on the left, the task screen on the right
// (one at a time on the phone).

export const VIEWS: { id: Exclude<View, object>; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <Star size={18} /> },
  { id: "upcoming", label: "Upcoming", icon: <CalendarDays size={18} /> },
  { id: "anytime", label: "Anytime", icon: <Layers size={18} /> },
  { id: "someday", label: "Someday", icon: <Archive size={18} /> },
  { id: "logbook", label: "Logbook", icon: <BookCheck size={18} /> },
];

export const sameView = (a: View, b: View) =>
  typeof a === "object" && typeof b === "object" ? a.list === b.list : a === b;

const EMPTY: Record<string, string> = {
  today: "Nothing for today. Add a task above.",
  upcoming: "Nothing planned. Tasks with a future date show up here.",
  anytime: "Tasks without a date show up here.",
  someday: "Tasks for some day, maybe. Type “someday” when adding one.",
  logbook: "Finished tasks show up here.",
  list: "No open tasks in this list.",
};

const LOGBOOK_PAGE = 200;

interface Props {
  view: View;
  setView(v: View): void;
  data: TodoData;
  /** The Today start screen (SPEC 5.1): the capture field instead of task entry, no list chips. */
  home?: { onCapture(c: Capture): Promise<boolean>; footer?: ReactNode; focusKey?: number };
  /** A task to open (from Search). */
  openPath?: { path: string; key: number };
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function TodoView({ view, setView, data, home, openPath }: Props) {
  const { notes, bump, toast, platform } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const [menu, setMenu] = useState<Task | null>(null);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [limit, setLimit] = useState(LOGBOOK_PAGE);
  const qa = useRef<HTMLTextAreaElement>(null);
  const now = new Date();
  const today = isoDate(now);

  const list = typeof view === "object" ? data.lists.find(l => l.id === view.list) : undefined;
  const label = list ? list.name : VIEWS.find(v => v.id === view)!.label;

  // Ctrl+N: new task (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen(null);
        qa.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setLimit(LOGBOOK_PAGE), [view]);

  useEffect(() => {
    if (openPath) setOpen(openPath.path);
  }, [openPath]);

  // The Android "Capture" shortcut asks for the field (focusKey changes each time).
  useEffect(() => {
    if (!home?.focusKey) return;
    setOpen(null);
    qa.current?.focus();
    platform.showKeyboard?.();
  }, [home?.focusKey, platform]);

  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const add = async (q: Parsed) => {
    try {
      const d: Data = {
        when: q.when,
        evening: q.evening,
        time: q.time,
        repeat: q.repeat,
        priority: q.priority,
        list: q.list,
      };
      // Adding inside a list puts the task in that list unless the line says otherwise.
      if (!d.when && view === "today") d.when = today;
      if (!d.when && view === "someday") d.when = "someday";
      if (!d.list && list) d.list = list.id;
      if (q.list) await data.ensureList(q.list, q.listName ?? q.list);
      const n = await createTask(notes, q.title, d);
      bump();
      if (!inView(toTask(n), view, today)) {
        const where = q.when
          ? q.when === "someday"
            ? "Someday"
            : dayLabel(q.when, now)
          : q.list
            ? `#${q.listName}`
            : "Anytime";
        toast({ text: `Added: ${q.title} · ${where}` });
      }
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const finish = async (path: string, status: "done" | "canceled") => {
    try {
      await flushAll(); // an open task screen writes its last edits first
      const c = await finishTask(notes, path, status);
      bump();
      const next = c.next ? ` · next ${dayLabel(String(c.next.data.when), now)}` : "";
      toast({
        text: `${status === "done" ? "Done" : "Canceled"}${next}`,
        action: {
          label: "Undo",
          run: () => undoFinish(notes, c).then(bump, fail),
        },
      });
    } catch (e) {
      fail(e);
    }
  };

  const reopen = async (path: string) => {
    try {
      await flushAll();
      await reopenTask(notes, path);
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (path: string) => {
    try {
      await flushAll();
      const trashed = await moveToTrash(notes.storage, path);
      if (open === path) setOpen(null);
      bump();
      toast({
        text: "Task deleted",
        action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  const schedule = async (t: Task, w: { when?: string; evening?: boolean }) => {
    try {
      await flushAll();
      await updateTask(notes, t.path, { when: w.when, evening: w.evening || undefined });
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const move = async (t: Task, to: string | undefined) => {
    try {
      await flushAll();
      await updateTask(notes, t.path, { list: to });
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const deleteList = async () => {
    if (!list) return;
    try {
      await flushAll();
      for (const t of data.tasks.filter(t => t.list === list.id)) await updateTask(notes, t.path, { list: undefined });
      await data.saveLists(data.lists.filter(l => l.id !== list.id));
      setView("anytime");
    } catch (e) {
      fail(e);
    }
  };

  const secs = sections(data.tasks, view, today, now);
  const count = secs.reduce((n, s) => n + s.tasks.length, 0);
  let shown = 0;
  const placeholder =
    view === "today"
      ? "Add to Today…"
      : list
        ? `Add to ${list.name}…`
        : view === "someday"
          ? "Add to Someday…"
          : "Add a task…";

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        {!home && (
        <nav className="todo-nav" aria-label="To-do lists">
          {VIEWS.map(v => (
            <button key={v.id} className={`chip${sameView(view, v.id) ? " active" : ""}`} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
          {data.lists.map(l => (
            <button
              key={l.id}
              className={`chip${sameView(view, { list: l.id }) ? " active" : ""}`}
              onClick={() => setView({ list: l.id })}
            >
              <span className="dot" style={{ background: `var(--${l.color})` }} />
              {l.name}
            </button>
          ))}
          <NewListButton data={data} setView={setView} className="chip" />
        </nav>
        )}

        <div className="list-head">
          {home ? (
            <div>
              <h1>Today</h1>
              <div className="muted mono head-sub">{LONG_DATE.format(now)}</div>
            </div>
          ) : (
            <h1>{label}</h1>
          )}
          {list && (
            <div className="row" style={{ gap: 2 }}>
              <button
                className="btn ghost icon"
                title="Change color"
                aria-label="Change color"
                onClick={() => {
                  const c = LIST_COLORS[(LIST_COLORS.indexOf(list.color) + 1) % LIST_COLORS.length];
                  data.saveLists(data.lists.map(l => (l.id === list.id ? { ...l, color: c } : l))).catch(fail);
                }}
              >
                <Palette size={18} style={{ color: `var(--${list.color})` }} />
              </button>
              <button
                className="btn ghost icon"
                title="Rename"
                aria-label="Rename list"
                onClick={() => setDialog("rename")}
              >
                <Pencil size={18} />
              </button>
              <button
                className="btn ghost icon"
                title="Delete list"
                aria-label="Delete list"
                onClick={() => setDialog("delete")}
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>

        {home ? (
          <QuickAdd ref={qa} placeholder="Capture… (t = to-do, #list, date)" onCapture={home.onCapture} />
        ) : (
          view !== "logbook" && <QuickAdd ref={qa} placeholder={placeholder} onAdd={add} />
        )}

        {data.loaded && count === 0 && <p className="muted empty-note">{EMPTY[list ? "list" : (view as string)]}</p>}

        {secs.map(s => {
          if (view === "logbook" && shown >= limit) return null;
          const tasks = view === "logbook" ? s.tasks.slice(0, limit - shown) : s.tasks;
          shown += tasks.length;
          return (
            <section key={s.key} className="task-section">
              {s.label && (s.key !== "today" || secs.length > 1) && (
                <h3 className={`section-head${s.key === "overdue" ? " late" : ""}`}>{s.label}</h3>
              )}
              <ul className="list">
                {tasks.map(t => (
                  <TaskRow
                    key={t.path}
                    task={t}
                    today={today}
                    lists={data.lists}
                    active={open === t.path}
                    hideDay={view === "upcoming" || (view === "today" && s.key !== "overdue") || view === "logbook"}
                    onOpen={() => setOpen(t.path)}
                    onToggle={() => (t.status === "open" ? finish(t.path, "done") : reopen(t.path))}
                    onSchedule={() => setScheduling(t)}
                    onMenu={() => setMenu(t)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        {home?.footer}
        {view === "logbook" && count > limit && (
          <button className="btn ghost" onClick={() => setLimit(l => l + LOGBOOK_PAGE)}>
            Show more
          </button>
        )}
      </div>

      <div className="detail-pane">
        {open ? (
          <TaskEditor
            key={open}
            path={open}
            lists={data.lists}
            ensureList={data.ensureList}
            onBack={() => setOpen(null)}
            onFinish={s => finish(open, s)}
            onReopen={() => reopen(open)}
            onDelete={() => remove(open)}
          />
        ) : (
          <div className="detail-empty muted">Pick a task, or add one with the field on the left.</div>
        )}
      </div>

      {menu && (
        <TaskMenu
          task={menu}
          lists={data.lists}
          onOpen={() => setOpen(menu.path)}
          onToggle={() => (menu.status === "open" ? finish(menu.path, "done") : reopen(menu.path))}
          onSchedule={() => setScheduling(menu)}
          onMove={to => move(menu, to)}
          onCancelTask={() => finish(menu.path, "canceled")}
          onDelete={() => remove(menu.path)}
          onClose={() => setMenu(null)}
        />
      )}
      {scheduling && (
        <ScheduleDialog
          current={{ when: scheduling.when, evening: scheduling.evening }}
          onPick={w => schedule(scheduling, w)}
          onClose={() => setScheduling(null)}
        />
      )}
      {dialog === "rename" && list && (
        <AskText
          title="Rename list"
          initial={list.name}
          okLabel="Rename"
          onClose={() => setDialog(null)}
          onOk={name => {
            setDialog(null);
            data.saveLists(data.lists.map(l => (l.id === list.id ? { ...l, name } : l))).catch(fail);
          }}
        />
      )}
      {dialog === "delete" && list && (
        <Confirm
          title={`Delete “${list.name}”?`}
          text="Its tasks are kept; they just leave the list."
          okLabel="Delete list"
          onClose={() => setDialog(null)}
          onOk={() => {
            setDialog(null);
            deleteList();
          }}
        />
      )}
    </div>
  );
}

export function NewListButton({
  data,
  setView,
  className,
}: {
  data: TodoData;
  setView(v: View): void;
  className: string;
}) {
  const [asking, setAsking] = useState(false);
  const { toast } = useApp();
  return (
    <>
      <button className={className} onClick={() => setAsking(true)}>
        <Plus size={16} />
        <span className="label">New list</span>
      </button>
      {asking && (
        <AskText
          title="New list"
          placeholder="e.g. Home"
          okLabel="Create"
          onClose={() => setAsking(false)}
          onOk={async name => {
            setAsking(false);
            try {
              setView({ list: await data.ensureList(slugify(name), name) });
            } catch (e) {
              toast({ text: String(e), error: true });
            }
          }}
        />
      )}
    </>
  );
}

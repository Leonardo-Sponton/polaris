import { useEffect, useRef, useState, type ReactNode } from "react";
import { cap, dateFmt, t } from "../../i18n";
import { Archive, BookCheck, CalendarDays, Layers, Palette, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { isoDate, slugify } from "../../data/dates";
import type { Data } from "../../data/frontmatter";
import { LIST_COLORS } from "../../data/lists";
import { flushAll } from "../../data/pending";
import type { Capture } from "../../data/inbox";
import type { Project } from "../../data/projects";
import type { QuickAdd as Parsed } from "../../data/quickadd";
import { createTask, dayLabel, inView, sections, toTask, updateTask, type Task, type View } from "../../data/todo";
import { AskText, Confirm } from "../Dialog";
import { useApp } from "../context";
import { QuickAdd } from "./QuickAdd";
import { ScheduleDialog } from "./Schedule";
import { TaskEditor } from "./TaskEditor";
import { TaskMenu } from "./TaskMenu";
import { TaskRow } from "./TaskRow";
import { useTaskActions } from "./useTaskActions";
import type { TodoData } from "./useTodo";

// To-do (SPEC 5.3): Things-style lists on the left, the task screen on the right
// (one at a time on the phone).

export const VIEWS: { id: Exclude<View, object>; icon: ReactNode }[] = [
  { id: "today", icon: <Star size={18} /> },
  { id: "upcoming", icon: <CalendarDays size={18} /> },
  { id: "anytime", icon: <Layers size={18} /> },
  { id: "someday", icon: <Archive size={18} /> },
  { id: "logbook", icon: <BookCheck size={18} /> },
];

export const sameView = (a: View, b: View) =>
  typeof a === "object" && typeof b === "object" ? a.list === b.list : a === b;


const LOGBOOK_PAGE = 200;

interface Props {
  view: View;
  setView(v: View): void;
  data: TodoData;
  /** The Today start screen (SPEC 5.1): the capture field instead of task entry, no list chips. */
  home?: { onCapture(c: Capture): Promise<boolean>; footer?: ReactNode; focusKey?: number };
  /** A task to open (from Search). */
  openPath?: { path: string; key: number };
  projects: Project[];
}


export function TodoView({ view, setView, data, home, openPath, projects }: Props) {
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
  const label = list ? list.name : t.todo.views[view as Exclude<View, object>];

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
            ? t.todo.views.someday
            : dayLabel(q.when, now)
          : q.list
            ? `#${q.listName}`
            : t.todo.views.anytime;
        toast({ text: t.todo.added(q.title, where) });
      }
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const { finish, reopen, remove, schedule, move } = useTaskActions(path => setOpen(o => (o === path ? null : o)));

  const deleteList = async () => {
    if (!list) return;
    try {
      await flushAll();
      for (const k of data.tasks.filter(x => x.list === list.id)) await updateTask(notes, k.path, { list: undefined });
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
      ? t.todo.addToday
      : list
        ? t.todo.addTo(list.name)
        : view === "someday"
          ? t.todo.addSomeday
          : t.todo.addTask;

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        {!home && (
        <nav className="todo-nav" aria-label={t.shell.todoLists}>
          {VIEWS.map(v => (
            <button key={v.id} className={`chip${sameView(view, v.id) ? " active" : ""}`} onClick={() => setView(v.id)}>
              {t.todo.views[v.id]}
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
              <h1>{t.area.today}</h1>
              <div className="muted mono head-sub">{cap(dateFmt({ weekday: "long", day: "numeric", month: "long" }).format(now))}</div>
            </div>
          ) : (
            <h1>{label}</h1>
          )}
          {list && (
            <div className="row" style={{ gap: 2 }}>
              <button
                className="btn ghost icon"
                title={t.todo.changeColor}
                aria-label={t.todo.changeColor}
                onClick={() => {
                  const c = LIST_COLORS[(LIST_COLORS.indexOf(list.color) + 1) % LIST_COLORS.length];
                  data.saveLists(data.lists.map(l => (l.id === list.id ? { ...l, color: c } : l))).catch(fail);
                }}
              >
                <Palette size={18} style={{ color: `var(--${list.color})` }} />
              </button>
              <button
                className="btn ghost icon"
                title={t.todo.rename}
                aria-label={t.todo.renameList}
                onClick={() => setDialog("rename")}
              >
                <Pencil size={18} />
              </button>
              <button
                className="btn ghost icon"
                title={t.todo.deleteList}
                aria-label={t.todo.deleteList}
                onClick={() => setDialog("delete")}
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>

        {home ? (
          <QuickAdd ref={qa} placeholder={t.todo.capturePlaceholder} onCapture={home.onCapture} />
        ) : (
          view !== "logbook" && <QuickAdd ref={qa} placeholder={placeholder} onAdd={add} />
        )}

        {data.loaded && count === 0 && (
          <p className="muted empty-note">{t.todo.empty[list ? "list" : (view as Exclude<View, object>)]}</p>
        )}

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
                {tasks.map(k => (
                  <TaskRow
                    key={k.path}
                    task={k}
                    today={today}
                    lists={data.lists}
                    active={open === k.path}
                    hideDay={view === "upcoming" || (view === "today" && s.key !== "overdue") || view === "logbook"}
                    project={k.project && (projects.find(p => p.slug === k.project)?.title || k.project)}
                    onOpen={() => setOpen(k.path)}
                    onToggle={() => (k.status === "open" ? finish(k.path, "done") : reopen(k.path))}
                    onSchedule={() => setScheduling(k)}
                    onMenu={() => setMenu(k)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        {home?.footer}
        {view === "logbook" && count > limit && (
          <button className="btn ghost" onClick={() => setLimit(l => l + LOGBOOK_PAGE)}>
            {t.todo.showMore}
          </button>
        )}
      </div>

      <div className="detail-pane">
        {open ? (
          <TaskEditor
            key={open}
            path={open}
            lists={data.lists}
            projects={projects}
            ensureList={data.ensureList}
            onBack={() => setOpen(null)}
            onFinish={s => finish(open, s)}
            onReopen={() => reopen(open)}
            onDelete={() => remove(open)}
          />
        ) : (
          <div className="detail-empty muted">{t.todo.pickTask}</div>
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
          title={t.todo.renameList}
          initial={list.name}
          okLabel={t.todo.rename}
          onClose={() => setDialog(null)}
          onOk={name => {
            setDialog(null);
            data.saveLists(data.lists.map(l => (l.id === list.id ? { ...l, name } : l))).catch(fail);
          }}
        />
      )}
      {dialog === "delete" && list && (
        <Confirm
          title={t.todo.deleteListTitle(list.name)}
          text={t.todo.deleteListText}
          okLabel={t.todo.deleteList}
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
        <span className="label">{t.todo.newList}</span>
      </button>
      {asking && (
        <AskText
          title={t.todo.newList}
          placeholder={t.todo.newListEg}
          okLabel={t.todo.create}
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

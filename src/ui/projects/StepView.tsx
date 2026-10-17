import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { ArrowLeft, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { isoDate } from "../../data/dates";
import type { Data } from "../../data/frontmatter";
import { loadStepNotes, projectTasks, stepNumber, type Project, type StepNote } from "../../data/projects";
import type { QuickAdd as Parsed } from "../../data/quickadd";
import { compareTasks, createTask, type Task } from "../../data/todo";
import { useApp } from "../context";
import { QuickAdd } from "../todo/QuickAdd";
import { ScheduleDialog } from "../todo/Schedule";
import { TaskMenu } from "../todo/TaskMenu";
import { TaskRow } from "../todo/TaskRow";
import { useTaskActions } from "../todo/useTaskActions";
import type { TodoData } from "../todo/useTodo";
import { useBack } from "../useBack";

// One step of a project (SPEC 5.5): what the step is about, its to-dos (ordinary tasks with
// `project:` and `step:`, so they also show in the To-do lists) and its notes in creation order.

/** A project's step notes, reloaded whenever data on disk changes. */
export function useStepNotes(dir: string): StepNote[] {
  const { notes, version } = useApp();
  const [list, setList] = useState<StepNote[]>([]);
  useEffect(() => {
    let alive = true;
    loadStepNotes(notes, dir).then(l => alive && setList(l), () => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [notes, version, dir]);
  return list;
}

interface Props {
  project: Project;
  stepId: string;
  onBack(): void;
  todo: TodoData;
  onOpenNote(path: string): void;
  onNewNote(): void;
  onOpenTask(path: string): void;
}

export function StepView({ project: p, stepId, todo, onBack, onOpenNote, onNewNote, onOpenTask }: Props) {
  useBack(true, onBack);
  const all = useStepNotes(p.dir);
  const list = all.filter(n => n.step === stepId);
  const step = p.flow.steps.find(s => s.id === stepId);
  const n = stepNumber(p.flow, stepId);

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label={t.projects.backToProject}>
          <ArrowLeft size={20} />
        </button>
        <span className="quote-book muted small">{p.title}</span>
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <div>
            <span className="fl">{n ? t.projects.stepOf(n, p.flow.steps.length) : t.projects.notInFlow}</span>
            <h2 className="step-title">{step?.name ?? stepId}</h2>
          </div>
          {step?.guidance && <p className="step-guidance">{step.guidance}</p>}
          {step && step.sections.length > 0 && (
            <p className="muted small">{t.projects.suggested(step.sections.join(" · "))}</p>
          )}

          <StepTodos project={p} stepId={stepId} todo={todo} onOpen={onOpenTask} />

          <div className="task-notes-head">
            <span className="fl">{t.projects.notesCount}{list.length > 0 && ` · ${list.length}`}</span>
            <button className="btn ghost" onClick={onNewNote}>
              <Plus size={16} /> {t.projects.newNoteBtn}
            </button>
          </div>
          {list.length === 0 ? (
            <p className="muted small">{t.projects.noNotes}</p>
          ) : (
            <ul className="list">
              {list.map(x => (
                <li key={x.path}>
                  <button className="list-item" onClick={() => onOpenNote(x.path)}>
                    <span className="list-title">{x.title || <span className="muted">{t.common.untitled}</span>}</span>
                    <span className="list-meta mono">{x.created.replace("T", " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StepTodos({ project: p, stepId, todo, onOpen }: { project: Project; stepId: string; todo: TodoData; onOpen(path: string): void }) {
  const { notes, bump } = useApp();
  const act = useTaskActions();
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<Task | null>(null);
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const today = isoDate();
  const all = projectTasks(todo.tasks, p.slug, stepId);
  const open = all.filter(k => k.status === "open").sort(compareTasks);
  const done = all.filter(k => k.status !== "open").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  const add = async (q: Parsed) => {
    try {
      const d: Data = {
        when: q.when,
        evening: q.evening,
        time: q.time,
        repeat: q.repeat,
        priority: q.priority,
        list: q.list,
        project: p.slug,
        step: stepId,
      };
      if (q.list) await todo.ensureList(q.list, q.listName ?? q.list);
      await createTask(notes, q.title, d);
      bump();
      return true;
    } catch (e) {
      act.fail(e);
      return false;
    }
  };

  const row = (k: Task) => (
    <TaskRow
      key={k.path}
      task={k}
      today={today}
      lists={todo.lists}
      active={false}
      onOpen={() => onOpen(k.path)}
      onToggle={() => (k.status === "open" ? act.finish(k.path, "done") : act.reopen(k.path))}
      onSchedule={() => setScheduling(k)}
      onMenu={() => setMenu(k)}
    />
  );

  return (
    <section className="stack" style={{ gap: 6 }} aria-label={t.projects.todos}>
      <span className="fl">{t.projects.todos}{open.length > 0 && ` · ${open.length}`}</span>
      <QuickAdd placeholder={t.projects.addTodo} onAdd={add} />
      {open.length > 0 && <ul className="list">{open.map(row)}</ul>}
      {open.length === 0 && !done.length && (
        <p className="muted small">{t.projects.alsoInTodo}</p>
      )}
      {done.length > 0 && (
        <>
          <button className="section-head fold" onClick={() => setShowDone(v => !v)}>
            {showDone ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {t.projects.done} <span className="mono muted">{done.length}</span>
          </button>
          {showDone && <ul className="list">{done.map(row)}</ul>}
        </>
      )}
      {menu && (
        <TaskMenu
          task={menu}
          lists={todo.lists}
          onOpen={() => onOpen(menu.path)}
          onToggle={() => (menu.status === "open" ? act.finish(menu.path, "done") : act.reopen(menu.path))}
          onSchedule={() => setScheduling(menu)}
          onMove={to => act.move(menu, to)}
          onCancelTask={() => act.finish(menu.path, "canceled")}
          onDelete={() => act.remove(menu.path)}
          onClose={() => setMenu(null)}
        />
      )}
      {scheduling && (
        <ScheduleDialog
          current={{ when: scheduling.when, evening: scheduling.evening }}
          onPick={w => act.schedule(scheduling, w)}
          onClose={() => setScheduling(null)}
        />
      )}
    </section>
  );
}

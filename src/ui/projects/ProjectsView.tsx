import { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { FlowId } from "../../data/flows";
import { flushAll } from "../../data/pending";
import {
  STATUSES,
  createProject,
  gatePatch,
  createStepNote,
  isProjectPath,
  isStepNotePath,
  loadProjects,
  projectPathOf,
  stepIdOf,
  stepNumber,
  type Decision,
  type Project,
} from "../../data/projects";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { AskText } from "../Dialog";
import { useApp } from "../context";
import { TaskEditor } from "../todo/TaskEditor";
import { useTaskActions } from "../todo/useTaskActions";
import type { TodoData } from "../todo/useTodo";
import { useHold } from "../useHold";
import { GateDialog, ProjectMenu } from "./Gate";
import { NewProject } from "./NewProject";
import { ProjectEditor } from "./ProjectEditor";
import { StepNoteEditor } from "./StepNoteEditor";
import { StepView } from "./StepView";

// Projects (SPEC 5.5): the list grouped by status, and on the right the project page, one of its
// steps, or a step note or to-do (one at a time on the phone; back goes up one level). Hold a
// project in the list (right-click on the PC) for its options.

/** Projects, reloaded whenever data on disk changes. */
export function useProjects(): Project[] {
  const { notes, version, toast } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    let alive = true;
    loadProjects(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(list => alive && setProjects(list));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return projects;
}

interface Props {
  projects: Project[];
  todo: TodoData;
  /** A project or a step note to open (from search, an idea…). */
  openPath?: { path: string; key: number };
  onOpenIdea(path: string): void;
}

export function ProjectsView({ projects, todo, openPath, onOpenIdea }: Props) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [notePath, setNotePath] = useState<string | null>(null);
  const [taskPath, setTaskPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<Project | null>(null);
  const [gate, setGate] = useState<{ project: Project; decision: Decision } | null>(null);
  const tasks = useTaskActions(path => setTaskPath(t => (t === path ? null : t)));
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  const show = (project: string | null, s: string | null = null, n: string | null = null) => {
    setOpen(project);
    setStep(s);
    setNotePath(n);
    setTaskPath(null);
  };

  /** A header change from the list (gate, resume), with Undo. */
  const change = async (p: Project, patch: Record<string, unknown>, text: string) => {
    try {
      await flushAll();
      const before = Object.fromEntries(Object.keys(patch).map(k => [k, p.note.data[k]]));
      await notes.patchHeader(p.path, patch);
      bump();
      toast({ text, action: { label: t.common.undo, run: () => notes.patchHeader(p.path, before).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const decide = (p: Project, d: Decision, reason: string, to?: string) => {
    setGate(null);
    try {
      const patch = gatePatch(p, d, reason, to);
      const where = patch.step ? t.projects.nowOn(p.flow.steps.find(s => s.id === patch.step)!.name) : "";
      const label = t.projects.toastStatus[String(patch.status)];
      change(p, patch, label || where || t.projects.decided);
    } catch (e) {
      fail(e);
    }
  };

  useEffect(() => {
    if (!openPath) return;
    const p = openPath.path;
    if (isProjectPath(p)) show(p);
    else if (isStepNotePath(p)) show(projectPathOf(p), stepIdOf(p), p);
  }, [openPath]);

  // Ctrl+N: new project (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setAdding(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const create = async (title: string, flow: FlowId) => {
    setAdding(false);
    try {
      const n = await createProject(notes, { title, flow });
      bump();
      show(n.path);
    } catch (e) {
      fail(e);
    }
  };

  const project = projects.find(p => p.path === open);

  const addNote = async (title: string) => {
    setNewNote(false);
    if (!project || !step) return;
    try {
      const n = await createStepNote(notes, project.dir, step, title);
      bump();
      setNotePath(n.path);
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (p: Project) => {
    try {
      await flushAll();
      if (open === p.path) show(null);
      const trashed = await moveToTrash(notes.storage, p.dir);
      bump();
      toast({
        text: t.projects.deleted,
        action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, p.dir).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  const removeNote = async (path: string) => {
    try {
      await flushAll();
      setNotePath(null);
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({ text: t.projects.noteDeleted, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const closed = (s: string) => s === "done" || s === "killed";

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>{t.projects.title}</h1>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={18} /> {t.common.new}
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="muted empty-note">{t.projects.none}</p>
        ) : (
          STATUSES.map(s => {
            const group = projects.filter(p => p.status === s.id);
            if (!group.length) return null;
            const folded = closed(s.id) && !showClosed;
            return (
              <section key={s.id} className="task-section">
                {closed(s.id) ? (
                  <button className="section-head fold" onClick={() => setShowClosed(v => !v)}>
                    {folded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {t.projects.status[s.id]} <span className="mono muted">{group.length}</span>
                  </button>
                ) : (
                  <div className="section-head">
                    {t.projects.status[s.id]} <span className="mono muted">{group.length}</span>
                  </div>
                )}
                {!folded && (
                  <ul className="list">
                    {group.map(p => (
                      <ProjectRow
                        key={p.path}
                        project={p}
                        active={open === p.path}
                        todos={todo.tasks.filter(k => k.project === p.slug && k.status === "open").length}
                        onOpen={() => show(p.path)}
                        onMenu={() => setMenu(p)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
      <div className="detail-pane">
        {open && taskPath ? (
          <TaskEditor
            key={taskPath}
            path={taskPath}
            lists={todo.lists}
            projects={projects}
            ensureList={todo.ensureList}
            onBack={() => setTaskPath(null)}
            onFinish={s => tasks.finish(taskPath, s)}
            onReopen={() => tasks.reopen(taskPath)}
            onDelete={() => tasks.remove(taskPath)}
          />
        ) : open && step && notePath ? (
          <StepNoteEditor
            key={notePath}
            path={notePath}
            project={project}
            onBack={() => setNotePath(null)}
            onDelete={removeNote}
          />
        ) : open && step ? (
          project ? (
            <StepView
              key={step}
              project={project}
              stepId={step}
              todo={todo}
              onBack={() => setStep(null)}
              onOpenNote={setNotePath}
              onNewNote={() => setNewNote(true)}
              onOpenTask={setTaskPath}
            />
          ) : null
        ) : open ? (
          <ProjectEditor
            key={open}
            path={open}
            tasks={todo.tasks}
            onBack={() => show(null)}
            onDelete={remove}
            onOpenStep={setStep}
            onOpenIdea={onOpenIdea}
          />
        ) : (
          <div className="detail-empty muted">{t.projects.pick}</div>
        )}
      </div>
      {menu && (
        <ProjectMenu
          project={menu}
          onOpen={() => show(menu.path)}
          onGate={d => setGate({ project: menu, decision: d })}
          onResume={() => change(menu, { status: "active" }, menu.status === "on-hold" ? t.projects.resumed : t.projects.reopened)}
          onDelete={() => remove(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      {gate && (
        <GateDialog
          project={gate.project}
          initial={gate.decision}
          onOk={(d, reason, to) => decide(gate.project, d, reason, to)}
          onClose={() => setGate(null)}
        />
      )}
      {adding && <NewProject title={t.projects.newProject} onOk={create} onClose={() => setAdding(false)} />}
      {newNote && (
        <AskText title={t.projects.newNote} placeholder={t.projects.newNoteEg} okLabel={t.projects.create} onClose={() => setNewNote(false)} onOk={addNote} />
      )}
    </div>
  );
}

function ProjectRow(props: { project: Project; active: boolean; todos: number; onOpen(): void; onMenu(): void }) {
  const { project: p } = props;
  const hold = useHold(props.onMenu);
  return (
    <li className="project-li" {...hold.handlers}>
      <button className={`list-item${props.active ? " active" : ""}`} onClick={() => !hold.eaten() && props.onOpen()}>
        <span className="list-title">{p.title || <span className="muted">{t.common.untitled}</span>}</span>
        <span className="list-meta mono">
          {p.flow.name} · {stepNumber(p.flow, p.step.id)}/{p.flow.steps.length} {p.step.name}
          {props.todos > 0 && t.projects.todoCount(props.todos)}
        </span>
      </button>
    </li>
  );
}

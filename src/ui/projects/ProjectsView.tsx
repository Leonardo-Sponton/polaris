import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { FlowId } from "../../data/flows";
import { flushAll } from "../../data/pending";
import {
  STATUSES,
  createProject,
  createStepNote,
  isProjectPath,
  isStepNotePath,
  loadProjects,
  projectPathOf,
  stepIdOf,
  stepNumber,
  type Project,
} from "../../data/projects";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { AskText } from "../Dialog";
import { useApp } from "../context";
import { NewProject } from "./NewProject";
import { ProjectEditor } from "./ProjectEditor";
import { StepNoteEditor } from "./StepNoteEditor";
import { StepView } from "./StepView";

// Projects (SPEC 5.5): the list grouped by status, and on the right the project page, one of its
// steps, or a step note (one at a time on the phone; back goes up one level).

/** Projects, reloaded whenever data on disk changes. */
export function useProjects(): Project[] {
  const { notes, version, toast } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    let alive = true;
    loadProjects(notes, p => toast({ text: `Could not read ${p}`, error: true })).then(list => alive && setProjects(list));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return projects;
}

interface Props {
  projects: Project[];
  /** A project or a step note to open (from search, an idea…). */
  openPath?: { path: string; key: number };
  onOpenIdea(path: string): void;
}

export function ProjectsView({ projects, openPath, onOpenIdea }: Props) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [notePath, setNotePath] = useState<string | null>(null);
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
        text: "Project deleted",
        action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, p.dir).then(bump, fail) },
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
      toast({ text: "Note deleted", action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const closed = (s: string) => s === "done" || s === "killed";

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>Projects</h1>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={18} /> New
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="muted empty-note">
            No projects yet. Open an idea and press “Make it a project”, or press New to start one from scratch.
          </p>
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
                    {s.label} <span className="mono muted">{group.length}</span>
                  </button>
                ) : (
                  <div className="section-head">
                    {s.label} <span className="mono muted">{group.length}</span>
                  </div>
                )}
                {!folded && (
                  <ul className="list">
                    {group.map(p => (
                      <li key={p.path}>
                        <button className={`list-item${open === p.path ? " active" : ""}`} onClick={() => show(p.path)}>
                          <span className="list-title">{p.title || <span className="muted">(untitled)</span>}</span>
                          <span className="list-meta mono">
                            {p.flow.name} · {stepNumber(p.flow, p.step.id)}/{p.flow.steps.length} {p.step.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
      <div className="detail-pane">
        {open && step && notePath ? (
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
              onBack={() => setStep(null)}
              onOpenNote={setNotePath}
              onNewNote={() => setNewNote(true)}
            />
          ) : null
        ) : open ? (
          <ProjectEditor
            key={open}
            path={open}
            onBack={() => show(null)}
            onDelete={remove}
            onOpenStep={setStep}
            onOpenIdea={onOpenIdea}
          />
        ) : (
          <div className="detail-empty muted">Pick a project or press New.</div>
        )}
      </div>
      {adding && <NewProject title="New project" onOk={create} onClose={() => setAdding(false)} />}
      {newNote && (
        <AskText title="New note" placeholder="e.g. Interviews" okLabel="Create" onClose={() => setNewNote(false)} onOk={addNote} />
      )}
    </div>
  );
}

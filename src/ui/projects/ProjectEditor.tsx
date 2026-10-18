import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { ArrowLeft, ChevronRight, Flag, Lightbulb, Play, RotateCcw, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { answersOf, assumptionsOf, score, toIdea, type Idea } from "../../data/ideas";
import type { Data } from "../../data/frontmatter";
import type { Note } from "../../data/notes";
import { extraSteps, gatePatch, projectTasks, toProject, type Decision, type Project } from "../../data/projects";
import type { Task } from "../../data/todo";
import { joinTitle, splitTitle } from "../../data/todo";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { GateDialog, GateHistory } from "./Gate";
import { useStepNotes } from "./StepView";

// The project page (SPEC 5.5): title, status, flow with its steps (current one marked, notes and
// open to-dos counted), the gate that ends the current step and the decisions so far, the idea it
// came from with its checklist and assumptions, and free notes.

interface Props {
  path: string;
  tasks: Task[];
  onBack(): void;
  onDelete(p: Project): void;
  onOpenStep(id: string): void;
  onOpenIdea(path: string): void;
}

export function ProjectEditor({ path, tasks, onBack, onDelete, onOpenStep, onOpenIdea }: Props) {
  const f = useNoteFile(path);
  useBack(true, onBack);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? t.note.status[f.status] : ""}
        </span>
        {f.note && (
          <button
            className="btn ghost icon"
            aria-label={t.projects.deleteProject}
            title={t.projects.deleteHint}
            onClick={() => f.saveNow().then(() => onDelete(toProject(f.note!)))}
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
        f.note && <ProjectForm key={f.rev} file={f} note={f.note} tasks={tasks} onOpenStep={onOpenStep} onOpenIdea={onOpenIdea} />
      )}
      {f.dialog}
    </div>
  );
}

/** The idea a project came from, loaded from its file. */
function useIdea(path?: string): Idea | null | undefined {
  const { notes, version } = useApp();
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    notes.load(path).then(
      n => alive && setIdea(toIdea(n)),
      () => alive && setIdea(null),
    );
    return () => {
      alive = false;
    };
  }, [notes, version, path]);
  return idea;
}

function FromIdea({ path, onOpen }: { path: string; onOpen(): void }) {
  const idea = useIdea(path);
  if (idea === undefined) return null;
  if (idea === null) return <p className="muted small">{t.projects.ideaGone(path)}</p>;
  const s = score(answersOf(idea.note.data));
  const list = assumptionsOf(idea.note.data);
  return (
    <section className="from-idea" aria-label={t.projects.fromIdea}>
      <button className="list-item" onClick={onOpen}>
        <span className="list-title">
          <Lightbulb size={16} /> {idea.title || t.shell.untitledIdea}
        </span>
        <span className="list-meta mono">
          {t.projects.checklist(s.answered ? `${s.yes}/${s.total}` : t.ideas.notAnswered)}
          {s.viable && t.ideas.maybeViable}
          {list.length > 0 && t.projects.assumptions(list.length)}
        </span>
      </button>
      {list.length > 0 && (
        <ul className="from-idea-assumptions">
          {list.map((a, i) => (
            <li key={i}>
              <span className={`result ${a.result}`}>{t.ideas.results[a.result]}</span>
              <span>{a.text || <span className="muted">{t.common.empty}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectForm(props: {
  file: NoteFile;
  note: Note;
  tasks: Task[];
  onOpenStep(id: string): void;
  onOpenIdea(path: string): void;
}) {
  const { file: f, note } = props;
  const split = splitTitle(note.body);
  const [title, setTitle] = useState(split.title);
  const titleRef = useRef(split.title);
  const restRef = useRef(split.rest);
  const writeBody = () => f.setBody(joinTitle(titleRef.current, restRef.current));
  // The header as last changed here (gates, resume); the file hook saves it.
  const [d, setD] = useState(note.data);
  const patch = (x: Data) => {
    setD(old => ({ ...old, ...x }));
    f.setData(x);
  };
  const p = toProject({ ...note, data: d });
  const stepNotes = useStepNotes(p.dir);
  const count = (id: string) => stepNotes.filter(n => n.step === id).length;
  const open = projectTasks(props.tasks, p.slug).filter(k => k.status === "open");
  const todos = (id: string) => open.filter(k => k.step === id).length;
  const [gate, setGate] = useState<Decision | null>(null);
  const { toast } = useApp();
  const decide = (decision: Decision, reason: string, to?: string) => {
    setGate(null);
    try {
      patch(gatePatch(p, decision, reason, to));
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };
  const lastReason = p.gates.at(-1)?.reason;
  const current = p.flow.steps.indexOf(p.step);
  const extra = extraSteps(p.flow, stepNotes);

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <textarea
          className="task-title-input"
          rows={1}
          value={title}
          placeholder={t.projects.name}
          aria-label={t.projects.nameLabel}
          onChange={e => {
            const v = e.target.value.replace(/\n/g, " ");
            setTitle(v);
            titleRef.current = v;
            writeBody();
          }}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
        />

        <div className="task-fields">
          <span className="fl">{t.projects.fStatus}</span>
          <span>{t.projects.status[p.status]}</span>
          <span className="fl">{t.projects.flow}</span>
          <span>{p.flow.name}</span>
        </div>

        {p.idea && <FromIdea path={p.idea} onOpen={() => props.onOpenIdea(p.idea!)} />}

        <div className="task-notes-head">
          <span className="fl">{t.projects.steps}</span>
        </div>
        <ol className="steps" aria-label={t.projects.steps}>
          {p.flow.steps.map((s, i) => {
            const n = count(s.id);
            const state = i < current ? "past" : i === current ? "current" : "later";
            return (
              <li key={s.id} className={`step ${state}`}>
                <button onClick={() => props.onOpenStep(s.id)} aria-current={state === "current" ? "step" : undefined}>
                  <span className="step-num mono">{i + 1}</span>
                  <span className="step-name">
                    {s.name}
                    {state === "current" && <span className="step-now small">{t.projects.current}</span>}
                  </span>
                  {todos(s.id) > 0 && (
                    <span className="step-todos small mono" title={t.projects.openTodos}>
                      {t.projects.stepTodos(todos(s.id))}
                    </span>
                  )}
                  {n > 0 && <span className="count">{n}</span>}
                  <ChevronRight size={16} className="muted" />
                </button>
              </li>
            );
          })}
          {extra.map(id => (
            <li key={id} className="step later">
              <button onClick={() => props.onOpenStep(id)}>
                <span className="step-num mono">·</span>
                <span className="step-name">{id}</span>
                <span className="count">{count(id)}</span>
                <ChevronRight size={16} className="muted" />
              </button>
            </li>
          ))}
        </ol>

        <section className="gate-box" aria-label={t.projects.decision}>
          {p.status === "active" ? (
            <>
              <span className="small">{t.projects.whenDone(current + 1)}</span>
              <button className="btn" onClick={() => setGate("go")}>
                <Flag size={16} /> {t.projects.finishStep}
              </button>
            </>
          ) : (
            <>
              <span className="small">
                <strong>{t.projects.status[p.status]}</strong>
                {lastReason && ` · ${lastReason}`}
              </span>
              <div className="row" style={{ gap: 6 }}>
                {p.status === "on-hold" && (
                  <button className="btn" onClick={() => setGate("kill")}>
                    {t.projects.killDots}
                  </button>
                )}
                <button className="btn" onClick={() => patch({ status: "active" })}>
                  {p.status === "on-hold" ? <Play size={16} /> : <RotateCcw size={16} />}
                  {p.status === "on-hold" ? t.projects.resume : t.projects.reopen}
                </button>
              </div>
            </>
          )}
        </section>
        {p.gates.length > 0 && (
          <>
            <div className="task-notes-head">
              <span className="fl">{t.projects.decisionsTitle}</span>
            </div>
            <GateHistory project={p} />
          </>
        )}

        <div className="task-notes-head">
          <span className="fl">{t.projects.notes}</span>
        </div>
        <div className="task-notes">
          <Editor path={note.path}
            text={split.rest}
            placeholder={t.projects.notesPlaceholder}
            onSaveNow={f.saveNow}
            onChange={text => {
              restRef.current = text;
              writeBody();
            }}
          />
        </div>
        <div className="row task-actions">
          <span className="muted small mono">{t.projects.started(String(note.data.created ?? "").replace("T", " "))}</span>
        </div>
      </div>
      {gate && <GateDialog project={p} initial={gate} onOk={decide} onClose={() => setGate(null)} />}
    </div>
  );
}

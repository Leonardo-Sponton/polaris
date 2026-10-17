import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Lightbulb, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { RESULTS, answersOf, assumptionsOf, score, toIdea, type Idea } from "../../data/ideas";
import type { Note } from "../../data/notes";
import { STATUSES, extraSteps, toProject, type Project } from "../../data/projects";
import { joinTitle, splitTitle } from "../../data/todo";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { STATUS_TEXT, useNoteFile, type NoteFile } from "../useNoteFile";
import { useStepNotes } from "./StepView";

// The project page (SPEC 5.5): title, status, flow with its steps (current one marked, notes
// counted), the idea it came from with its checklist and assumptions, and free notes.

interface Props {
  path: string;
  onBack(): void;
  onDelete(p: Project): void;
  onOpenStep(id: string): void;
  onOpenIdea(path: string): void;
}

export function ProjectEditor({ path, onBack, onDelete, onOpenStep, onOpenIdea }: Props) {
  const f = useNoteFile(path);
  useBack(true, onBack);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? STATUS_TEXT[f.status] : ""}
        </span>
        {f.note && (
          <button
            className="btn ghost icon"
            aria-label="Delete project"
            title="Delete the project and its notes"
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
        f.note && <ProjectForm key={f.rev} file={f} note={f.note} onOpenStep={onOpenStep} onOpenIdea={onOpenIdea} />
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
  if (idea === null) return <p className="muted small">The idea it came from ({path}) is no longer there.</p>;
  const s = score(answersOf(idea.note.data));
  const list = assumptionsOf(idea.note.data);
  return (
    <section className="from-idea" aria-label="From the idea">
      <button className="list-item" onClick={onOpen}>
        <span className="list-title">
          <Lightbulb size={16} /> {idea.title || "(untitled idea)"}
        </span>
        <span className="list-meta mono">
          Checklist {s.answered ? `${s.yes}/${s.total}` : "not answered"}
          {s.viable && " · Maybe viable"}
          {list.length > 0 && ` · ${list.length} assumption${list.length > 1 ? "s" : ""}`}
        </span>
      </button>
      {list.length > 0 && (
        <ul className="from-idea-assumptions">
          {list.map((a, i) => (
            <li key={i}>
              <span className={`result ${a.result}`}>{RESULTS.find(r => r.id === a.result)!.label}</span>
              <span>{a.text || <span className="muted">(empty)</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectForm(props: { file: NoteFile; note: Note; onOpenStep(id: string): void; onOpenIdea(path: string): void }) {
  const { file: f, note } = props;
  const split = splitTitle(note.body);
  const [title, setTitle] = useState(split.title);
  const titleRef = useRef(split.title);
  const restRef = useRef(split.rest);
  const writeBody = () => f.setBody(joinTitle(titleRef.current, restRef.current));
  const p = toProject(note);
  const stepNotes = useStepNotes(p.dir);
  const count = (id: string) => stepNotes.filter(n => n.step === id).length;
  const current = p.flow.steps.indexOf(p.step);
  const extra = extraSteps(p.flow, stepNotes);

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <textarea
          className="task-title-input"
          rows={1}
          value={title}
          placeholder="Project name"
          aria-label="Name"
          onChange={e => {
            const v = e.target.value.replace(/\n/g, " ");
            setTitle(v);
            titleRef.current = v;
            writeBody();
          }}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
        />

        <div className="task-fields">
          <span className="fl">Status</span>
          <span>{STATUSES.find(s => s.id === p.status)!.label}</span>
          <span className="fl">Flow</span>
          <span>{p.flow.name}</span>
        </div>

        {p.idea && <FromIdea path={p.idea} onOpen={() => props.onOpenIdea(p.idea!)} />}

        <div className="task-notes-head">
          <span className="fl">Steps</span>
        </div>
        <ol className="steps" aria-label="Steps">
          {p.flow.steps.map((s, i) => {
            const n = count(s.id);
            const state = i < current ? "past" : i === current ? "current" : "later";
            return (
              <li key={s.id} className={`step ${state}`}>
                <button onClick={() => props.onOpenStep(s.id)} aria-current={state === "current" ? "step" : undefined}>
                  <span className="step-num mono">{i + 1}</span>
                  <span className="step-name">
                    {s.name}
                    {state === "current" && <span className="step-now small"> · current</span>}
                  </span>
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

        <div className="task-notes-head">
          <span className="fl">Notes</span>
        </div>
        <div className="task-notes">
          <Editor
            text={split.rest}
            placeholder="Anything about the project as a whole…"
            onSaveNow={f.saveNow}
            onChange={text => {
              restRef.current = text;
              writeBody();
            }}
          />
        </div>
        <div className="row task-actions">
          <span className="muted small mono">Started {String(note.data.created ?? "").replace("T", " ")}</span>
        </div>
      </div>
    </div>
  );
}

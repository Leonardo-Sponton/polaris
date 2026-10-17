import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { loadStepNotes, stepNumber, type Project, type StepNote } from "../../data/projects";
import { useApp } from "../context";
import { useBack } from "../useBack";

// One step of a project (SPEC 5.5): what the step is about and its notes in creation order.

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
  onOpenNote(path: string): void;
  onNewNote(): void;
}

export function StepView({ project: p, stepId, onBack, onOpenNote, onNewNote }: Props) {
  useBack(true, onBack);
  const all = useStepNotes(p.dir);
  const list = all.filter(n => n.step === stepId);
  const step = p.flow.steps.find(s => s.id === stepId);
  const n = stepNumber(p.flow, stepId);

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label="Back to the project">
          <ArrowLeft size={20} />
        </button>
        <span className="quote-book muted small">{p.title}</span>
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <div>
            <span className="fl">{n ? `Step ${n} of ${p.flow.steps.length}` : "Not in this flow"}</span>
            <h2 className="step-title">{step?.name ?? stepId}</h2>
          </div>
          {step?.guidance && <p className="step-guidance">{step.guidance}</p>}
          {step && step.sections.length > 0 && (
            <p className="muted small">Suggested sections: {step.sections.join(" · ")}</p>
          )}

          <div className="task-notes-head">
            <span className="fl">Notes{list.length > 0 && ` · ${list.length}`}</span>
            <button className="btn ghost" onClick={onNewNote}>
              <Plus size={16} /> New note
            </button>
          </div>
          {list.length === 0 ? (
            <p className="muted small">Nothing here yet. Each note keeps the date it was written.</p>
          ) : (
            <ul className="list">
              {list.map(x => (
                <li key={x.path}>
                  <button className="list-item" onClick={() => onOpenNote(x.path)}>
                    <span className="list-title">{x.title || <span className="muted">(untitled)</span>}</span>
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

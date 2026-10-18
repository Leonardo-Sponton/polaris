import { useRef, useState } from "react";
import { t, type Words } from "../../i18n";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { addSection } from "../../data/ideas";
import type { Note } from "../../data/notes";
import { missingStepSections, stepIdOf, type Project } from "../../data/projects";
import { joinTitle, splitTitle } from "../../data/todo";
import { useFiveW2H } from "../FiveW2H";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";

// A note of a project step: title and free text, with buttons for the step's suggested sections
// and the 5W2H block (SPEC 3.4, 5.5). Saved as you go.

interface Props {
  path: string;
  project?: Project;
  onBack(): void;
  onDelete(path: string): void;
}

export function StepNoteEditor({ path, project, onBack, onDelete }: Props) {
  const f = useNoteFile(path);
  useBack(true, onBack);
  const step = project?.flow.steps.find(s => s.id === stepIdOf(path));
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label={t.projects.backToStep}>
          <ArrowLeft size={20} />
        </button>
        <span className="quote-book muted small">{step?.name ?? stepIdOf(path)}</span>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? t.note.status[f.status] : ""}
        </span>
        {f.note && (
          <button className="btn ghost icon" aria-label={t.projects.deleteNote} title={t.common.delete} onClick={() => onDelete(path)}>
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
        f.note && <StepNoteForm key={f.rev} file={f} note={f.note} sections={step?.sectionWords ?? step?.sections ?? []} />
      )}
      {f.dialog}
    </div>
  );
}

function StepNoteForm({ file: f, note, sections }: { file: NoteFile; note: Note; sections: (string | Words)[] }) {
  const split = splitTitle(note.body);
  const [title, setTitle] = useState(split.title);
  const [restRev, setRestRev] = useState(0);
  const titleRef = useRef(split.title);
  const writeBody = () => f.setBody(joinTitle(titleRef.current, w.body()));
  const w = useFiveW2H(split.rest, writeBody);
  const [rest, setRest] = useState(w.initialText);
  const missing = missingStepSections(sections, rest);

  const add = (name: string) => {
    const next = addSection(w.text(), name);
    w.setText(next);
    setRest(next);
    setRestRev(r => r + 1);
    writeBody();
  };

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <textarea
          className="task-title-input"
          rows={1}
          value={title}
          placeholder={t.projects.noteTitle}
          aria-label={t.todo.title}
          onChange={e => {
            const v = e.target.value.replace(/\n/g, " ");
            setTitle(v);
            titleRef.current = v;
            writeBody();
          }}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
        />
        <div className="task-notes">
          <Editor path={note.path}
            key={restRev}
            text={rest}
            autoFocus={restRev > 0}
            placeholder={t.ideas.draftPlaceholder}
            onSaveNow={f.saveNow}
            commands={{ "5w2h": w.insert }}
            onChange={text => {
              w.setText(text);
              setRest(text);
              writeBody();
            }}
          />
        </div>
        {(missing.length > 0 || !w.has) && (
          <div className="row idea-sections" aria-label={t.ideas.addSection}>
            {missing.map(s => (
              <button key={s} className="btn ghost" onClick={() => add(s)}>
                <Plus size={16} /> {s}
              </button>
            ))}
            {!w.has && (
              <button className="btn ghost" onClick={w.insert}>
                <Plus size={16} /> 5W2H
              </button>
            )}
          </div>
        )}
        {w.form}
        <div className="row task-actions">
          <span className="muted small mono">{t.projects.written(String(note.data.created ?? "").replace("T", " "))}</span>
        </div>
      </div>
    </div>
  );
}

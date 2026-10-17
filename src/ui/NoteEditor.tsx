import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Editor } from "../editor/Editor";
import { useBack } from "./useBack";
import { STATUS_TEXT, useNoteFile } from "./useNoteFile";

// Opens one file in the editor and keeps it saved (see useNoteFile).
// Render it with key={path}: one instance per file.

interface Props {
  path: string;
  placeholder?: string;
  /** Shows a back arrow (phone layout). */
  onBack?(): void;
  /** Deletes the file when it is left empty (new items the user did not write in). */
  removeIfEmpty?: boolean;
  autoFocus?: boolean;
  /** Buttons at the right of the top bar. */
  actions?: ReactNode;
}

export function NoteEditor({ path, placeholder, onBack, removeIfEmpty, autoFocus, actions }: Props) {
  const f = useNoteFile(path, { removeIfEmpty: removeIfEmpty ? body => body.trim() === "" : undefined });
  useBack(!!onBack, () => onBack?.());

  return (
    <div className="note-editor">
      <div className="note-bar">
        {onBack && (
          <button className="btn ghost icon back" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
        )}
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? STATUS_TEXT[f.status] : ""}
        </span>
        {f.note && actions}
      </div>
      {f.gone ? (
        <div className="page">
          <div className="page-inner">
            <p className="err">{f.gone}</p>
          </div>
        </div>
      ) : (
        f.note && (
          <Editor
            key={f.rev}
            text={f.note.body}
            onChange={f.setBody}
            onSaveNow={f.saveNow}
            placeholder={placeholder}
            autoFocus={autoFocus && f.rev === 1}
          />
        )
      )}
      {f.dialog}
    </div>
  );
}

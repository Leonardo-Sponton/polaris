import { useRef, useState } from "react";
import { ArrowLeft, Camera, ImagePlus, Star, Trash2, X } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { FORMATS, STATUSES, removeCover, statusPatch, toBook, writeCover, type Book, type BookStatus, type Format } from "../../data/books";
import type { Data } from "../../data/frontmatter";
import type { Note } from "../../data/notes";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { STATUS_TEXT, useNoteFile, type NoteFile } from "../useNoteFile";
import { Cover } from "./BooksView";
import { shrinkImage } from "./cover";

// The book screen (SPEC 5.6): cover, info, status with its dates, rating and free notes.
// Everything is saved as you go. Quote notes come in stage 3b.

interface Props {
  path: string;
  onBack(): void;
  onDelete(b: Book): void;
}

export function BookEditor({ path, onBack, onDelete }: Props) {
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
          <button className="btn ghost icon" aria-label="Delete book" title="Delete" onClick={() => onDelete(toBook(f.note!))}>
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
        f.note && <BookForm key={f.rev} file={f} note={f.note} />
      )}
      {f.dialog}
    </div>
  );
}

/** Whole numbers are stored as numbers, anything else (e.g. "c. 65 AD") as typed. */
const numberOrText = (v: string) => (v.trim() === "" ? undefined : /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v.trim());

function BookForm({ file: f, note }: { file: NoteFile; note: Note }) {
  const { notes, platform, toast, bump } = useApp();
  const [d, setD] = useState<Data>(note.data);
  const photo = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const b = toBook({ ...note, data: d });

  /** Saved now (choices). */
  const patch = (p: Data) => {
    setD(old => ({ ...old, ...p }));
    f.setData(p);
  };
  /** Saved a moment later (typing). */
  const edit = (p: Data) => {
    setD(old => ({ ...old, ...p }));
    f.editData(p);
  };
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const pickedCover = async (file: File | undefined) => {
    if (!file) return;
    try {
      patch(await writeCover(notes.storage, b.dir, await shrinkImage(file)));
      bump(); // same name as before: the pictures reload from the file

    } catch (e) {
      fail(e);
    }
  };

  const text = (key: string, label: string, opts: { placeholder?: string; numeric?: boolean } = {}) => (
    <>
      <span className="fl">{label}</span>
      <input
        className="field"
        value={d[key] === undefined || d[key] === null ? "" : String(d[key])}
        placeholder={opts.placeholder}
        inputMode={opts.numeric ? "numeric" : undefined}
        onChange={e => edit({ [key]: opts.numeric ? numberOrText(e.target.value) : e.target.value.trim() ? e.target.value : undefined })}
      />
    </>
  );

  const date = (key: "started" | "finished", label: string) => (
    <>
      <span className="fl">{label}</span>
      <input className="field" type="date" value={b[key]} onChange={e => patch({ [key]: e.target.value || undefined })} />
    </>
  );

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <div className="book-head">
          <div className="book-cover-edit">
            <Cover book={b} />
            <div className="row" style={{ gap: 2, justifyContent: "center" }}>
              {platform.name === "android" && (
                <button className="btn ghost icon" title="Take a photo" aria-label="Take a photo" onClick={() => photo.current?.click()}>
                  <Camera size={18} />
                </button>
              )}
              <button className="btn ghost icon" title="Pick an image" aria-label="Pick an image" onClick={() => image.current?.click()}>
                <ImagePlus size={18} />
              </button>
              {b.cover && (
                <button
                  className="btn ghost icon"
                  title="Remove the cover"
                  aria-label="Remove the cover"
                  onClick={() => removeCover(notes.storage, b.dir).then(patch, fail)}
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={e => pickedCover(e.target.files?.[0])} />
            <input ref={image} type="file" accept="image/*" hidden onChange={e => pickedCover(e.target.files?.[0])} />
          </div>
          <div className="stack book-main">
            <textarea
              className="task-title-input"
              rows={1}
              value={String(d.title ?? "")}
              placeholder="Title"
              aria-label="Title"
              onChange={e => edit({ title: e.target.value.replace(/\n/g, " ") })}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
            />
            <input
              className="field book-author-input"
              value={String(d.author ?? "")}
              placeholder="Author"
              aria-label="Author"
              onChange={e => edit({ author: e.target.value.trim() ? e.target.value : undefined })}
            />
            <div className="rating" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className="btn ghost icon"
                  aria-label={`${n} of 5`}
                  aria-pressed={b.rating === n}
                  title={b.rating === n ? "Tap again to clear" : `${n} of 5`}
                  onClick={() => patch({ rating: b.rating === n ? undefined : n })}
                >
                  <Star size={20} fill={b.rating && n <= b.rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="task-fields">
          <span className="fl">Status</span>
          <select
            className="field"
            value={b.status}
            onChange={e => patch(statusPatch(d, e.target.value as BookStatus, { reason: b.dnfReason }))}
          >
            {STATUSES.map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {b.status === "dnf" && (
            <>
              <span className="fl">Why I stopped</span>
              <input
                className="field"
                value={String(d.dnf_reason ?? "")}
                placeholder="Optional"
                onChange={e => edit({ dnf_reason: e.target.value.trim() ? e.target.value : undefined })}
              />
            </>
          )}
          {b.status !== "want" && b.status !== "wishlist" && date("started", "Started")}
          {(b.status === "read" || b.status === "dnf") && date("finished", b.status === "dnf" ? "Stopped" : "Finished")}
          <span className="fl">Format</span>
          <select className="field" value={b.format} onChange={e => patch({ format: e.target.value as Format })}>
            {FORMATS.map(x => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          {text("pages", "Pages", { numeric: true })}
          {text("year", "Year", { numeric: true })}
          {text("publisher", "Publisher")}
          {text("isbn", "ISBN")}
        </div>

        <div className="task-notes-head">
          <span className="fl">Notes</span>
        </div>
        <div className="task-notes">
          <Editor text={note.body} placeholder="What you think of it, as it comes…" onSaveNow={f.saveNow} onChange={f.setBody} />
        </div>
        <div className="row task-actions">
          <span className="muted small mono">Added {String(d.created ?? "").replace("T", " ")}</span>
        </div>
      </div>
    </div>
  );
}

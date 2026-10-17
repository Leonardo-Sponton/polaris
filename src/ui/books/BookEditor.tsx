import { useRef, useState } from "react";
import { t } from "../../i18n";
import { ArrowLeft, Camera, ExternalLink, ImagePlus, Plus, Star, Trash2, X } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { FORMATS, STATUSES, removeCover, statusPatch, toBook, webLink, writeCover, type Book, type BookStatus, type Format } from "../../data/books";
import type { Data } from "../../data/frontmatter";
import type { Note } from "../../data/notes";
import type { Quote } from "../../data/quotes";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { Cover } from "./BooksView";
import { shrinkImage } from "./cover";
import { quotePlace } from "./QuoteReview";

// The book screen (SPEC 5.6): cover, info, status with its dates, rating and free notes.
// Everything is saved as you go. Quote notes are listed by page; each opens its own screen.

interface Props {
  path: string;
  onBack(): void;
  onDelete(b: Book): void;
  /** This book's quotes, by page. */
  quotes: Quote[];
  onAddQuote(b: Book): void;
  onOpenQuote(path: string): void;
}

export function BookEditor({ path, onBack, onDelete, ...rest }: Props) {
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
          <button className="btn ghost icon" aria-label={t.books.deleteBook} title={t.common.delete} onClick={() => onDelete(toBook(f.note!))}>
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
        f.note && <BookForm key={f.rev} file={f} note={f.note} {...rest} />
      )}
      {f.dialog}
    </div>
  );
}

/** Whole numbers are stored as numbers, anything else (e.g. "c. 65 AD") as typed. */
export const numberOrText = (v: string) => (v.trim() === "" ? undefined : /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v.trim());

type FormProps = { file: NoteFile; note: Note } & Pick<Props, "quotes" | "onAddQuote" | "onOpenQuote">;

function BookForm({ file: f, note, quotes, onAddQuote, onOpenQuote }: FormProps) {
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
                <button className="btn ghost icon" title={t.books.takePhoto} aria-label={t.books.takePhoto} onClick={() => photo.current?.click()}>
                  <Camera size={18} />
                </button>
              )}
              <button className="btn ghost icon" title={t.books.pickImage} aria-label={t.books.pickImage} onClick={() => image.current?.click()}>
                <ImagePlus size={18} />
              </button>
              {b.cover && (
                <button
                  className="btn ghost icon"
                  title={t.books.removeCover}
                  aria-label={t.books.removeCover}
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
              placeholder={t.books.fTitle}
              aria-label={t.books.fTitle}
              onChange={e => edit({ title: e.target.value.replace(/\n/g, " ") })}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
            />
            <input
              className="field book-author-input"
              value={String(d.author ?? "")}
              placeholder={t.books.author}
              aria-label={t.books.author}
              onChange={e => edit({ author: e.target.value.trim() ? e.target.value : undefined })}
            />
            <div className="rating" role="group" aria-label={t.books.rating}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className="btn ghost icon"
                  aria-label={t.books.ofFive(n)}
                  aria-pressed={b.rating === n}
                  title={b.rating === n ? t.books.tapToClear : t.books.ofFive(n)}
                  onClick={() => patch({ rating: b.rating === n ? undefined : n })}
                >
                  <Star size={20} fill={b.rating && n <= b.rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="task-fields">
          <span className="fl">{t.books.fStatus}</span>
          <select
            className="field"
            value={b.status}
            onChange={e => patch(statusPatch(d, e.target.value as BookStatus, { reason: b.dnfReason }))}
          >
            {STATUSES.map(s => (
              <option key={s.id} value={s.id}>
                {t.books.status[s.id]}
              </option>
            ))}
          </select>
          {b.status === "dnf" && (
            <>
              <span className="fl">{t.books.whyStopped}</span>
              <input
                className="field"
                value={String(d.dnf_reason ?? "")}
                placeholder={t.books.optional}
                onChange={e => edit({ dnf_reason: e.target.value.trim() ? e.target.value : undefined })}
              />
            </>
          )}
          {(b.status === "wishlist" || b.buyUrl) && (
            <>
              <span className="fl">{t.books.whereToBuy}</span>
              <div className="link-field">
                <input
                  className="field"
                  type="url"
                  inputMode="url"
                  value={String(d.buy_url ?? "")}
                  placeholder={t.books.pasteLink}
                  aria-label={t.books.whereToBuy}
                  onChange={e => edit({ buy_url: e.target.value.trim() ? e.target.value.trim() : undefined })}
                />
                {platform.openLink && (
                  <button
                    className="btn ghost icon"
                    title={t.books.openBrowser}
                    aria-label={t.books.openBrowser}
                    disabled={!webLink(b.buyUrl)}
                    onClick={() => platform.openLink!(webLink(b.buyUrl)!).catch(fail)}
                  >
                    <ExternalLink size={18} />
                  </button>
                )}
              </div>
            </>
          )}
          {b.status !== "want" && b.status !== "wishlist" && date("started", t.books.started)}
          {(b.status === "read" || b.status === "dnf") && date("finished", b.status === "dnf" ? t.books.stopped : t.books.finished)}
          <span className="fl">{t.books.format}</span>
          <select className="field" value={b.format} onChange={e => patch({ format: e.target.value as Format })}>
            {FORMATS.map(x => (
              <option key={x.id} value={x.id}>
                {t.books.formats[x.id]}
              </option>
            ))}
          </select>
          {text("pages", t.books.pages, { numeric: true })}
          {text("year", t.books.year, { numeric: true })}
          {text("publisher", t.books.publisher)}
          {text("isbn", t.books.isbn)}
        </div>

        <div className="task-notes-head">
          <span className="fl">{t.books.quotes}{quotes.length > 0 && ` · ${quotes.length}`}</span>
          <button className="btn ghost" onClick={() => onAddQuote(b)}>
            <Plus size={16} /> {t.books.addQuote}
          </button>
        </div>
        {quotes.length === 0 ? (
          <p className="muted small">{t.books.quotesIntro}</p>
        ) : (
          <ul className="quote-list">
            {quotes.map(q => (
              <li key={q.path}>
                <button className="quote-item" onClick={() => onOpenQuote(q.path)}>
                  <span className="qi-text">{q.text || <span className="muted">{t.books.noQuoteText}</span>}</span>
                  {(quotePlace(q) || q.comment.trim()) && (
                    <span className="qi-meta muted small">
                      {quotePlace(q)}
                      {q.comment.trim() && <span className="qi-has-comment">{t.books.comment}</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="task-notes-head">
          <span className="fl">{t.books.notes}</span>
        </div>
        <div className="task-notes">
          <Editor text={note.body} placeholder={t.books.notesPlaceholder} onSaveNow={f.saveNow} onChange={f.setBody} />
        </div>
        <div className="row task-actions">
          <span className="muted small mono">{t.books.added(String(d.created ?? "").replace("T", " "))}</span>
        </div>
      </div>
    </div>
  );
}

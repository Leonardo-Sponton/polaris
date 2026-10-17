import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import type { Data } from "../../data/frontmatter";
import { parseTags } from "../../data/ideas";
import type { Note } from "../../data/notes";
import { joinQuote, splitQuote, toQuote } from "../../data/quotes";
import { createThought, loadThoughts, parseThemes } from "../../data/thoughts";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { STATUS_TEXT, useNoteFile, type NoteFile } from "../useNoteFile";
import { numberOrText } from "./BookEditor";

// A quote note (SPEC 5.6): the quote, page, chapter, tags and my comment. Saved as you go; a quote
// left with no text at all is removed on leaving. "Send to Thoughts" copies it into the Thoughts
// library as a verified quote (SPEC 5.6), once.

interface Props {
  path: string;
  bookTitle: string;
  bookAuthor: string;
  onBack(): void;
  onDelete(path: string): void;
}

export function QuoteEditor({ path, bookTitle, bookAuthor, onBack, onDelete }: Props) {
  const f = useNoteFile(path, { removeIfEmpty: body => body.trim() === "" });
  useBack(true, onBack);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label="Back to the book">
          <ArrowLeft size={20} />
        </button>
        <span className="quote-book muted small">{bookTitle}</span>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? STATUS_TEXT[f.status] : ""}
        </span>
        {f.note && (
          <button className="btn ghost icon" aria-label="Delete quote" title="Delete" onClick={() => onDelete(path)}>
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
        f.note && <QuoteForm key={f.rev} file={f} note={f.note} book={{ title: bookTitle, author: bookAuthor }} />
      )}
      {f.dialog}
    </div>
  );
}

function QuoteForm({ file: f, note, book }: { file: NoteFile; note: Note; book: { title: string; author: string } }) {
  const { notes, version, bump, toast } = useApp();
  const split = splitQuote(note.body);
  const [text, setText] = useState(split.text);
  const [d, setD] = useState<Data>(note.data);
  const [tagText, setTagText] = useState(toQuote(note).tags.join(", "));
  const textRef = useRef(split.text);
  const commentRef = useRef(split.comment);
  const writeBody = () => f.setBody(joinQuote(textRef.current, commentRef.current));

  const edit = (p: Data) => {
    setD(old => ({ ...old, ...p }));
    f.editData(p);
  };

  const commitTags = () => {
    const tags = parseTags(tagText);
    setTagText(tags.join(", "));
    const before = toQuote({ ...note, data: d }).tags;
    if (tags.join() !== before.join()) {
      const p = { tags: tags.length ? tags : undefined };
      setD(old => ({ ...old, ...p }));
      f.setData(p);
    }
  };

  // Already sent? (a thought that points back to this quote)
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    loadThoughts(notes).then(r => alive && setSent(r.all.some(t => t.quote === note.path)));
    return () => {
      alive = false;
    };
  }, [notes, version, note.path]);

  const send = async () => {
    const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
    if (!book.author.trim()) return fail("Add the book's author first: a quote in Thoughts needs one.");
    try {
      const { all } = await loadThoughts(notes);
      const page = value("page");
      await createThought(notes, all, {
        kind: "verified",
        text: textRef.current,
        author: book.author,
        work: book.title,
        reference: [page && `p. ${page}`, value("chapter")].filter(Boolean).join(", "),
        source: `My copy of ${book.title || "the book"}`,
        themes: parseThemes(tagText),
        quote: note.path,
      });
      bump();
      toast({ text: "Sent to Thoughts" });
    } catch (e) {
      fail(e);
    }
  };

  const value = (key: string) => (d[key] === undefined || d[key] === null ? "" : String(d[key]));

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <textarea
          className="quote-input"
          rows={3}
          value={text}
          autoFocus={!split.text && !split.comment}
          placeholder="The quote, as written in the book"
          aria-label="Quote"
          onChange={e => {
            setText(e.target.value);
            textRef.current = e.target.value;
            writeBody();
          }}
        />

        <div className="task-fields">
          <span className="fl">Page</span>
          <input
            className="field quote-page"
            value={value("page")}
            inputMode="numeric"
            placeholder="e.g. 42"
            onChange={e => edit({ page: numberOrText(e.target.value) })}
          />
          <span className="fl">Chapter</span>
          <input
            className="field"
            value={value("chapter")}
            placeholder="Optional"
            onChange={e => edit({ chapter: e.target.value.trim() ? e.target.value : undefined })}
          />
          <span className="fl">Tags</span>
          <input
            className="field"
            value={tagText}
            placeholder="e.g. time, courage"
            onChange={e => setTagText(e.target.value)}
            onBlur={commitTags}
            onKeyDown={e => e.key === "Enter" && (e.target as HTMLElement).blur()}
          />
        </div>

        <div className="task-notes-head">
          <span className="fl">My comment</span>
        </div>
        <div className="task-notes">
          <Editor
            text={split.comment}
            placeholder="What it makes you think…"
            onSaveNow={f.saveNow}
            onChange={c => {
              commentRef.current = c;
              writeBody();
            }}
          />
        </div>
        <div className="row task-actions">
          <button className="btn" disabled={sent || !text.trim()} onClick={send}>
            <Send size={16} /> {sent ? "In Thoughts" : "Send to Thoughts"}
          </button>
          <span className="muted small mono" style={{ marginLeft: "auto" }}>
            Added {String(d.created ?? "").replace("T", " ")}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { ChartColumn, Plus, Search, Star } from "lucide-react";
import { STATUSES, createBook, loadBooks, matches, statusPatch, type Book, type BookStatus } from "../../data/books";
import type { Data } from "../../data/frontmatter";
import { flushAll } from "../../data/pending";
import { bookPathOf, createQuote, isQuotePath, type Quote } from "../../data/quotes";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { AskText, Dialog } from "../Dialog";
import { useApp } from "../context";
import { useHold } from "../useHold";
import { BookEditor } from "./BookEditor";
import { BookMenu } from "./BookMenu";
import { BookStats } from "./BookStats";
import { placeholderColor, useCoverUrl } from "./cover";
import { QuoteEditor } from "./QuoteEditor";
import { QuoteReview } from "./QuoteReview";

// Books (SPEC 5.6): the shelf of cover cards with a tab per status, and the book screen on the
// right (one at a time on the phone). A quote opens over its book; back returns to the book.

/** Books, reloaded whenever data on disk changes. */
export function useBooks(): Book[] {
  const { notes, version, toast } = useApp();
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => {
    let alive = true;
    loadBooks(notes, p => toast({ text: `Could not read ${p}`, error: true })).then(list => alive && setBooks(list));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return books;
}

/** The cover image, or a colored card with title and author. */
export function Cover({ book: b }: { book: Book }) {
  const url = useCoverUrl(b.cover);
  if (url) return <img className="cover" src={url} alt="" draggable={false} />;
  return (
    <div className="cover placeholder" style={{ background: placeholderColor(b.title) }}>
      <span className="pt">{b.title || "(untitled)"}</span>
      {b.author && <span className="pa">{b.author}</span>}
    </div>
  );
}

function BookCard({ book: b, active, onOpen, onMenu }: { book: Book; active: boolean; onOpen(): void; onMenu(): void }) {
  const hold = useHold(onMenu);
  return (
    <li className="book-li" {...hold.handlers}>
      <button className={`book-card${active ? " active" : ""}`} onClick={() => !hold.eaten() && onOpen()}>
        <Cover book={b} />
        <span className="book-title">{b.title || <span className="muted">(untitled)</span>}</span>
        {b.author && <span className="book-author">{b.author}</span>}
        {b.rating && (
          <span className="book-rating" aria-label={`${b.rating} of 5`}>
            {Array.from({ length: b.rating }, (_, i) => (
              <Star key={i} size={11} fill="currentColor" />
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

function NewBook({ status, onOk, onClose }: { status: BookStatus; onOk(title: string, author: string): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const ok = () => title.trim() && onOk(title, author);
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && ok();
  return (
    <Dialog title={`New book · ${STATUSES.find(s => s.id === status)!.label}`} onClose={onClose}>
      <input className="field" autoFocus value={title} placeholder="Title" onChange={e => setTitle(e.target.value)} onKeyDown={enter} />
      <input className="field" value={author} placeholder="Author (optional)" onChange={e => setAuthor(e.target.value)} onKeyDown={enter} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!title.trim()} onClick={ok}>
          Add
        </button>
      </div>
    </Dialog>
  );
}

interface Props {
  books: Book[];
  quotes: Quote[];
  /** A book or a quote to open (from search, Today…). */
  openPath?: { path: string; key: number };
}

export function BooksView({ books, quotes, openPath }: Props) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [tab, setTab] = useState<BookStatus>("reading");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<Book | null>(null);
  const [dnf, setDnf] = useState<Book | null>(null);
  const [stats, setStats] = useState(false);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  useEffect(() => {
    if (!openPath) return;
    setStats(false);
    if (isQuotePath(openPath.path)) {
      setOpen(bookPathOf(openPath.path));
      setQuote(openPath.path);
    } else {
      setOpen(openPath.path);
      setQuote(null);
    }
  }, [openPath]);

  const openBook = (path: string | null) => {
    setStats(false);
    setOpen(path);
    setQuote(null);
  };
  const openQuote = (q: Quote) => {
    setStats(false);
    setOpen(q.bookPath);
    setQuote(q.path);
  };

  // Ctrl+N: new book (SPEC 4.4).
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

  const create = async (title: string, author: string) => {
    setAdding(false);
    try {
      const n = await createBook(notes, { title, author, status: tab });
      bump();
      openBook(n.path);
    } catch (e) {
      fail(e);
    }
  };

  // Header changes from the hold menu, with Undo.
  const change = async (b: Book, patch: Data, text: string) => {
    try {
      await flushAll(); // an open book screen writes its last edits first
      const old = await notes.patchHeader(b.path, patch);
      bump();
      toast({ text, action: { label: "Undo", run: () => notes.patchHeader(b.path, old).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const setStatus = (b: Book, s: BookStatus, reason?: string) =>
    change(b, statusPatch(b.note.data, s, { reason }), `Moved to ${STATUSES.find(x => x.id === s)!.label}`);

  const remove = async (b: Book) => {
    try {
      await flushAll();
      if (open === b.path) openBook(null);
      const trashed = await moveToTrash(notes.storage, b.dir);
      bump();
      toast({
        text: "Book deleted",
        action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, b.dir).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  const addQuote = async (b: Book) => {
    try {
      const n = await createQuote(notes, b.dir);
      bump();
      setQuote(n.path);
    } catch (e) {
      fail(e);
    }
  };

  const removeQuote = async (path: string) => {
    try {
      await flushAll();
      setQuote(null);
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({ text: "Quote deleted", action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const openTitle = books.find(b => b.path === open)?.title ?? "";

  // A search looks at every tab.
  const searching = query.trim() !== "";
  const shown = searching ? books.filter(b => matches(b, query)) : books.filter(b => b.status === tab);
  const count = (s: BookStatus) => books.filter(b => b.status === s).length;

  return (
    <div className={`split books${open || stats ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>Books</h1>
          <div className="row">
            {books.length > 0 && (
              <button className={`btn ghost icon${stats ? " active" : ""}`} aria-label="Reading stats" title="Reading stats" onClick={() => setStats(true)}>
                <ChartColumn size={20} />
              </button>
            )}
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> New
            </button>
          </div>
        </div>
        {books.length > 0 && (
          <div className="book-search">
            <Search size={16} className="muted" />
            <input
              className="field"
              type="search"
              value={query}
              placeholder="Title or author"
              aria-label="Search books"
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        )}
        {!searching && <QuoteReview quotes={quotes} onOpen={openQuote} />}
        {!searching && (
          <div className="chips" aria-label="Status">
            {STATUSES.map(s => (
              <button key={s.id} className={`chip${tab === s.id ? " active" : ""}`} onClick={() => setTab(s.id)}>
                {s.label} <span className="mono muted">{count(s.id)}</span>
              </button>
            ))}
          </div>
        )}
        {books.length === 0 ? (
          <p className="muted empty-note">No books yet. Press New: a title is enough, the rest can come later.</p>
        ) : shown.length === 0 ? (
          <p className="muted empty-note">{searching ? "No book matches." : "Nothing here yet."}</p>
        ) : (
          <ul className="shelf">
            {shown.map(b => (
              <BookCard
                key={b.path}
                book={b}
                active={open === b.path}
                onOpen={() => openBook(b.path)}
                onMenu={() => setMenu(b)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="detail-pane">
        {stats ? (
          <BookStats books={books} onBack={() => setStats(false)} />
        ) : open && quote ? (
          <QuoteEditor key={quote} path={quote} bookTitle={openTitle} onBack={() => setQuote(null)} onDelete={removeQuote} />
        ) : open ? (
          <BookEditor
            key={open}
            path={open}
            onBack={() => openBook(null)}
            onDelete={b => remove(b)}
            quotes={quotes.filter(q => q.bookPath === open)}
            onAddQuote={addQuote}
            onOpenQuote={setQuote}
          />
        ) : (
          <div className="detail-empty muted">Pick a book or press New.</div>
        )}
      </div>
      {menu && (
        <BookMenu
          book={menu}
          onClose={() => setMenu(null)}
          onOpen={() => openBook(menu.path)}
          onStatus={s => (s === "dnf" ? setDnf(menu) : setStatus(menu, s))}
          onDelete={() => remove(menu)}
        />
      )}
      {dnf && (
        <AskText
          title="Why did you stop? (optional)"
          placeholder="e.g. Too slow for me"
          okLabel="Did not finish"
          optional
          onClose={() => setDnf(null)}
          onOk={reason => {
            setDnf(null);
            setStatus(dnf, "dnf", reason);
          }}
        />
      )}
      {adding && <NewBook status={tab} onOk={create} onClose={() => setAdding(false)} />}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { loadDocs, search, type Doc, type Since } from "../data/search";
import { NoteEditor } from "./NoteEditor";
import { useApp } from "./context";

// Global search (SPEC 4.4): every area, ignores accents and case, filters by area and date.
// To-dos and inbox items open in their own screens; other notes open here.

export interface SearchState {
  text: string;
  area: string;
  since: Since;
}

export const AREA_LABEL: Record<string, string> = {
  todo: "To-do",
  inbox: "Inbox",
  ideas: "Ideas",
  projects: "Projects",
  books: "Books",
  journal: "Journal",
  review: "Review",
  thoughts: "Thoughts",
};

export const areaLabel = (a: string) => AREA_LABEL[a] ?? a;

const SINCE: { id: Since; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "week", label: "Past week" },
  { id: "month", label: "Past month" },
  { id: "year", label: "Past year" },
];

const MAX_SHOWN = 100;

interface Props {
  state: SearchState;
  setState(s: SearchState): void;
  /** Changes on Ctrl+F: puts the caret back in the field. */
  focusKey: number;
  /** Opens a to-do, inbox item, idea or book in its own screen. Returns false for other areas. */
  openElsewhere(doc: Doc): boolean;
}

export function SearchView({ state, setState, focusKey, openElsewhere }: Props) {
  const { notes, version } = useApp();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState(state.text);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadDocs(notes).then(d => alive && setDocs(d));
    return () => {
      alive = false;
    };
  }, [notes, version]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusKey]);

  // Search a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => text !== state.text && setState({ ...state, text }), 150);
    return () => clearTimeout(t);
  }, [text, state, setState]);

  const hits = useMemo(() => (docs ? search(docs, state.text, state) : []), [docs, state]);
  const areas = useMemo(() => [...new Set((docs ?? []).map(d => d.area))].sort(), [docs]);

  const pick = (d: Doc) => {
    if (!openElsewhere(d)) setOpen(d.path);
  };

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>Search</h1>
        </div>
        <div className="search-box">
          <Search size={18} className="muted" />
          <input
            ref={input}
            className="search-input"
            value={text}
            placeholder="Search everything…"
            aria-label="Search"
            autoFocus
            enterKeyHint="search"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && hits[0] && pick(hits[0].doc)}
          />
          {text && (
            <button className="btn ghost icon" aria-label="Clear" onClick={() => (setText(""), input.current?.focus())}>
              <X size={18} />
            </button>
          )}
        </div>
        <nav className="search-filters" aria-label="Area">
          {["", ...areas].map(a => (
            <button key={a} className={`chip${state.area === a ? " active" : ""}`} onClick={() => setState({ ...state, area: a })}>
              {a ? areaLabel(a) : "All"}
            </button>
          ))}
        </nav>
        <nav className="search-filters" aria-label="Date">
          {SINCE.map(s => (
            <button
              key={s.id}
              className={`chip${state.since === s.id ? " active" : ""}`}
              onClick={() => setState({ ...state, since: s.id })}
            >
              {s.label}
            </button>
          ))}
        </nav>
        {!docs ? (
          <p className="muted empty-note">Reading notes…</p>
        ) : !state.text.trim() ? (
          <p className="muted empty-note">Type to search {docs.length} notes. Accents and capitals do not matter.</p>
        ) : hits.length === 0 ? (
          <p className="muted empty-note">Nothing found.</p>
        ) : (
          <>
            <p className="muted small empty-note">
              {hits.length} {hits.length === 1 ? "result" : "results"}
              {hits.length > MAX_SHOWN && `, showing the first ${MAX_SHOWN}`}
            </p>
            <ul className="list">
              {hits.slice(0, MAX_SHOWN).map(({ doc, snippet }) => (
                <li key={doc.path}>
                  <button className={`list-item${open === doc.path ? " active" : ""}`} onClick={() => pick(doc)}>
                    <span className="list-title">{doc.title || <span className="muted">(empty)</span>}</span>
                    {snippet && (
                      <span className="search-snippet">
                        {snippet.before}
                        <mark>{snippet.match}</mark>
                        {snippet.after}
                      </span>
                    )}
                    <span className="list-meta mono">
                      {areaLabel(doc.area)}
                      {doc.date && ` · ${doc.date.replace("T", " ")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="detail-pane">
        {open ? (
          <NoteEditor key={open} path={open} onBack={() => setOpen(null)} />
        ) : (
          <div className="detail-empty muted">Results open here.</div>
        )}
      </div>
    </div>
  );
}

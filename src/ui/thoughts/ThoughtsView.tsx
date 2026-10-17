import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, Dices, ExternalLink, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { isoDate } from "../../data/dates";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import {
  KINDS,
  citation,
  filterThoughts,
  loadThoughts,
  pickForDay,
  randomThought,
  setFavorite,
  thoughtOfDay,
  values,
  type Filter,
  type Origin,
  type Thought,
  type ThoughtsState,
} from "../../data/thoughts";
import { useApp } from "../context";
import { useBack } from "../useBack";
import { ThoughtForm } from "./ThoughtForm";

// Thoughts (SPEC 5.10): the built-in library plus the user's own. Search and filters on the
// left, the open thought on the right (one at a time on the phone).

export interface ThoughtsData {
  all: Thought[];
  state: ThoughtsState;
  stateError?: string;
  loaded: boolean;
}

/** Every thought, reloaded whenever data on disk changes. */
export function useThoughts(): ThoughtsData {
  const { notes, version, toast } = useApp();
  const [data, setData] = useState<ThoughtsData>({ all: [], state: { favorites: [], days: {} }, loaded: false });
  useEffect(() => {
    let alive = true;
    loadThoughts(notes, p => toast({ text: `Could not read ${p}`, error: true })).then(r => alive && setData({ ...r, loaded: true }));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return data;
}

const ORIGINS: { id: Origin | undefined; label: string }[] = [
  { id: undefined, label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "mine", label: "Mine" },
  { id: "uncertain", label: "Uncertain" },
];

/** "verified" items need no badge; the others say what they are. */
export function kindLabel(t: Thought): string | null {
  return t.kind === "verified" ? null : KINDS.find(k => k.id === t.kind)!.label;
}

type Open = { id: string; edit?: boolean } | { new: true } | null;

export function ThoughtsView({ data, openId }: { data: ThoughtsData; openId?: { id: string; key: number } }) {
  const { notes, bump, toast } = useApp();
  const [filter, setFilter] = useState<Filter>({});
  const [open, setOpen] = useState<Open>(null);
  const [showMenus, setShowMenus] = useState(false);
  const today = isoDate();
  const fail = useCallback((e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }), [toast]);

  useEffect(() => {
    if (openId) setOpen({ id: openId.id });
  }, [openId]);

  // Ctrl+N: new thought (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen({ new: true });
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const shown = filterThoughts(data.all, filter);
  const authors = values(data.all, "author");
  const traditions = values(data.all, "tradition");
  const themes = values(data.all, "themes");
  const openThought = open && "id" in open ? data.all.find(t => t.id === open.id) : undefined;
  const ofDay = thoughtOfDay(data.all, data.state, today);
  // A filter menu in use stays visible, so it is never active unseen.
  const menusOn = !!(filter.author || filter.tradition || filter.theme);

  const favorite = async (t: Thought) => {
    try {
      const undo = await setFavorite(notes, t, !t.favorite);
      bump();
      toast({ text: t.favorite ? "Removed from favorites" : "Added to favorites", action: { label: "Undo", run: () => undo().then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const useToday = async (t: Thought) => {
    try {
      const undo = await pickForDay(notes.storage, t.id, today);
      bump();
      toast({ text: "Today's thought", action: { label: "Undo", run: () => undo().then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (t: Thought) => {
    if (!t.path) return;
    try {
      setOpen(null);
      const trashed = await moveToTrash(notes.storage, t.path);
      bump();
      toast({ text: "Thought deleted", action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, t.path!).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const select = (key: "author" | "tradition" | "theme", label: string, list: string[]) =>
    list.length > 1 && (
      <select
        className="field"
        aria-label={label}
        value={filter[key] ?? ""}
        onChange={e => setFilter(f => ({ ...f, [key]: e.target.value || undefined }))}
      >
        <option value="">{label}: all</option>
        {list.map(v => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} className={`chip${active ? " active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className={`split thoughts${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>Thoughts</h1>
          <button className="btn primary" onClick={() => setOpen({ new: true })}>
            <Plus size={18} /> New
          </button>
        </div>
        <div className="th-tools">
          <label className="th-search">
            <Search size={16} className="muted" />
            <input
              className="field"
              value={filter.text ?? ""}
              placeholder="Text, author, work, theme"
              aria-label="Search thoughts"
              onChange={e => setFilter(f => ({ ...f, text: e.target.value }))}
            />
          </label>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn ghost" title="Today's thought" onClick={() => ofDay && setOpen({ id: ofDay.thought.id })}>
              <CalendarCheck size={16} /> Today
            </button>
            <button
              className="btn ghost"
              title="A random thought"
              onClick={() => {
                const r = randomThought(shown.length ? shown : data.all, openThought?.id);
                if (r) setOpen({ id: r.id });
              }}
            >
              <Dices size={16} /> Random
            </button>
            <button
              className={`btn ghost icon${menusOn ? " fav-on" : ""}`}
              title="Filter by author, tradition, theme"
              aria-label="Filter by author, tradition, theme"
              aria-expanded={showMenus || menusOn}
              onClick={() => setShowMenus(v => !v)}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>
        <div className="chips" aria-label="Filter">
          {ORIGINS.map(o => chip(o.label, filter.origin === o.id, () => setFilter(f => ({ ...f, origin: o.id }))))}
          {chip("★ Favorites", !!filter.favorites, () => setFilter(f => ({ ...f, favorites: !f.favorites || undefined })))}
        </div>
        {(showMenus || menusOn) && (
          <div className="th-selects">
            {select("author", "Author", authors)}
            {select("tradition", "Tradition", traditions)}
            {select("theme", "Theme", themes)}
          </div>
        )}
        {data.stateError && <p className="err small">{data.stateError}</p>}
        {data.loaded && shown.length === 0 ? (
          <p className="muted empty-note">
            {filter.origin === "mine" && !filter.text ? "No thoughts of your own yet. Press New." : "No thoughts match."}
          </p>
        ) : (
          <>
            <div className="section-head">
              {shown.length === data.all.length ? "All" : "Found"} <span className="mono muted">{shown.length}</span>
            </div>
            <ul className="list">
              {shown.map(t => (
                <li key={t.id}>
                  <button className={`list-item${openThought?.id === t.id ? " active" : ""}`} onClick={() => setOpen({ id: t.id })}>
                    <span className="list-title th-text">{t.text}</span>
                    <span className="list-meta">
                      {t.favorite && "★ "}
                      {[t.author, t.work, kindLabel(t)].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="detail-pane">
        {open && "new" in open ? (
          <ThoughtForm all={data.all} onDone={id => setOpen(id ? { id } : null)} />
        ) : openThought && open && "edit" in open && open.edit ? (
          <ThoughtForm all={data.all} thought={openThought} onDone={() => setOpen({ id: openThought.id })} />
        ) : openThought ? (
          <ThoughtDetail
            thought={openThought}
            isToday={ofDay?.thought.id === openThought.id}
            onBack={() => setOpen(null)}
            onFavorite={() => favorite(openThought)}
            onToday={() => useToday(openThought)}
            onEdit={() => setOpen({ id: openThought.id, edit: true })}
            onDelete={() => remove(openThought)}
          />
        ) : (
          <div className="detail-empty muted">Pick a thought, or press New.</div>
        )}
      </div>
    </div>
  );
}

interface DetailProps {
  thought: Thought;
  isToday: boolean;
  onBack(): void;
  onFavorite(): void;
  onToday(): void;
  onEdit(): void;
  onDelete(): void;
}

function ThoughtDetail({ thought: t, isToday, onBack, onFavorite, onToday, onEdit, onDelete }: DetailProps) {
  const { platform, toast } = useApp();
  useBack(true, onBack);
  const link = /^https?:\/\//.test(t.source) && platform.openLink ? t.source : null;
  const row = (label: string, value: string) =>
    value && (
      <>
        <span className="fl">{label}</span>
        <span className="th-value">{value}</span>
      </>
    );
  const kind = kindLabel(t);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className="muted small">{t.builtin ? "Built-in" : "Mine"}</span>
        <button
          className={`btn ghost icon${t.favorite ? " fav-on" : ""}`}
          aria-label={t.favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={t.favorite}
          title="Favorite"
          onClick={onFavorite}
          style={{ marginLeft: "auto" }}
        >
          <Star size={18} fill={t.favorite ? "currentColor" : "none"} />
        </button>
        {!t.builtin && (
          <>
            <button className="btn ghost icon" aria-label="Edit thought" title="Edit" onClick={onEdit}>
              <Pencil size={18} />
            </button>
            <button className="btn ghost icon" aria-label="Delete thought" title="Delete" onClick={onDelete}>
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <blockquote className="th-quote">{t.text}</blockquote>
          {(t.author || t.work) && <div className="th-cite">— {citation(t)}</div>}
          {kind && <span className={`th-kind${t.kind === "uncertain" ? " warn" : ""}`}>{kind}</span>}
          <div className="task-fields">
            {row("Era", t.era)}
            {row("Tradition", t.tradition)}
            {row("Themes", t.themes.join(", "))}
            {row("Language", t.language)}
            {row("Translation", t.translation)}
            {t.source && (
              <>
                <span className="fl">Source</span>
                {link ? (
                  <button
                    className="btn ghost th-link"
                    title="Open in the browser"
                    onClick={() => platform.openLink!(link).catch(e => toast({ text: String(e), error: true }))}
                  >
                    <span className="mono small th-source">{t.source}</span>
                    <ExternalLink size={14} />
                  </button>
                ) : (
                  <span className="th-value mono small th-source">{t.source}</span>
                )}
              </>
            )}
          </div>
          {t.notes && <p className="th-notes">{t.notes}</p>}
          <div className="row task-actions">
            <button className="btn" disabled={isToday} onClick={onToday}>
              <CalendarCheck size={16} /> {isToday ? "Today's thought" : "Use as today's thought"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

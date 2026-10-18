import { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import { ArrowLeft, CalendarCheck, Dices, ExternalLink, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { isoDate } from "../../data/dates";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import {
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
    loadThoughts(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(r => alive && setData({ ...r, loaded: true }));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return data;
}

const ORIGINS: (Origin | undefined)[] = [undefined, "builtin", "mine", "uncertain"];

/** "verified" items need no badge; the others say what they are. */
export function kindLabel(th: Thought): string | null {
  return th.kind === "verified" ? null : t.thoughts.kinds[th.kind][0];
}

type Open = { id: string; edit?: boolean } | { new: true } | null;

export function ThoughtsView({ data, openId }: { data: ThoughtsData; openId?: { id: string; key: number } }) {
  const { notes, bump, toast, confirmDelete } = useApp();
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
  const openThought = open && "id" in open ? data.all.find(x => x.id === open.id) : undefined;
  const ofDay = thoughtOfDay(data.all, data.state, today);
  // A filter menu in use stays visible, so it is never active unseen.
  const menusOn = !!(filter.author || filter.tradition || filter.theme);

  const favorite = async (th: Thought) => {
    try {
      const undo = await setFavorite(notes, th, !th.favorite);
      bump();
      toast({ text: th.favorite ? t.thoughts.favRemoved : t.thoughts.favAdded, action: { label: t.common.undo, run: () => undo().then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const useToday = async (th: Thought) => {
    try {
      const undo = await pickForDay(notes.storage, th.id, today);
      bump();
      toast({ text: t.thoughts.todays, action: { label: t.common.undo, run: () => undo().then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (th: Thought) => {
    if (!th.path || !(await confirmDelete())) return;
    try {
      setOpen(null);
      const trashed = await moveToTrash(notes.storage, th.path);
      bump();
      toast({ text: t.thoughts.deleted, action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, th.path!).then(bump, fail) } });
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
        <option value="">{t.thoughts.selectAll(label)}</option>
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
          <h1>{t.thoughts.title}</h1>
          <button className="btn primary" onClick={() => setOpen({ new: true })}>
            <Plus size={18} /> {t.common.new}
          </button>
        </div>
        <div className="th-tools">
          <label className="th-search">
            <Search size={16} className="muted" />
            <input
              className="field"
              value={filter.text ?? ""}
              placeholder={t.thoughts.searchPlaceholder}
              aria-label={t.thoughts.search}
              onChange={e => setFilter(f => ({ ...f, text: e.target.value }))}
            />
          </label>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn ghost" title={t.thoughts.todays} onClick={() => ofDay && setOpen({ id: ofDay.thought.id })}>
              <CalendarCheck size={16} /> {t.thoughts.today}
            </button>
            <button
              className="btn ghost"
              title={t.thoughts.randomTitle}
              onClick={() => {
                const r = randomThought(shown.length ? shown : data.all, openThought?.id);
                if (r) setOpen({ id: r.id });
              }}
            >
              <Dices size={16} /> {t.thoughts.random}
            </button>
            <button
              className={`btn ghost icon${menusOn ? " fav-on" : ""}`}
              title={t.thoughts.filterBy}
              aria-label={t.thoughts.filterBy}
              aria-expanded={showMenus || menusOn}
              onClick={() => setShowMenus(v => !v)}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>
        <div className="chips" aria-label={t.ideas.filter}>
          {ORIGINS.map(o => chip(t.thoughts.origins[o ?? "all"], filter.origin === o, () => setFilter(f => ({ ...f, origin: o }))))}
          {chip(t.thoughts.favorites, !!filter.favorites, () => setFilter(f => ({ ...f, favorites: !f.favorites || undefined })))}
        </div>
        {(showMenus || menusOn) && (
          <div className="th-selects">
            {select("author", t.thoughts.author, authors)}
            {select("tradition", t.thoughts.tradition, traditions)}
            {select("theme", t.thoughts.theme, themes)}
          </div>
        )}
        {data.stateError && <p className="err small">{data.stateError}</p>}
        {data.loaded && shown.length === 0 ? (
          <p className="muted empty-note">
            {filter.origin === "mine" && !filter.text ? t.thoughts.noOwn : t.thoughts.noMatch}
          </p>
        ) : (
          <>
            <div className="section-head">
              {shown.length === data.all.length ? t.thoughts.all : t.thoughts.found} <span className="mono muted">{shown.length}</span>
            </div>
            <ul className="list">
              {shown.map(x => (
                <li key={x.id}>
                  <button className={`list-item${openThought?.id === x.id ? " active" : ""}`} onClick={() => setOpen({ id: x.id })}>
                    <span className="list-title th-text">{x.text}</span>
                    <span className="list-meta">
                      {x.favorite && "★ "}
                      {[x.author, x.work, kindLabel(x)].filter(Boolean).join(" · ")}
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
          <div className="detail-empty muted">{t.thoughts.pick}</div>
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

function ThoughtDetail({ thought: th, isToday, onBack, onFavorite, onToday, onEdit, onDelete }: DetailProps) {
  const { platform, toast } = useApp();
  useBack(true, onBack);
  const link = /^https?:\/\//.test(th.source) && platform.openLink ? th.source : null;
  const row = (label: string, value: string) =>
    value && (
      <>
        <span className="fl">{label}</span>
        <span className="th-value">{value}</span>
      </>
    );
  const kind = kindLabel(th);
  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="muted small">{th.builtin ? t.thoughts.origins.builtin : t.thoughts.origins.mine}</span>
        <button
          className={`btn ghost icon${th.favorite ? " fav-on" : ""}`}
          aria-label={th.favorite ? t.thoughts.favRemoved : t.thoughts.favAdded}
          aria-pressed={th.favorite}
          title={t.thoughts.favorite}
          onClick={onFavorite}
          style={{ marginLeft: "auto" }}
        >
          <Star size={18} fill={th.favorite ? "currentColor" : "none"} />
        </button>
        {!th.builtin && (
          <>
            <button className="btn ghost icon" aria-label={t.thoughts.editThought} title={t.common.edit} onClick={onEdit}>
              <Pencil size={18} />
            </button>
            <button className="btn ghost icon" aria-label={t.thoughts.deleteThought} title={t.common.delete} onClick={onDelete}>
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <blockquote className="th-quote">{th.text}</blockquote>
          {(th.author || th.work) && <div className="th-cite">— {citation(th)}</div>}
          {kind && <span className={`th-kind${th.kind === "uncertain" ? " warn" : ""}`}>{kind}</span>}
          <div className="task-fields">
            {row(t.thoughts.era, th.era)}
            {row(t.thoughts.tradition, th.tradition)}
            {row(t.thoughts.themes, th.themes.join(", "))}
            {row(t.thoughts.language, th.language)}
            {row(t.thoughts.translation, th.translation)}
            {th.source && (
              <>
                <span className="fl">{t.thoughts.source}</span>
                {link ? (
                  <button
                    className="btn ghost th-link"
                    title={t.books.openBrowser}
                    onClick={() => platform.openLink!(link).catch(e => toast({ text: String(e), error: true }))}
                  >
                    <span className="mono small th-source">{th.source}</span>
                    <ExternalLink size={14} />
                  </button>
                ) : (
                  <span className="th-value mono small th-source">{th.source}</span>
                )}
              </>
            )}
          </div>
          {th.notes && <p className="th-notes">{th.notes}</p>}
          <div className="row task-actions">
            <button className="btn" disabled={isToday} onClick={onToday}>
              <CalendarCheck size={16} /> {isToday ? t.thoughts.todays : t.thoughts.useToday}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

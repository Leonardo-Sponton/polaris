import { useCallback, useEffect, useRef, useState } from "react";
import { Download, PenTool, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { createDrawing, importDrawings, listDrawings, type DrawingInfo } from "../../data/drawings";
import { createFullNote, filterNotes, loadFullNotes, NOTE_SORTS, noteTags, setPinned, sortNotes, type FullNote, type NoteSort } from "../../data/fullnotes";
import { flushAll } from "../../data/pending";
import { fold } from "../../data/search";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { Dialog } from "../Dialog";
import { NoteEditor } from "../NoteEditor";
import { useApp } from "../context";
import { useHold } from "../useHold";
import { usePref } from "../study/prefs";
import { dateFmt, t } from "../../i18n";

// Notes: longer writing that stays as written (data/fullnotes). Pinned notes first, then in the
// order chosen above the list; the chips keep only pinned notes or the notes with one #tag.

/** All notes, reloaded whenever data on disk changes. */
export function useFullNotes(): FullNote[] {
  const { notes, version, toast } = useApp();
  const [list, setList] = useState<FullNote[]>([]);
  useEffect(() => {
    let alive = true;
    loadFullNotes(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(l => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return list;
}

/** "18 Oct 2026, 21:52" (from 2026-10-18T21:52). */
function when(iso: string): string {
  const d = new Date(iso.length > 10 ? iso : `${iso}T00:00`);
  if (isNaN(d.getTime())) return iso;
  return dateFmt({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

function NoteRow(props: { note: FullNote; active: boolean; onOpen(): void; onMenu(): void }) {
  const n = props.note;
  const hold = useHold(props.onMenu);
  return (
    <li className="note-li" {...hold.handlers}>
      <button className={`list-item${props.active ? " active" : ""}`} onClick={() => !hold.eaten() && props.onOpen()}>
        <span className="list-title">
          {n.pinned && <Pin size={14} className="note-pin" aria-label={t.notes.pinned} />}
          {n.title || <span className="muted">{t.common.untitled}</span>}
        </span>
        {n.preview && <span className="note-preview">{n.preview}</span>}
        <span className="list-meta mono">{when(n.modified)}</span>
      </button>
    </li>
  );
}

/** Notes that link here with [[this title]] (Obsidian's backlinks). */
function Backlinks(props: { list: FullNote[]; path: string; onOpen(path: string): void }) {
  const me = props.list.find(n => n.path === props.path);
  const key = me?.title ? fold(`[[${me.title}`).folded : "";
  const back = key ? props.list.filter(n => n.path !== props.path && (n.folded.includes(`${key}]]`) || n.folded.includes(`${key}|`) || n.folded.includes(`${key}#`))) : [];
  if (!back.length) return null;
  return (
    <div className="backlinks">
      <span className="muted small">{t.study.linkedFrom}</span>
      {back.map(b => (
        <button key={b.path} className="chip" onClick={() => props.onOpen(b.path)}>
          {b.title || t.common.untitled}
        </button>
      ))}
    </div>
  );
}

/** The drawings (drawings/*.excalidraw.md), reloaded whenever data on disk changes. */
function useDrawings(): DrawingInfo[] {
  const { notes, version } = useApp();
  const [list, setList] = useState<DrawingInfo[]>([]);
  useEffect(() => {
    let alive = true;
    listDrawings(notes.storage).then(l => alive && setList(l), () => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [notes, version]);
  return list;
}

/** Drawings: a list under the "Drawings" chip, plus import from an Obsidian vault. */
function DrawingList({ list }: { list: DrawingInfo[] }) {
  const { notes, platform, bump, toast, openDrawing } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const create = () => createDrawing(notes.storage).then(p => (bump(), openDrawing(p)), fail);

  const picked = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const res = await importDrawings(
        notes.storage,
        [...files].map(f => ({ path: f.webkitRelativePath || f.name, read: async () => new Uint8Array(await f.arrayBuffer()) })),
      );
      bump();
      toast({ text: res.added.length || res.skipped.length ? t.drawings.imported(res.added.length, res.skipped.length) : t.drawings.noneFound });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  // The PC picks the whole vault folder; Android picks files (its file chooser has no folders).
  const folder = platform.name === "electron";
  return (
    <>
      <div className="row drawing-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn" onClick={create}>
          <PenTool size={18} /> {t.drawings.newDrawing}
        </button>
        <button className="btn" disabled={busy} title={t.drawings.importHint} onClick={() => input.current?.click()}>
          <Download size={18} /> {t.drawings.importObsidian}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          {...(folder ? { webkitdirectory: "" } : {})}
          onChange={e => void picked(e.target.files)}
        />
      </div>
      {list.length === 0 ? (
        <p className="muted empty-note">{t.drawings.empty}</p>
      ) : (
        <ul className="list">
          {list.map(d => (
            <li key={d.path} className="note-li">
              <button className="list-item" onClick={() => openDrawing(d.path)}>
                <span className="list-title">
                  <PenTool size={14} className="note-pin" /> {d.title}
                </span>
                <span className="list-meta mono">{when(new Date(d.modified).toISOString())}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NotesView(props: { list: FullNote[]; openPath?: { path: string; key: number; isNew?: boolean } }) {
  const { notes, bump, toast, confirmDelete, openDrawing } = useApp();
  const drawings = useDrawings();
  const [open, setOpen] = useState<{ path: string; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<FullNote | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = usePref<NoteSort>("polaris.notes.sort", "modified");
  const [only, setOnly] = usePref<string>("polaris.notes.only", "");

  useEffect(() => {
    if (props.openPath) setOpen({ path: props.openPath.path, isNew: !!props.openPath.isNew });
  }, [props.openPath]);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  const create = async () => {
    try {
      const n = await createFullNote(notes);
      setOpen({ path: n.path, isNew: true });
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (path: string) => {
    if (!(await confirmDelete(props.list.find(n => n.path === path)?.title))) return;
    try {
      await flushAll(); // the open editor writes its last edits first
      if (open?.path === path) setOpen(null);
      const trashed = await moveToTrash(notes.storage, path);
      bump();
      toast({
        text: t.notes.deleted,
        action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  const pin = async (path: string, on: boolean) => {
    try {
      await flushAll();
      await setPinned(notes, path, on);
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const tags = noteTags(props.list);
  // A tag that is gone (last note with it changed) stops filtering.
  const tag = only.startsWith("#") && tags.some(x => x.tag === only.slice(1)) ? only.slice(1) : undefined;
  const pinnedOnly = only === "pinned";
  const drawingsOnly = only === "drawings";
  const shown = sortNotes(filterNotes(props.list, query, { tag, pinned: pinnedOnly }), NOTE_SORTS.includes(sort) ? sort : "modified");
  const anyPinned = props.list.some(n => n.pinned);

  const item = (label: string, icon: React.ReactNode, run: () => void, cls = "") => (
    <button
      className={`menu-item${cls}`}
      onClick={() => {
        setMenu(null);
        run();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>{t.notes.title}</h1>
          <button className="btn icon" style={{ marginLeft: "auto" }} title={t.drawings.newDrawing} aria-label={t.drawings.newDrawing} onClick={() => createDrawing(notes.storage).then(p => (bump(), openDrawing(p)), fail)}>
            <PenTool size={18} />
          </button>
          <button className="btn primary" onClick={create}>
            <Plus size={18} /> {t.common.new}
          </button>
        </div>
        {props.list.length > 0 && (
          <div className="note-filter">
            <Search size={16} className="muted" />
            <input
              className="field"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.notes.filter}
              aria-label={t.notes.filter}
            />
          </div>
        )}
        {(props.list.length > 0 || drawings.length > 0) && (
          <div className="chips note-chips" role="tablist" aria-label={t.notes.show}>
            <select className="field note-sort" value={sort} aria-label={t.notes.sortBy} title={t.notes.sortBy} onChange={e => setSort(e.target.value as NoteSort)}>
              {NOTE_SORTS.map(s => (
                <option key={s} value={s}>
                  {t.notes.sorts[s]}
                </option>
              ))}
            </select>
            <button role="tab" aria-selected={!tag && !pinnedOnly && !drawingsOnly} className={`chip${!tag && !pinnedOnly && !drawingsOnly ? " active" : ""}`} onClick={() => setOnly("")}>
              {t.common.all}
            </button>
            <button role="tab" aria-selected={drawingsOnly} className={`chip${drawingsOnly ? " active" : ""}`} onClick={() => setOnly(drawingsOnly ? "" : "drawings")}>
              <PenTool size={13} /> {t.drawings.title} {drawings.length > 0 && <span className="muted mono small">{drawings.length}</span>}
            </button>
            {anyPinned && (
              <button role="tab" aria-selected={pinnedOnly} className={`chip${pinnedOnly ? " active" : ""}`} onClick={() => setOnly(pinnedOnly ? "" : "pinned")}>
                <Pin size={13} /> {t.notes.pinnedChip}
              </button>
            )}
            {tags.map(x => (
              <button key={x.tag} role="tab" aria-selected={tag === x.tag} className={`chip${tag === x.tag ? " active" : ""}`} onClick={() => setOnly(tag === x.tag ? "" : `#${x.tag}`)}>
                #{x.tag} <span className="muted mono small">{x.count}</span>
              </button>
            ))}
          </div>
        )}
        {drawingsOnly ? (
          <DrawingList list={drawings} />
        ) : props.list.length === 0 ? (
          <p className="muted empty-note">{t.notes.empty}</p>
        ) : shown.length === 0 ? (
          <p className="muted empty-note">{t.notes.noMatch}</p>
        ) : (
          <ul className="list">
            {shown.map(n => (
              <NoteRow
                key={n.path}
                note={n}
                active={open?.path === n.path}
                onOpen={() => setOpen({ path: n.path, isNew: false })}
                onMenu={() => setMenu(n)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="detail-pane">
        {open ? (
          <NoteEditor
            key={open.path}
            path={open.path}
            placeholder={t.notes.placeholder}
            onBack={() => setOpen(null)}
            removeIfEmpty
            autoFocus={open.isNew}
            footer={<Backlinks list={props.list} path={open.path} onOpen={path => setOpen({ path, isNew: false })} />}
            actions={f => {
              const pinned = f.data().pinned === true;
              const label = pinned ? t.notes.unpin : t.notes.pin;
              return (
                <>
                  <button
                    className="btn ghost icon"
                    title={label}
                    aria-label={label}
                    aria-pressed={pinned}
                    onClick={() => f.setData({ pinned: pinned ? undefined : true })}
                  >
                    {pinned ? <PinOff size={18} /> : <Pin size={18} />}
                  </button>
                  <button className="btn ghost icon" title={t.common.delete} aria-label={t.notes.deleteNote} onClick={() => remove(open.path)}>
                    <Trash2 size={18} />
                  </button>
                </>
              );
            }}
          />
        ) : (
          <div className="detail-empty muted">{t.notes.pick}</div>
        )}
      </div>
      {menu && (
        <Dialog title={menu.title || t.common.untitled} onClose={() => setMenu(null)}>
          <div className="stack" style={{ gap: 2 }}>
            {item(t.common.open, <Pencil size={18} />, () => setOpen({ path: menu.path, isNew: false }))}
            {menu.pinned
              ? item(t.notes.unpin, <PinOff size={18} />, () => pin(menu.path, false))
              : item(t.notes.pin, <Pin size={18} />, () => pin(menu.path, true))}
            {item(t.common.delete, <Trash2 size={18} />, () => remove(menu.path), " danger")}
          </div>
        </Dialog>
      )}
    </div>
  );
}

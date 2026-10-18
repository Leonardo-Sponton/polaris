import { useCallback, useEffect, useState } from "react";
import { Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { createFullNote, filterNotes, loadFullNotes, setPinned, type FullNote } from "../../data/fullnotes";
import { flushAll } from "../../data/pending";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { Dialog } from "../Dialog";
import { NoteEditor } from "../NoteEditor";
import { useApp } from "../context";
import { useHold } from "../useHold";
import { dateFmt, t } from "../../i18n";

// Notes: longer writing that stays as written (data/fullnotes). Pinned notes first.

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

export function NotesView(props: { list: FullNote[]; openPath?: { path: string; key: number; isNew?: boolean } }) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<{ path: string; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<FullNote | null>(null);
  const [query, setQuery] = useState("");

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

  const shown = filterNotes(props.list, query);

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
        {props.list.length === 0 ? (
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

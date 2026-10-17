import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { previewOf } from "../data/frontmatter";
import { createInboxItem, inboxToIdea, inboxToTodo, loadInbox, undoMove, type Moved } from "../data/inbox";
import type { Note } from "../data/notes";
import { flushAll } from "../data/pending";
import { moveToTrash, restoreFromTrash } from "../data/trash";
import { Dialog } from "./Dialog";
import { NoteEditor } from "./NoteEditor";
import { useApp } from "./context";
import { useHold } from "./useHold";
import { t } from "../i18n";

// Inbox (SPEC 5.2): captured items wait here until they become a to-do or an idea.

/** Inbox items, newest first, reloaded whenever data on disk changes. */
export function useInbox(): Note[] {
  const { notes, version, toast } = useApp();
  const [items, setItems] = useState<Note[]>([]);
  useEffect(() => {
    let alive = true;
    loadInbox(notes, p => toast({ text: t.common.couldNotRead(p), error: true })).then(list => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return items;
}

type Action = "todo" | "idea" | "delete";

function ItemRow({
  note,
  active,
  onOpen,
  onMenu,
  onTodo,
}: {
  note: Note;
  active: boolean;
  onOpen(): void;
  onMenu(): void;
  onTodo(): void;
}) {
  const hold = useHold(onMenu);
  return (
    <li className="inbox-li" {...hold.handlers}>
      <button className={`list-item${active ? " active" : ""}`} onClick={() => !hold.eaten() && onOpen()}>
        <span className="list-title">{previewOf(note.body) || <span className="muted">{t.common.empty}</span>}</span>
        <span className="list-meta mono">{String(note.data.created ?? "").replace("T", " ")}</span>
      </button>
      <button className="btn ghost icon" title={t.inbox.makeTodo} aria-label={t.inbox.makeTodo} onClick={onTodo}>
        <CheckSquare size={18} />
      </button>
    </li>
  );
}

export function InboxView({ items, openPath }: { items: Note[]; openPath?: { path: string; key: number } }) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<{ path: string; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<Note | null>(null);

  useEffect(() => {
    if (openPath) setOpen({ path: openPath.path, isNew: false });
  }, [openPath]);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  const create = async () => {
    try {
      const n = await createInboxItem(notes, "");
      setOpen({ path: n.path, isNew: true });
      bump();
    } catch (e) {
      fail(e);
    }
  };

  const act = async (path: string, action: Action) => {
    try {
      await flushAll(); // the open editor writes its last edits first
      if (open?.path === path) setOpen(null);
      if (action === "delete") {
        const trashed = await moveToTrash(notes.storage, path);
        bump();
        toast({
          text: t.inbox.deleted,
          action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
        });
        return;
      }
      const m: Moved = action === "todo" ? await inboxToTodo(notes, path) : await inboxToIdea(notes, path);
      bump();
      toast({
        text: action === "todo" ? t.inbox.movedTodo : t.inbox.movedIdea,
        action: { label: t.common.undo, run: () => undoMove(notes, m).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

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
          <h1>{t.inbox.title}</h1>
          <button className="btn primary" onClick={create}>
            <Plus size={18} /> {t.common.new}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted empty-note">{t.inbox.empty}</p>
        ) : (
          <ul className="list">
            {items.map(n => (
              <ItemRow
                key={n.path}
                note={n}
                active={open?.path === n.path}
                onOpen={() => setOpen({ path: n.path, isNew: false })}
                onMenu={() => setMenu(n)}
                onTodo={() => act(n.path, "todo")}
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
            placeholder={t.inbox.placeholder}
            onBack={() => setOpen(null)}
            removeIfEmpty
            autoFocus={open.isNew}
            actions={
              <>
                <button className="btn ghost icon" title={t.inbox.makeTodo} aria-label={t.inbox.makeTodo} onClick={() => act(open.path, "todo")}>
                  <CheckSquare size={18} />
                </button>
                <button className="btn ghost icon" title={t.inbox.makeIdea} aria-label={t.inbox.makeIdea} onClick={() => act(open.path, "idea")}>
                  <Lightbulb size={18} />
                </button>
                <button className="btn ghost icon" title={t.common.delete} aria-label={t.inbox.deleteItem} onClick={() => act(open.path, "delete")}>
                  <Trash2 size={18} />
                </button>
              </>
            }
          />
        ) : (
          <div className="detail-empty muted">{t.inbox.pick}</div>
        )}
      </div>
      {menu && (
        <Dialog title={previewOf(menu.body) || t.common.empty} onClose={() => setMenu(null)}>
          <div className="stack" style={{ gap: 2 }}>
            {item(t.common.open, <Pencil size={18} />, () => setOpen({ path: menu.path, isNew: false }))}
            {item(t.inbox.makeTodo, <CheckSquare size={18} />, () => act(menu.path, "todo"))}
            {item(t.inbox.makeIdea, <Lightbulb size={18} />, () => act(menu.path, "idea"))}
            {item(t.common.delete, <Trash2 size={18} />, () => act(menu.path, "delete"), " danger")}
          </div>
        </Dialog>
      )}
    </div>
  );
}

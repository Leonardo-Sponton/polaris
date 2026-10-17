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

// Inbox (SPEC 5.2): captured items wait here until they become a to-do or an idea.

/** Inbox items, newest first, reloaded whenever data on disk changes. */
export function useInbox(): Note[] {
  const { notes, version, toast } = useApp();
  const [items, setItems] = useState<Note[]>([]);
  useEffect(() => {
    let alive = true;
    loadInbox(notes, p => toast({ text: `Could not read ${p}`, error: true })).then(list => alive && setItems(list));
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
        <span className="list-title">{previewOf(note.body) || <span className="muted">(empty)</span>}</span>
        <span className="list-meta mono">{String(note.data.created ?? "").replace("T", " ")}</span>
      </button>
      <button className="btn ghost icon" title="Make it a to-do" aria-label="Make it a to-do" onClick={onTodo}>
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
          text: "Item deleted",
          action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
        });
        return;
      }
      const m: Moved = action === "todo" ? await inboxToTodo(notes, path) : await inboxToIdea(notes, path);
      bump();
      toast({
        text: action === "todo" ? "Moved to To-do · Anytime" : "Moved to Ideas · Draft",
        action: { label: "Undo", run: () => undoMove(notes, m).then(bump, fail) },
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
          <h1>Inbox</h1>
          <button className="btn primary" onClick={create}>
            <Plus size={18} /> New
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted empty-note">Empty. Things you capture on Today land here.</p>
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
            placeholder="Write anything… (start the first line with # for a title)"
            onBack={() => setOpen(null)}
            removeIfEmpty
            autoFocus={open.isNew}
            actions={
              <>
                <button className="btn ghost icon" title="Make it a to-do" aria-label="Make it a to-do" onClick={() => act(open.path, "todo")}>
                  <CheckSquare size={18} />
                </button>
                <button className="btn ghost icon" title="Make it an idea" aria-label="Make it an idea" onClick={() => act(open.path, "idea")}>
                  <Lightbulb size={18} />
                </button>
                <button className="btn ghost icon" title="Delete" aria-label="Delete item" onClick={() => act(open.path, "delete")}>
                  <Trash2 size={18} />
                </button>
              </>
            }
          />
        ) : (
          <div className="detail-empty muted">Pick an item or press New.</div>
        )}
      </div>
      {menu && (
        <Dialog title={previewOf(menu.body) || "(empty)"} onClose={() => setMenu(null)}>
          <div className="stack" style={{ gap: 2 }}>
            {item("Open", <Pencil size={18} />, () => setOpen({ path: menu.path, isNew: false }))}
            {item("Make it a to-do", <CheckSquare size={18} />, () => act(menu.path, "todo"))}
            {item("Make it an idea", <Lightbulb size={18} />, () => act(menu.path, "idea"))}
            {item("Delete", <Trash2 size={18} />, () => act(menu.path, "delete"), " danger")}
          </div>
        </Dialog>
      )}
    </div>
  );
}

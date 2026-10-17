import { useState } from "react";
import { ArrowLeft, Ban, CalendarDays, Check, FolderInput, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { TodoList } from "../../data/lists";
import type { Task } from "../../data/todo";
import { Dialog } from "../Dialog";

// Options for one task: opened by holding the row on a touch screen (the usual Android
// gesture) or by right-clicking it on the PC.

interface Props {
  task: Task;
  lists: TodoList[];
  onOpen(): void;
  onToggle(): void;
  onSchedule(): void;
  onMove(list: string | undefined): void;
  onCancelTask(): void;
  onDelete(): void;
  onClose(): void;
}

export function TaskMenu({ task: t, lists, onOpen, onToggle, onSchedule, onMove, onCancelTask, onDelete, onClose }: Props) {
  const [moving, setMoving] = useState(false);
  const open = t.status === "open";
  // Every option closes the menu first; the dialog it may open replaces it.
  const item = (label: string, icon: React.ReactNode, run: () => void, cls = "") => (
    <button
      className={`menu-item${cls}`}
      onClick={() => {
        onClose();
        run();
      }}
    >
      {icon}
      {label}
    </button>
  );

  if (moving) {
    return (
      <Dialog title="Move to list" onClose={onClose}>
        <div className="stack" style={{ gap: 2 }}>
          <button className="menu-item" onClick={() => setMoving(false)}>
            <ArrowLeft size={18} />
            Back
          </button>
          {lists.map(l =>
            item(
              l.name,
              <span className="dot" style={{ background: `var(--${l.color})`, margin: "0 4px" }} />,
              () => onMove(l.id),
              t.list === l.id ? " active" : "",
            ),
          )}
          {t.list && item("No list", <X size={18} />, () => onMove(undefined))}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t.title || "(no title)"} onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {item("Open", <Pencil size={18} />, onOpen)}
        {open
          ? item("Mark as done", <Check size={18} />, onToggle)
          : item("Reopen", <RotateCcw size={18} />, onToggle)}
        {open && item("When…", <CalendarDays size={18} />, onSchedule)}
        {lists.length > 0 && (
          <button className="menu-item" onClick={() => setMoving(true)}>
            <FolderInput size={18} />
            Move to list…
          </button>
        )}
        {open && item("Cancel task", <Ban size={18} />, onCancelTask)}
        {item("Delete", <Trash2 size={18} />, onDelete, " danger")}
      </div>
    </Dialog>
  );
}

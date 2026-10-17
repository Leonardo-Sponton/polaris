import { useState } from "react";
import { ArrowLeft, BookMarked, Pencil, Trash2 } from "lucide-react";
import { STATUSES, type Book, type BookStatus } from "../../data/books";
import { Dialog } from "../Dialog";

// Options for one book, as in the task and idea rows: hold the card on a touch screen,
// right-click it on the PC.

interface Props {
  book: Book;
  onOpen(): void;
  onStatus(s: BookStatus): void;
  onDelete(): void;
  onClose(): void;
}

export function BookMenu({ book: b, onOpen, onStatus, onDelete, onClose }: Props) {
  const [picking, setPicking] = useState(false);
  // Every option closes the menu first; the dialog it may open replaces it.
  const item = (label: string, icon: React.ReactNode, run: () => void, cls = "") => (
    <button
      key={label}
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

  if (picking) {
    return (
      <Dialog title="Status" onClose={onClose}>
        <div className="stack" style={{ gap: 2 }}>
          <button className="menu-item" onClick={() => setPicking(false)}>
            <ArrowLeft size={18} />
            Back
          </button>
          {STATUSES.map(s =>
            item(s.label, <BookMarked size={18} />, () => onStatus(s.id), b.status === s.id ? " active" : ""),
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={b.title || "(untitled)"} onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {item("Open", <Pencil size={18} />, onOpen)}
        <button className="menu-item" onClick={() => setPicking(true)}>
          <BookMarked size={18} />
          Status…
        </button>
        {item("Delete", <Trash2 size={18} />, onDelete, " danger")}
      </div>
    </Dialog>
  );
}

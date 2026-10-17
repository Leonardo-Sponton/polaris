import { useState } from "react";
import { Archive, ArrowLeft, LayoutTemplate, Pencil, RotateCcw, Sprout, Trash2, Undo2 } from "lucide-react";
import { TEMPLATES, type Idea, type Template } from "../../data/ideas";
import { Dialog } from "../Dialog";

// Options for one idea, as in the task rows: hold the row on a touch screen, right-click it on
// the PC.

interface Props {
  idea: Idea;
  onOpen(): void;
  onStatus(status: "draft" | "maturing"): void;
  onTemplate(t: Template): void;
  onArchive(): void;
  onReopen(): void;
  onDelete(): void;
  onClose(): void;
}

export function IdeaMenu({ idea: i, onOpen, onStatus, onTemplate, onArchive, onReopen, onDelete, onClose }: Props) {
  const [picking, setPicking] = useState(false);
  const active = i.status === "draft" || i.status === "maturing";
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
      <Dialog title="Template" onClose={onClose}>
        <div className="stack" style={{ gap: 2 }}>
          <button className="menu-item" onClick={() => setPicking(false)}>
            <ArrowLeft size={18} />
            Back
          </button>
          {TEMPLATES.map(t =>
            item(t.label, <LayoutTemplate size={18} />, () => onTemplate(t.id), i.template === t.id ? " active" : ""),
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={i.title || "(untitled)"} onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {item("Open", <Pencil size={18} />, onOpen)}
        {i.status === "draft" && item("Move to Maturing", <Sprout size={18} />, () => onStatus("maturing"))}
        {i.status === "maturing" && item("Back to Draft", <Undo2 size={18} />, () => onStatus("draft"))}
        <button className="menu-item" onClick={() => setPicking(true)}>
          <LayoutTemplate size={18} />
          Template…
        </button>
        {active && item("Archive…", <Archive size={18} />, onArchive)}
        {i.status === "archived" && item("Reopen", <RotateCcw size={18} />, onReopen)}
        {item("Delete", <Trash2 size={18} />, onDelete, " danger")}
      </div>
    </Dialog>
  );
}

import { useState } from "react";
import { t } from "../../i18n";
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
      <Dialog title={t.ideas.fTemplate} onClose={onClose}>
        <div className="stack" style={{ gap: 2 }}>
          <button className="menu-item" onClick={() => setPicking(false)}>
            <ArrowLeft size={18} />
            {t.common.back}
          </button>
          {TEMPLATES.map(x =>
            item(t.ideas.templates[x.id], <LayoutTemplate size={18} />, () => onTemplate(x.id), i.template === x.id ? " active" : ""),
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={i.title || t.common.untitled} onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {item(t.common.open, <Pencil size={18} />, onOpen)}
        {i.status === "draft" && item(t.ideas.moveMaturing, <Sprout size={18} />, () => onStatus("maturing"))}
        {i.status === "maturing" && item(t.ideas.backToDraft, <Undo2 size={18} />, () => onStatus("draft"))}
        <button className="menu-item" onClick={() => setPicking(true)}>
          <LayoutTemplate size={18} />
          {t.ideas.templateDots}
        </button>
        {active && item(t.ideas.archiveDots, <Archive size={18} />, onArchive)}
        {i.status === "archived" && item(t.todo.reopen, <RotateCcw size={18} />, onReopen)}
        {item(t.common.delete, <Trash2 size={18} />, onDelete, " danger")}
      </div>
    </Dialog>
  );
}

import { useState } from "react";
import { Flag, Pause, Pencil, Play, RotateCcw, Skull, Trash2 } from "lucide-react";
import { DECISIONS, earlierSteps, type Decision, type Gate, type Project } from "../../data/projects";
import { Dialog } from "../Dialog";

// Gates (SPEC 5.5): the decision taken when a step ends, its history on the project page, and the
// project's options menu (hold a row in the list, right-click it on the PC).

interface GateProps {
  project: Project;
  initial?: Decision;
  onOk(decision: Decision, reason: string, to?: string): void;
  onClose(): void;
}

export function GateDialog({ project: p, initial = "go", onOk, onClose }: GateProps) {
  const back = earlierSteps(p);
  const [decision, setDecision] = useState<Decision>(initial === "recycle" && !back.length ? "go" : initial);
  const [reason, setReason] = useState("");
  const [to, setTo] = useState(back.at(-1)?.id ?? "");
  const at = p.flow.steps.indexOf(p.step);
  const next = p.flow.steps[at + 1];
  const needsReason = decision === "kill";
  const ok = () => (!needsReason || reason.trim()) && onOk(decision, reason.trim(), decision === "recycle" ? to : undefined);

  const outcome: Record<Decision, string> = {
    go: next ? `Next step: ${at + 2}. ${next.name}` : "This is the last step: the project will be marked Done.",
    hold: "The project goes to On hold. Resume it any time.",
    kill: "The project ends. Its notes stay where they are.",
    recycle: "",
  };

  return (
    <Dialog title={`End of step ${at + 1}: ${p.step.name}`} onClose={onClose}>
      <div className="segmented" role="radiogroup" aria-label="Decision">
        {DECISIONS.map(d => (
          <button
            key={d.id}
            role="radio"
            aria-checked={decision === d.id}
            aria-pressed={decision === d.id}
            disabled={d.id === "recycle" && !back.length}
            onClick={() => setDecision(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {DECISIONS.find(d => d.id === decision)!.hint}
      </p>
      {decision === "recycle" ? (
        <label className="stack" style={{ gap: 4 }}>
          <span className="fl">Back to</span>
          <select className="field" value={to} onChange={e => setTo(e.target.value)}>
            {back.map(s => (
              <option key={s.id} value={s.id}>
                {p.flow.steps.indexOf(s) + 1}. {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          {outcome[decision]}
        </p>
      )}
      <textarea
        className="field"
        rows={3}
        value={reason}
        placeholder={needsReason ? "Why? (required)" : "Why? (optional)"}
        aria-label="Reason"
        onChange={e => setReason(e.target.value)}
      />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={needsReason && !reason.trim()} onClick={ok}>
          Decide
        </button>
      </div>
    </Dialog>
  );
}

const LABEL: Record<Decision, string> = { go: "Go", hold: "Hold", kill: "Kill", recycle: "Recycle" };

/** The decisions taken so far, newest first. */
export function GateHistory({ project: p }: { project: Project }) {
  if (!p.gates.length) return null;
  const name = (id: string) => {
    const i = p.flow.steps.findIndex(s => s.id === id);
    return i < 0 ? id : `${i + 1}. ${p.flow.steps[i].name}`;
  };
  return (
    <ul className="gates" aria-label="Decisions">
      {[...p.gates].reverse().map((g: Gate, i) => (
        <li key={i}>
          <div className="row gate-head">
            <span className={`gate-tag ${g.decision}`}>{LABEL[g.decision]}</span>
            <span className="small">
              {name(g.step)}
              {g.to && ` → ${name(g.to)}`}
            </span>
            <span className="muted small mono gate-date">{g.date}</span>
          </div>
          {g.reason && <p className="gate-reason small">{g.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

interface MenuProps {
  project: Project;
  onOpen(): void;
  onGate(d: Decision): void;
  onResume(): void;
  onDelete(): void;
  onClose(): void;
}

export function ProjectMenu({ project: p, onOpen, onGate, onResume, onDelete, onClose }: MenuProps) {
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
  const closed = p.status === "done" || p.status === "killed";
  return (
    <Dialog title={p.title || "(untitled)"} onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {item("Open", <Pencil size={18} />, onOpen)}
        {p.status === "active" && item("Finish this step…", <Flag size={18} />, () => onGate("go"))}
        {p.status === "active" && item("Put on hold…", <Pause size={18} />, () => onGate("hold"))}
        {p.status === "on-hold" && item("Resume", <Play size={18} />, onResume)}
        {closed && item("Reopen", <RotateCcw size={18} />, onResume)}
        {!closed && item("Kill…", <Skull size={18} />, () => onGate("kill"))}
        {item("Delete", <Trash2 size={18} />, onDelete, " danger")}
      </div>
    </Dialog>
  );
}

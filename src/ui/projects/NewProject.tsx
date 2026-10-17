import { useState } from "react";
import { FLOWS, type FlowId } from "../../data/flows";
import { Dialog } from "../Dialog";

// Name and flow of a new project (SPEC 5.5), blank or from an idea ("Make it a project").

export function NewProject(props: {
  title: string;
  initialName?: string;
  initialFlow?: FlowId;
  okLabel?: string;
  onOk(name: string, flow: FlowId): void;
  onClose(): void;
}) {
  const [name, setName] = useState(props.initialName ?? "");
  const [flow, setFlow] = useState<FlowId>(props.initialFlow ?? "software");
  const ok = () => name.trim() && props.onOk(name.trim(), flow);
  const steps = FLOWS.find(f => f.id === flow)!.steps;
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <input
        className="field"
        autoFocus
        value={name}
        placeholder="Project name"
        aria-label="Project name"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ok()}
      />
      <span className="fl">Flow</span>
      <div className="segmented" role="group" aria-label="Flow">
        {FLOWS.map(f => (
          <button key={f.id} aria-pressed={flow === f.id} onClick={() => setFlow(f.id)}>
            {f.name}
          </button>
        ))}
      </div>
      <ol className="flow-preview muted small">
        {steps.map(s => (
          <li key={s.id}>{s.name}</li>
        ))}
      </ol>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={ok}>
          {props.okLabel ?? "Create"}
        </button>
      </div>
    </Dialog>
  );
}

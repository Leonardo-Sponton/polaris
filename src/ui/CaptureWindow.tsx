import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Capture } from "../data/inbox";
import { useApp } from "./context";
import { QuickAdd } from "./todo/QuickAdd";
import { useCapture, whereLabel } from "./useCapture";

// The small window opened by `hypomnemata --capture` (SPEC 5.2): type, Enter, gone.

export function CaptureWindow() {
  const { platform } = useApp();
  const save = useCapture({ quiet: true });
  const [saved, setSaved] = useState<string | null>(null);
  const close = () => platform.closeWindow?.();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const onCapture = async (c: Capture) => {
    if (!(await save(c))) return false;
    setSaved(whereLabel(c));
    setTimeout(close, 700);
    return true;
  };

  return (
    <div className="capture-window">
      {saved ? (
        <p className="capture-done">
          <Check size={20} /> Added to {saved}
        </p>
      ) : (
        <>
          <QuickAdd placeholder="Capture anything…" autoFocus onCapture={onCapture} />
          <p className="muted capture-hint mono">Enter saves · Esc closes · t = to-do, or add a date, #list</p>
        </>
      )}
    </div>
  );
}

/** Shown in the capture window when the app was never set up. */
export function CaptureNotReady() {
  return (
    <div className="capture-window">
      <p className="muted">Open Hypomnemata once to choose the data folder, then capture works.</p>
    </div>
  );
}

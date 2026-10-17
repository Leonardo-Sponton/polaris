import { useState } from "react";
import { closeDay, type Closing } from "../../data/journal";
import { flushAll } from "../../data/pending";
import { Dialog } from "../Dialog";
import { useApp } from "../context";

// Close the day (SPEC 5.9): three short, optional questions; each answer goes to one place.

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export const shortDay = (day: string) => SHORT.format(new Date(`${day}T12:00`));

export function CloseDay({ day, onClose }: { day: string; onClose(): void }) {
  const { notes, bump, toast } = useApp();
  const [c, setC] = useState<Closing>({ how: "", learned: "", intentions: "" });
  const [busy, setBusy] = useState(false);
  const d = shortDay(day);
  const questions: { key: keyof Closing; q: string; where: string; hint?: string }[] = [
    { key: "how", q: "How was the day?", where: `Goes to the end of the Journal of ${d}.`, hint: "What happened, how you felt…" },
    {
      key: "learned",
      q: "What did I learn from what I lived and from my choices?",
      where: `Goes to “Learnings” in the Journal of ${d}.`,
    },
    {
      key: "intentions",
      q: "One or two concrete intentions for tomorrow",
      where: `Goes to “Intentions for tomorrow” in the Review of ${d}.`,
      hint: "e.g. Go to bed before midnight",
    },
  ];
  const empty = !Object.values(c).some(t => t.trim());

  const save = async () => {
    setBusy(true);
    try {
      await flushAll(); // an open journal page writes its last edits first
      const written = await closeDay(notes, day, c);
      bump();
      const where = written.map(p => (p.startsWith("journal/") ? "Journal" : "Review")).join(" and ");
      toast({ text: `Saved to the ${where} of ${d}` });
      onClose();
    } catch (e) {
      setBusy(false);
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <Dialog title={`Close the day · ${d}`} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Three short, optional steps. Empty answers are skipped.
      </p>
      {questions.map((x, i) => (
        <label key={x.key} className="close-q">
          <span className="close-title">
            {i + 1}. {x.q}
          </span>
          <span className="muted small">{x.where}</span>
          <textarea
            className="field close-input"
            rows={3}
            value={c[x.key]}
            placeholder={x.hint}
            autoFocus={i === 0}
            onChange={e => setC({ ...c, [x.key]: e.target.value })}
          />
        </label>
      ))}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={empty || busy} onClick={save}>
          Save
        </button>
      </div>
    </Dialog>
  );
}

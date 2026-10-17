import { useState } from "react";
import { dateFmt, t, word } from "../../i18n";
import { closeDay, INTENTIONS, LEARNINGS, type Closing } from "../../data/journal";
import { flushAll } from "../../data/pending";
import { Dialog } from "../Dialog";
import { useApp } from "../context";

// Close the day (SPEC 5.9): three short, optional questions; each answer goes to one place.

export const shortDay = (day: string) => dateFmt({ day: "numeric", month: "short" }).format(new Date(`${day}T12:00`));

export function CloseDay({ day, onClose }: { day: string; onClose(): void }) {
  const { notes, bump, toast } = useApp();
  const [c, setC] = useState<Closing>({ how: "", learned: "", intentions: "" });
  const [busy, setBusy] = useState(false);
  const d = shortDay(day);
  const questions: { key: keyof Closing; q: string; where: string; hint?: string }[] = [
    { key: "how", q: t.journal.qHow, where: t.journal.qHowWhere(d), hint: t.journal.qHowHint },
    { key: "learned", q: t.journal.qLearned, where: t.journal.qLearnedWhere(d, word(LEARNINGS)) },
    {
      key: "intentions",
      q: t.journal.qIntentions,
      where: t.journal.qIntentionsWhere(d, word(INTENTIONS)),
      hint: t.journal.qIntentionsHint,
    },
  ];
  const empty = !Object.values(c).some(x => x.trim());

  const save = async () => {
    setBusy(true);
    try {
      await flushAll(); // an open journal page writes its last edits first
      const written = await closeDay(notes, day, c);
      bump();
      toast({ text: t.journal.savedTo(written.some(p => p.startsWith("journal/")), written.some(p => p.startsWith("review/")), d) });
      onClose();
    } catch (e) {
      setBusy(false);
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <Dialog title={t.journal.closeTitle(d)} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {t.journal.closeIntro}
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
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={empty || busy} onClick={save}>
          {t.common.save}
        </button>
      </div>
    </Dialog>
  );
}

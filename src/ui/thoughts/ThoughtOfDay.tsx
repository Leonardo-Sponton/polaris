import { Feather } from "lucide-react";
import { isoDate } from "../../data/dates";
import { citation, thoughtOfDay, type Thought } from "../../data/thoughts";
import type { ThoughtsData } from "./ThoughtsView";

/** The thought of the day (SPEC 5.10) on Today; later also at the top of the Review. */
export function ThoughtOfDay({ data, onOpen }: { data: ThoughtsData; onOpen(t: Thought): void }) {
  const d = thoughtOfDay(data.all, data.state, isoDate());
  if (!data.loaded || !d) return null;
  const t = d.thought;
  return (
    <div className="today-card quote-review" aria-label="Thought of the day">
      <div className="qr-head muted small">
        <Feather size={16} />
        <span>Thought of the day</span>
        {d.picked && <span className="count">picked</span>}
      </div>
      <blockquote className="qr-text">{t.text}</blockquote>
      {(t.author || t.work) && <div className="qr-source muted small">— {citation(t)}</div>}
      <div className="row qr-actions">
        <button className="btn ghost" onClick={() => onOpen(t)}>
          Open
        </button>
      </div>
    </div>
  );
}

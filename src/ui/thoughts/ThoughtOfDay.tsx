import { Feather } from "lucide-react";
import { t } from "../../i18n";
import { isoDate } from "../../data/dates";
import { citation, thoughtOfDay, type Thought } from "../../data/thoughts";
import type { ThoughtsData } from "./ThoughtsView";

/** The thought of the day (SPEC 5.10) on Today; later also at the top of the Review. */
export function ThoughtOfDay({ data, onOpen }: { data: ThoughtsData; onOpen(th: Thought): void }) {
  const d = thoughtOfDay(data.all, data.state, isoDate());
  if (!data.loaded || !d) return null;
  const th = d.thought;
  return (
    <div className="today-card quote-review" aria-label={t.thoughts.ofTheDay}>
      <div className="qr-head muted small">
        <Feather size={16} />
        <span>{t.thoughts.ofTheDay}</span>
        {d.picked && <span className="count">{t.thoughts.picked}</span>}
      </div>
      <blockquote className="qr-text">{th.text}</blockquote>
      {(th.author || th.work) && <div className="qr-source muted small">— {citation(th)}</div>}
      <div className="row qr-actions">
        <button className="btn ghost" onClick={() => onOpen(th)}>
          {t.common.open}
        </button>
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cap, dateFmt, t } from "../../i18n";
import { isoDate } from "../../data/dates";
import { MOODS, type Mood } from "../../data/journal";

// Month grid for the Journal and the Review (SPEC 5.7, 5.8): written days are marked, with the
// mood color when there is one.
// Weeks start on Sunday, as Brazilian calendars do.

interface Props {
  /** Shown month, "2026-10". */
  month: string;
  setMonth(m: string): void;
  selected: string | null;
  entries: Map<string, { day: string; mood?: Mood }>;
  onPick(day: string): void;
}

export const monthOf = (day: string) => day.slice(0, 7);

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return isoDate(d).slice(0, 7);
}

export function Calendar({ month, setMonth, selected, entries, onPick }: Props) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const today = isoDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);

  return (
    <div className="calendar" aria-label={t.journal.calendar}>
      <div className="cal-head">
        <button className="btn ghost icon" aria-label={t.journal.prevMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <span className="cal-title">{cap(dateFmt({ month: "long", year: "numeric" }).format(first))}</span>
        <button className="btn ghost icon" aria-label={t.journal.nextMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="cal-grid">
        {t.journal.weekdays.map((w, i) => (
          <span key={i} className="cal-wd">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const e = entries.get(day);
          const mood = e?.mood && MOODS.find(x => x.id === e.mood);
          const cls = ["cal-day", e && "has", day === today && "today", day === selected && "sel"].filter(Boolean);
          return (
            <button
              key={day}
              className={cls.join(" ")}
              aria-label={`${day}${e ? `${t.journal.written}${mood ? `, ${t.journal.moods[mood.id]}` : ""}` : ""}`}
              aria-pressed={day === selected}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8))}
              {e && <span className="cal-dot" style={{ background: `var(--${mood ? mood.color : "accent"})` }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

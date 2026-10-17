import { Archive, CalendarDays, Moon, Star, Sunrise, X } from "lucide-react";
import { t } from "../../i18n";
import { addDays, isoDate } from "../../data/dates";
import { Dialog } from "../Dialog";

// "When" picker (SPEC 5.3): used by the task screen, the task options and a left swipe on the phone.

export interface When {
  when?: string;
  evening?: boolean;
}

export function ScheduleDialog({
  current,
  onPick,
  onClose,
}: {
  current: When;
  onPick(w: When): void;
  onClose(): void;
}) {
  const now = new Date();
  const today = isoDate(now);
  const nextMonday = isoDate(addDays(now, 7 - ((now.getDay() + 6) % 7)));
  const pick = (w: When) => {
    onPick(w);
    onClose();
  };
  const opt = (label: string, icon: React.ReactNode, w: When, on: boolean) => (
    <button className={`menu-item${on ? " active" : ""}`} onClick={() => pick(w)}>
      {icon}
      {label}
    </button>
  );
  const isDay = current.when && current.when !== "someday";
  return (
    <Dialog title={t.todo.whenTitle} onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {opt(t.dates.today, <Star size={18} />, { when: today, evening: false }, current.when === today && !current.evening)}
        {opt(
          t.todo.sections.evening,
          <Moon size={18} />,
          { when: today, evening: true },
          current.when === today && !!current.evening,
        )}
        {opt(
          t.dates.tomorrow,
          <Sunrise size={18} />,
          { when: isoDate(addDays(now, 1)) },
          current.when === isoDate(addDays(now, 1)),
        )}
        {opt(t.todo.nextWeek, <CalendarDays size={18} />, { when: nextMonday }, current.when === nextMonday)}
        {opt(t.todo.views.someday, <Archive size={18} />, { when: "someday" }, current.when === "someday")}
        <label className="menu-item">
          <CalendarDays size={18} />
          {t.todo.pickDate}
          <input
            type="date"
            className="field date-field"
            value={isDay ? current.when : ""}
            onChange={e => e.target.value && pick({ when: e.target.value, evening: false })}
          />
        </label>
        {current.when && opt(t.todo.noDate, <X size={18} />, { when: undefined, evening: undefined }, false)}
      </div>
    </Dialog>
  );
}

import { Archive, CalendarDays, Moon, Star, Sunrise, X } from "lucide-react";
import { addDays, isoDate } from "../../data/dates";
import { Dialog } from "../Dialog";

// "When" picker (SPEC 5.3): used by the task screen and by swiping a task left on the phone.

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
    <Dialog title="When" onClose={onClose}>
      <div className="stack" style={{ gap: 2 }}>
        {opt("Today", <Star size={18} />, { when: today, evening: false }, current.when === today && !current.evening)}
        {opt(
          "This Evening",
          <Moon size={18} />,
          { when: today, evening: true },
          current.when === today && !!current.evening,
        )}
        {opt(
          "Tomorrow",
          <Sunrise size={18} />,
          { when: isoDate(addDays(now, 1)) },
          current.when === isoDate(addDays(now, 1)),
        )}
        {opt("Next week", <CalendarDays size={18} />, { when: nextMonday }, current.when === nextMonday)}
        {opt("Someday", <Archive size={18} />, { when: "someday" }, current.when === "someday")}
        <label className="menu-item">
          <CalendarDays size={18} />
          Pick a date
          <input
            type="date"
            className="field date-field"
            value={isDay ? current.when : ""}
            onChange={e => e.target.value && pick({ when: e.target.value, evening: false })}
          />
        </label>
        {current.when && opt("No date", <X size={18} />, { when: undefined, evening: undefined }, false)}
      </div>
    </Dialog>
  );
}

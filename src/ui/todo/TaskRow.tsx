import { useRef, useState } from "react";
import { CalendarClock, Check, ListChecks, Moon, Repeat } from "lucide-react";
import type { TodoList } from "../../data/lists";
import { dayLabel, isOverdue, type Task } from "../../data/todo";

// One task in a list. Tap opens it; the box completes it. On touch screens a swipe right
// completes and a swipe left opens the "When" picker (SPEC 5.3).

const SWIPE = 72; // px the row must travel before letting go acts

interface Props {
  task: Task;
  today: string;
  lists: TodoList[];
  active: boolean;
  /** Hide the date when the section already says it (Upcoming groups by day). */
  hideDay?: boolean;
  onOpen(): void;
  onToggle(): void;
  onSchedule(): void;
}

export function TaskRow({ task: t, today, lists, active, hideDay, onOpen, onToggle, onSchedule }: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; horizontal?: boolean } | null>(null);
  const swiped = useRef(false);
  const done = t.status !== "open";
  const list = t.list ? lists.find(l => l.id === t.list) : undefined;
  const late = isOverdue(t, today);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (s.horizontal === undefined && Math.abs(x) + Math.abs(y) > 10) {
      s.horizontal = Math.abs(x) > Math.abs(y) * 1.5;
      if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s.horizontal) setDx(Math.max(-120, Math.min(120, x)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s?.horizontal) return;
    swiped.current = true; // the click that follows the swipe must not open the task
    setTimeout(() => (swiped.current = false), 50);
    if (dx >= SWIPE) onToggle();
    else if (dx <= -SWIPE) onSchedule();
    setDx(0);
  };

  const chips: React.ReactNode[] = [];
  if (t.when && !hideDay) {
    chips.push(
      <span key="when" className={late && t.when !== "someday" && t.when < today ? "late" : ""}>
        {t.when === "someday" ? "Someday" : dayLabel(t.when, undefined, true)}
      </span>,
    );
  }
  if (t.evening && !done) chips.push(<Moon key="eve" size={13} aria-label="Evening" />);
  if (t.time) chips.push(<span key="time">{t.time}</span>);
  if (t.due) {
    chips.push(
      <span key="due" className={t.due < today && !done ? "late" : ""}>
        <CalendarClock size={13} /> {dayLabel(t.due, undefined, true)}
      </span>,
    );
  }
  if (t.repeat) chips.push(<Repeat key="rep" size={13} aria-label="Repeats" />);
  if (t.subtasks.total) {
    chips.push(
      <span key="sub">
        <ListChecks size={13} /> {t.subtasks.done}/{t.subtasks.total}
      </span>,
    );
  }
  if (list) {
    chips.push(
      <span key="list" style={{ color: `var(--${list.color})` }}>
        #{list.name}
      </span>,
    );
  }

  return (
    <li className="task-li">
      <div className={`swipe-under${dx > 0 ? " right" : dx < 0 ? " left" : ""}`} aria-hidden>
        {dx > 0 ? (done ? "Reopen" : "Done") : "When…"}
      </div>
      <div
        className={`task-row${active ? " active" : ""}${done ? " done" : ""}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        <button
          className={`check${done ? " on" : ""}${t.priority ? ` p${t.priority}` : ""}`}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? "Mark as not done" : "Mark as done"}
          onClick={onToggle}
        >
          {done && <Check size={14} strokeWidth={3} />}
        </button>
        <button className="task-main" onClick={() => !swiped.current && onOpen()}>
          <span className={`task-title${t.status === "canceled" ? " canceled" : ""}`}>
            {t.title || <span className="muted">(no title)</span>}
          </span>
          {chips.length > 0 && <span className="task-meta">{chips}</span>}
        </button>
      </div>
    </li>
  );
}

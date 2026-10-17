import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { Bell, CalendarClock, Check, FolderKanban, ListChecks, Moon, Repeat } from "lucide-react";
import type { TodoList } from "../../data/lists";
import { dayLabel, isOverdue, type Task } from "../../data/todo";
import { reminderOf } from "../../data/reminders";

// One task in a list. Tap opens it; the box completes it. Holding it (or right-clicking on
// the PC) shows its options. On touch screens a swipe right also completes and a swipe left
// opens the "When" picker (SPEC 5.3).

const SWIPE = 72; // px the row must travel before letting go acts
const HOLD = 500; // ms a still finger needs to open the options

interface Props {
  task: Task;
  today: string;
  lists: TodoList[];
  active: boolean;
  /** Hide the date when the section already says it (Upcoming groups by day). */
  hideDay?: boolean;
  /** Name of the task's project, shown as a chip (left out inside the project itself). */
  project?: string;
  onOpen(): void;
  onToggle(): void;
  onSchedule(): void;
  onMenu(): void;
}

export function TaskRow({ task: k, today, lists, active, hideDay, project, onOpen, onToggle, onSchedule, onMenu }: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; horizontal?: boolean } | null>(null);
  const swiped = useRef(false);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  const done = k.status !== "open";
  const list = k.list ? lists.find(l => l.id === k.list) : undefined;
  const late = isOverdue(k, today);

  // The click that follows a swipe or a hold must not open the task.
  const eatClick = () => {
    swiped.current = true;
    setTimeout(() => (swiped.current = false), 50);
  };
  const stopHold = () => clearTimeout(hold.current);
  useEffect(() => stopHold, []);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    stopHold();
    hold.current = setTimeout(() => {
      start.current = null;
      eatClick();
      navigator.vibrate?.(20);
      onMenu();
    }, HOLD);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (s.horizontal === undefined && Math.abs(x) + Math.abs(y) > 10) {
      stopHold(); // the finger moved: it is a swipe or a scroll, not a hold
      s.horizontal = Math.abs(x) > Math.abs(y) * 1.5;
      if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s.horizontal) setDx(Math.max(-120, Math.min(120, x)));
  };
  const onUp = () => {
    stopHold();
    const s = start.current;
    start.current = null;
    if (!s?.horizontal) return;
    eatClick();
    if (dx >= SWIPE) onToggle();
    else if (dx <= -SWIPE) onSchedule();
    setDx(0);
  };

  const chips: React.ReactNode[] = [];
  if (k.when && !hideDay) {
    chips.push(
      <span key="when" className={late && k.when !== "someday" && k.when < today ? "late" : ""}>
        {k.when === "someday" ? t.todo.views.someday : dayLabel(k.when, undefined, true)}
      </span>,
    );
  }
  if (k.evening && !done) chips.push(<Moon key="eve" size={13} aria-label={t.todo.evening} />);
  if (k.time) chips.push(<span key="time">{k.time}</span>);
  if (!done && reminderOf(k)) chips.push(<Bell key="bell" size={13} aria-label={t.todo.reminder} />);
  if (k.due) {
    chips.push(
      <span key="due" className={k.due < today && !done ? "late" : ""}>
        <CalendarClock size={13} /> {dayLabel(k.due, undefined, true)}
      </span>,
    );
  }
  if (k.repeat) chips.push(<Repeat key="rep" size={13} aria-label={t.todo.repeats} />);
  if (k.subtasks.total) {
    chips.push(
      <span key="sub">
        <ListChecks size={13} /> {k.subtasks.done}/{k.subtasks.total}
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

  if (project) {
    chips.push(
      <span key="project">
        <FolderKanban size={13} /> {project}
      </span>,
    );
  }

  return (
    <li className="task-li">
      <div className={`swipe-under${dx > 0 ? " right" : dx < 0 ? " left" : ""}`} aria-hidden>
        {dx > 0 ? (done ? t.todo.reopen : t.todo.done) : t.todo.when}
      </div>
      <div
        className={`task-row${active ? " active" : ""}${done ? " done" : ""}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onContextMenu={e => {
          // Right click on the PC. Android may fire it on a long press too, racing the timer
          // above; opening the same menu twice is harmless.
          e.preventDefault();
          stopHold();
          start.current = null;
          onMenu();
        }}
        onPointerCancel={() => {
          stopHold();
          start.current = null;
          setDx(0);
        }}
      >
        <button
          className={`check${done ? " on" : ""}${k.priority ? ` p${k.priority}` : ""}`}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? t.todo.markNotDone : t.todo.markDone}
          onClick={onToggle}
        >
          {done && <Check size={14} strokeWidth={3} />}
        </button>
        <button className="task-main" onClick={() => !swiped.current && onOpen()}>
          <span className={`task-title${k.status === "canceled" ? " canceled" : ""}`}>
            {k.title || <span className="muted">{t.todo.noTitle}</span>}
          </span>
          {chips.length > 0 && <span className="task-meta">{chips}</span>}
        </button>
      </div>
    </li>
  );
}

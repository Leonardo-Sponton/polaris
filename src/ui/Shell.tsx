import { Fragment, useState, type ReactNode } from "react";
import { CheckSquare, Inbox, Menu, Search, Settings as SettingsIcon, Sun, Trash2 } from "lucide-react";
import { isoDate } from "../data/dates";
import { isToday, type View } from "../data/todo";
import { InboxView } from "./InboxView";
import { SettingsView } from "./SettingsView";
import { NewListButton, sameView, TodoView, VIEWS } from "./todo/TodoView";
import { useTodo } from "./todo/useTodo";

// The areas built so far. Ideas, Books, Journal… join in later stages (SPEC 7).
export type Area = "today" | "todo" | "inbox" | "search" | "trash" | "settings" | "more";

const AREAS: { id: Area; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <Sun size={20} /> },
  { id: "todo", label: "To-do", icon: <CheckSquare size={20} /> },
  { id: "inbox", label: "Inbox", icon: <Inbox size={20} /> },
  { id: "search", label: "Search", icon: <Search size={20} /> },
  { id: "trash", label: "Trash", icon: <Trash2 size={20} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar (SPEC 4.1); the rest lives under More.
const BOTTOM: Area[] = ["today", "todo", "more"];

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="page">
      <div className="page-inner">
        <h1>{title}</h1>
        <p className="muted">{note}</p>
      </div>
    </div>
  );
}

function More({ go }: { go: (a: Area) => void }) {
  return (
    <div className="page">
      <div className="page-inner">
        <h1>More</h1>
        <div className="stack" style={{ gap: 4 }}>
          {AREAS.filter(a => !BOTTOM.includes(a.id)).map(a => (
            <button key={a.id} className="nav-item" onClick={() => go(a.id)}>
              {a.icon}
              <span className="label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Shell() {
  const [area, setArea] = useState<Area>("today");
  const [view, setView] = useState<View>("today");
  const todo = useTodo();
  const today = isoDate();
  const todayCount = todo.tasks.filter(t => isToday(t, today)).length;

  let page: ReactNode;
  switch (area) {
    case "inbox":
      page = <InboxView />;
      break;
    case "todo":
      page = <TodoView view={view} setView={setView} data={todo} />;
      break;
    case "settings":
      page = <SettingsView />;
      break;
    case "more":
      page = <More go={setArea} />;
      break;
    default:
      page = <Placeholder title={AREAS.find(a => a.id === area)!.label} note="Being built in stage 1." />;
  }

  const inMore = !BOTTOM.includes(area);

  // To-do lists right under "To-do" in the sidebar (wide screens; narrow ones use chips).
  const todoNav = (
    <div className="sub-nav" aria-label="To-do lists">
      {VIEWS.map(v => (
        <button
          key={v.id}
          className={`nav-item sub${sameView(view, v.id) ? " active" : ""}`}
          onClick={() => setView(v.id)}
        >
          {v.icon}
          <span className="label">{v.label}</span>
          {v.id === "today" && todayCount > 0 && <span className="count">{todayCount}</span>}
        </button>
      ))}
      {todo.lists.map(l => (
        <button
          key={l.id}
          className={`nav-item sub${sameView(view, { list: l.id }) ? " active" : ""}`}
          onClick={() => setView({ list: l.id })}
        >
          <span className="dot" style={{ background: `var(--${l.color})` }} />
          <span className="label">{l.name}</span>
        </button>
      ))}
      <NewListButton data={todo} setView={setView} className="nav-item sub muted" />
    </div>
  );

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Areas">
        <div className="brand">HYPOMNEMATA</div>
        {AREAS.map(a => (
          <Fragment key={a.id}>
            <button
              className={`nav-item${area === a.id ? " active" : ""}`}
              onClick={() => setArea(a.id)}
              title={a.label}
            >
              {a.icon}
              <span className="label">{a.label}</span>
              {a.id === "todo" && todayCount > 0 && <span className="count">{todayCount}</span>}
            </button>
            {a.id === "todo" && area === "todo" && todoNav}
          </Fragment>
        ))}
      </nav>
      <main className="main">{page}</main>
      <nav className="bottombar" aria-label="Areas">
        {BOTTOM.map(id => {
          const a = AREAS.find(x => x.id === id);
          const active = id === "more" ? inMore : area === id;
          return (
            <button key={id} className={`nav-item${active ? " active" : ""}`} onClick={() => setArea(id)}>
              {a ? a.icon : <Menu size={20} />}
              <span>{a ? a.label : "More"}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

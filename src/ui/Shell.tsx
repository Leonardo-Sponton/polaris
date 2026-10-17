import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ChevronRight, CheckSquare, Inbox, Lightbulb, Menu, Search, Settings as SettingsIcon, Sun, Trash2 } from "lucide-react";
import { isoDate } from "../data/dates";
import { isToday, type View } from "../data/todo";
import { IdeasView, useIdeas } from "./ideas/IdeasView";
import { InboxView, useInbox } from "./InboxView";
import { useCapture } from "./useCapture";
import { SearchView, type SearchState } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { TrashView } from "./TrashView";
import { NewListButton, sameView, TodoView, VIEWS } from "./todo/TodoView";
import { useTodo } from "./todo/useTodo";
import { useReminders } from "./useReminders";

// The areas built so far. Books, Journal… join in later stages (SPEC 7).
export type Area = "today" | "ideas" | "todo" | "inbox" | "search" | "trash" | "settings" | "more";

const AREAS: { id: Area; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <Sun size={20} /> },
  { id: "ideas", label: "Ideas", icon: <Lightbulb size={20} /> },
  { id: "todo", label: "To-do", icon: <CheckSquare size={20} /> },
  { id: "inbox", label: "Inbox", icon: <Inbox size={20} /> },
  { id: "search", label: "Search", icon: <Search size={20} /> },
  { id: "trash", label: "Trash", icon: <Trash2 size={20} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar (SPEC 4.1); the rest lives under More.
const BOTTOM: Area[] = ["today", "ideas", "todo", "more"];

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

export function Shell({ captureKey = 0 }: { captureKey?: number }) {
  const [area, setArea] = useState<Area>("today");
  const [view, setView] = useState<View>("today");
  const [homeView, setHomeView] = useState<View>("today");
  const todo = useTodo();
  const inbox = useInbox();
  const ideas = useIdeas();
  const capture = useCapture();
  const [search, setSearch] = useState<SearchState>({ text: "", area: "", since: "any" });
  const [searchKey, setSearchKey] = useState(0);
  // A search result to open in To-do or Inbox (key: open it again even if it is the same path).
  const [target, setTarget] = useState<{ path: string; key: number } | undefined>();
  const today = isoDate();
  useReminders(todo.tasks, todo.loaded, path => {
    setTarget({ path, key: Date.now() });
    setArea("todo");
  });
  const go = (a: Area) => {
    setTarget(undefined);
    setArea(a);
  };

  // Ctrl+F: search (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setArea("search");
        setSearchKey(k => k + 1);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const todayCount = todo.tasks.filter(t => isToday(t, today)).length;

  // The Android "Capture" shortcut: go to Today, where the field gets the focus.
  useEffect(() => {
    if (captureKey) setArea("today");
  }, [captureKey]);

  let page: ReactNode;
  switch (area) {
    case "today":
      page = (
        <TodoView
          view={homeView}
          setView={setHomeView}
          data={todo}
          home={{
            onCapture: capture,
            focusKey: captureKey,
            footer: inbox.length > 0 && (
              <button className="today-card" onClick={() => go("inbox")}>
                <Inbox size={18} />
                <span>Inbox</span>
                <span className="count">{inbox.length}</span>
                <ChevronRight size={18} className="muted" />
              </button>
            ),
          }}
        />
      );
      break;
    case "ideas":
      page = <IdeasView ideas={ideas} openPath={target} />;
      break;
    case "inbox":
      page = <InboxView items={inbox} openPath={target} />;
      break;
    case "todo":
      page = <TodoView view={view} setView={setView} data={todo} openPath={target} />;
      break;
    case "settings":
      page = <SettingsView />;
      break;
    case "search":
      page = (
        <SearchView
          state={search}
          setState={setSearch}
          focusKey={searchKey}
          openElsewhere={d => {
            if (d.area !== "todo" && d.area !== "inbox" && d.area !== "ideas") return false;
            setTarget({ path: d.path, key: Date.now() });
            setArea(d.area);
            return true;
          }}
        />
      );
      break;
    case "trash":
      page = <TrashView />;
      break;
    case "more":
      page = <More go={go} />;
      break;
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
              onClick={() => go(a.id)}
              title={a.label}
            >
              {a.icon}
              <span className="label">{a.label}</span>
              {a.id === "todo" && todayCount > 0 && <span className="count">{todayCount}</span>}
              {a.id === "inbox" && inbox.length > 0 && <span className="count">{inbox.length}</span>}
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
            <button key={id} className={`nav-item${active ? " active" : ""}`} onClick={() => go(id)}>
              {a ? a.icon : <Menu size={20} />}
              <span>{a ? a.label : "More"}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

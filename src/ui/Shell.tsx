import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, CheckSquare, Inbox, Lightbulb, Menu, Search, Settings as SettingsIcon, Sun, Trash2 } from "lucide-react";
import { isoDate } from "../data/dates";
import { isQuotePath } from "../data/quotes";
import { markSeen, resurface, type Idea } from "../data/ideas";
import { isToday, type View } from "../data/todo";
import { BooksView, useBooks } from "./books/BooksView";
import { QuoteReview, useQuotes } from "./books/QuoteReview";
import { IdeasView, useIdeas } from "./ideas/IdeasView";
import { InboxView, useInbox } from "./InboxView";
import { useCapture } from "./useCapture";
import { SearchView, type SearchState } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { TrashView } from "./TrashView";
import { NewListButton, sameView, TodoView, VIEWS } from "./todo/TodoView";
import { useTodo } from "./todo/useTodo";
import { useApp } from "./context";
import { goBack } from "./useBack";
import { useReminders } from "./useReminders";

// The areas built so far. Journal, Review… join in later stages (SPEC 7).
export type Area = "today" | "ideas" | "books" | "todo" | "inbox" | "search" | "trash" | "settings" | "more";

const AREAS: { id: Area; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <Sun size={20} /> },
  { id: "ideas", label: "Ideas", icon: <Lightbulb size={20} /> },
  { id: "books", label: "Books", icon: <BookOpen size={20} /> },
  { id: "todo", label: "To-do", icon: <CheckSquare size={20} /> },
  { id: "inbox", label: "Inbox", icon: <Inbox size={20} /> },
  { id: "search", label: "Search", icon: <Search size={20} /> },
  { id: "trash", label: "Trash", icon: <Trash2 size={20} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar (SPEC 4.1); the rest lives under More.
const BOTTOM: Area[] = ["today", "ideas", "books", "todo", "more"];

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

/** An idea not opened for a while comes back (SPEC 5.4). "Not now" hides it for 14 days. */
function ResurfaceCard(props: { idea: Idea; today: string; onOpen(): void; onLater(): void }) {
  const seen = (props.idea.lastSeen ?? props.idea.created).slice(0, 10);
  const days = Math.round((Date.parse(props.today) - Date.parse(seen)) / 86400000);
  return (
    <div className="today-card resurface" aria-label="An old idea">
      <Lightbulb size={18} />
      <span className="what">
        <span className="muted small">Not opened for {days} days</span>
        <b>{props.idea.title || "(untitled idea)"}</b>
      </span>
      <span className="row" style={{ gap: 4 }}>
        <button className="btn ghost" onClick={props.onLater}>
          Not now
        </button>
        <button className="btn" onClick={props.onOpen}>
          Open
        </button>
      </span>
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
  const books = useBooks();
  const quotes = useQuotes(books);
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

  // Android back: first whatever is open (ui/useBack), then back to Today, then leave the app.
  const { platform, notes, bump, toast } = useApp();
  const areaRef = useRef(area);
  areaRef.current = area;
  useEffect(
    () =>
      platform.onBackButton?.(() => {
        if (goBack()) return;
        if (areaRef.current !== "today") go("today");
        else void platform.leaveApp?.();
      }),
    [platform],
  );

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
  const old = resurface(ideas, today);

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
            footer: (
              <>
                {old && (
                  <ResurfaceCard
                    idea={old}
                    today={today}
                    onOpen={() => {
                      setTarget({ path: old.path, key: Date.now() });
                      setArea("ideas");
                    }}
                    onLater={() =>
                      markSeen(notes, old.path).then(bump, e =>
                        toast({ text: e instanceof Error ? e.message : String(e), error: true }),
                      )
                    }
                  />
                )}
                <QuoteReview
                  quotes={quotes}
                  onOpen={q => {
                    setTarget({ path: q.path, key: Date.now() });
                    setArea("books");
                  }}
                />
                {inbox.length > 0 && (
                  <button className="today-card" onClick={() => go("inbox")}>
                    <Inbox size={18} />
                    <span>Inbox</span>
                    <span className="count">{inbox.length}</span>
                    <ChevronRight size={18} className="muted" />
                  </button>
                )}
              </>
            ),
          }}
        />
      );
      break;
    case "ideas":
      page = <IdeasView ideas={ideas} openPath={target} />;
      break;
    case "books":
      page = <BooksView books={books} quotes={quotes} openPath={target} />;
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
            if (d.area !== "todo" && d.area !== "inbox" && d.area !== "ideas" && d.area !== "books") return false;
            if (d.area === "books" && !d.path.endsWith("/book.md") && !isQuotePath(d.path)) return false;
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

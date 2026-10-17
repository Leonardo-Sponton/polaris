import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, CheckSquare, Feather, Inbox, Lightbulb, Menu, Moon, NotebookPen, Scale, Search, Settings as SettingsIcon, Sun, Trash2, Usb } from "lucide-react";
import { isoDate } from "../data/dates";
import { dayOfPath, MOODS, type Entry } from "../data/journal";
import { isQuotePath } from "../data/quotes";
import { QUESTIONS, type ReviewEntry } from "../data/review";
import { markSeen, resurface, type Idea } from "../data/ideas";
import { isToday, type View } from "../data/todo";
import { BooksView, useBooks } from "./books/BooksView";
import { QuoteReview, useQuotes } from "./books/QuoteReview";
import { IdeasView, useIdeas } from "./ideas/IdeasView";
import { InboxView, useInbox } from "./InboxView";
import { CloseDay } from "./journal/CloseDay";
import { JournalView, useJournal } from "./journal/JournalView";
import { ReviewView, useReviews } from "./review/ReviewView";
import { useCapture } from "./useCapture";
import { SearchView, type SearchState } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { SyncView } from "./SyncView";
import { ThoughtOfDay } from "./thoughts/ThoughtOfDay";
import { ThoughtsView, useThoughts } from "./thoughts/ThoughtsView";
import { TrashView } from "./TrashView";
import { NewListButton, sameView, TodoView, VIEWS } from "./todo/TodoView";
import { useTodo } from "./todo/useTodo";
import { useApp } from "./context";
import { goBack, useBack } from "./useBack";
import { useHold } from "./useHold";
import { useReminders } from "./useReminders";

// The areas built so far. Projects join in a later stage (SPEC 7).
export type Area = "today" | "ideas" | "books" | "todo" | "journal" | "review" | "thoughts" | "inbox" | "search" | "trash" | "sync" | "settings" | "more";

const AREAS: { id: Area; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <Sun size={20} /> },
  { id: "ideas", label: "Ideas", icon: <Lightbulb size={20} /> },
  { id: "books", label: "Books", icon: <BookOpen size={20} /> },
  { id: "todo", label: "To-do", icon: <CheckSquare size={20} /> },
  { id: "journal", label: "Journal", icon: <NotebookPen size={20} /> },
  { id: "review", label: "Review", icon: <Scale size={20} /> },
  { id: "thoughts", label: "Thoughts", icon: <Feather size={20} /> },
  { id: "inbox", label: "Inbox", icon: <Inbox size={20} /> },
  { id: "search", label: "Search", icon: <Search size={20} /> },
  { id: "trash", label: "Trash", icon: <Trash2 size={20} /> },
  { id: "sync", label: "Sync", icon: <Usb size={20} /> },
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

// Hold More (right-click on PC) for these without leaving the current page.
const QUICK: Area[] = ["journal", "thoughts", "inbox"];

/** Small window above the More button. While the finger that opened it is still down, sliding
 *  onto an item and lifting picks it; otherwise it stays open to be tapped. */
function MorePop(props: { inbox: number; go(a: Area): void; onClose(): void }) {
  const [over, setOver] = useState<Area>();
  const overRef = useRef<Area>(undefined);
  const down = useRef(true);
  // The click that follows the lift lands later; only a new touch may close the window.
  const touched = useRef(false);
  useBack(true, props.onClose);

  useEffect(() => {
    const pick = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-pick]");
      overRef.current = el?.dataset.pick as Area | undefined;
      setOver(overRef.current);
    };
    const move = (e: PointerEvent) => down.current && pick(e);
    const up = (e: PointerEvent) => {
      if (!down.current) return;
      pick(e);
      down.current = false;
      if (overRef.current) props.go(overRef.current);
    };
    const press = () => (touched.current = !down.current);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointerdown", press, true);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointerdown", press, true);
    };
  }, []);

  return (
    <>
      <div className="more-backdrop" onClick={() => touched.current && props.onClose()} />
      <div className="more-pop" role="menu" aria-label="Quick areas">
        {QUICK.map(id => {
          const a = AREAS.find(x => x.id === id)!;
          return (
            <button
              key={id}
              data-pick={id}
              role="menuitem"
              className={`menu-item${over === id ? " active" : ""}`}
              onClick={() => props.go(id)}
            >
              {a.icon}
              <span>{a.label}</span>
              {id === "inbox" && props.inbox > 0 && <span className="count">{props.inbox}</span>}
            </button>
          );
        })}
      </div>
    </>
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

const QUESTION_COUNT = QUESTIONS.length;

/** Today's journal and the evening (SPEC 5.1 item 4). */
function DayCard(props: { entry?: Entry; review?: ReviewEntry; onJournal(): void; onReview(): void; onCloseDay(): void }) {
  const e = props.entry;
  const mood = e?.mood && MOODS.find(m => m.id === e.mood);
  return (
    <div className="today-card day-card" aria-label="Today's journal">
      <button className="day-journal" onClick={props.onJournal}>
        <NotebookPen size={18} />
        {e ? (
          <span className="what">
            <span className="muted small">
              Journal{mood && <> · <span style={{ color: `var(--${mood.color})` }}>{mood.label}</span></>}
            </span>
            <span className="one-line">{e.preview || <span className="muted">(only the mood)</span>}</span>
          </span>
        ) : (
          <span>Write today's journal</span>
        )}
      </button>
      <span className="row" style={{ gap: 4 }}>
        <button className="btn ghost" onClick={props.onReview}>
          <Scale size={16} /> {props.review ? `Review ${props.review.answered}/${QUESTION_COUNT}` : "Evening review"}
        </button>
        <button className="btn" onClick={props.onCloseDay}>
          <Moon size={16} /> Close the day
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
  const thoughts = useThoughts();
  const journal = useJournal();
  const [journalTarget, setJournalTarget] = useState<{ day: string; key: number } | undefined>();
  const reviews = useReviews();
  const [reviewTarget, setReviewTarget] = useState<{ day: string; key: number } | undefined>();
  const openJournal = (day: string) => {
    setJournalTarget({ day, key: Date.now() });
    setArea("journal");
  };
  const openReview = (day: string) => {
    setReviewTarget({ day, key: Date.now() });
    setArea("review");
  };
  const openThought = (t: { id: string }) => {
    setThoughtTarget({ id: t.id, key: Date.now() });
    setArea("thoughts");
  };
  const [closing, setClosing] = useState(false);
  // A thought to open in Thoughts (built-in ones have no file, so by id).
  const [thoughtTarget, setThoughtTarget] = useState<{ id: string; key: number } | undefined>();
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
    setThoughtTarget(undefined);
    setJournalTarget(undefined);
    setReviewTarget(undefined);
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
                <ThoughtOfDay data={thoughts} onOpen={openThought} />
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
                <DayCard
                  entry={journal.find(e => e.day === today)}
                  review={reviews.find(e => e.day === today)}
                  onJournal={() => openJournal(today)}
                  onReview={() => openReview(today)}
                  onCloseDay={() => setClosing(true)}
                />
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
    case "journal":
      page = <JournalView entries={journal} openDay={journalTarget} onReview={openReview} />;
      break;
    case "review":
      page = (
        <ReviewView entries={reviews} thoughts={thoughts} openDay={reviewTarget} onJournal={openJournal} onThought={openThought} />
      );
      break;
    case "thoughts":
      page = <ThoughtsView data={thoughts} openId={thoughtTarget} />;
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
            if (d.area === "thoughts" && /^thoughts\/[^/]+\.md$/.test(d.path)) {
              setThoughtTarget({ id: d.path.slice(9, -3), key: Date.now() });
              setArea("thoughts");
              return true;
            }
            const day = (d.area === "journal" || d.area === "review") && dayOfPath(d.path);
            if (day) {
              (d.area === "journal" ? openJournal : openReview)(day);
              return true;
            }
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
    case "sync":
      page = <SyncView />;
      break;
    case "more":
      page = <More go={go} />;
      break;
  }

  const inMore = !BOTTOM.includes(area);
  const [morePop, setMorePop] = useState(false);
  const moreHold = useHold(() => setMorePop(true));

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
      {closing && <CloseDay day={today} onClose={() => setClosing(false)} />}
      <nav className="bottombar" aria-label="Areas">
        {BOTTOM.map(id => {
          const a = AREAS.find(x => x.id === id);
          const active = id === "more" ? inMore : area === id;
          return (
            <button
              key={id}
              className={`nav-item${active ? " active" : ""}`}
              onClick={() => !(id === "more" && moreHold.eaten()) && go(id)}
              {...(id === "more" ? { ...moreHold.handlers, style: { touchAction: "none" } } : {})}
            >
              {a ? a.icon : <Menu size={20} />}
              <span>{a ? a.label : "More"}</span>
            </button>
          );
        })}
      </nav>
      {morePop && (
        <MorePop
          inbox={inbox.length}
          go={a => {
            setMorePop(false);
            go(a);
          }}
          onClose={() => setMorePop(false)}
        />
      )}
    </div>
  );
}

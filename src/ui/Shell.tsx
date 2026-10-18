import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, ChevronRight, CheckSquare, Feather, FilePlus, FileText, FolderKanban, GraduationCap, Inbox, Lightbulb, Menu, Moon, NotebookPen, Scale, Search, Settings as SettingsIcon, Sun, Trash2, Usb } from "lucide-react";
import { isoDate } from "../data/dates";
import { createFullNote } from "../data/fullnotes";
import { dayOfPath, MOODS, type Entry } from "../data/journal";
import { isProjectPath, isStepNotePath } from "../data/projects";
import { isQuotePath } from "../data/quotes";
import { QUESTIONS, type ReviewEntry } from "../data/review";
import { markSeen, resurface, type Idea } from "../data/ideas";
import { isToday, type View } from "../data/todo";
import { BooksView, useBooks } from "./books/BooksView";
import { QuoteReview, useQuotes } from "./books/QuoteReview";
import { IdeasView, useIdeas } from "./ideas/IdeasView";
import { InboxView, useInbox } from "./InboxView";
import { StudyCard } from "./study/CardReview";
import { StudyView, useCourses, useStudy, type StudyRequest } from "./study/StudyView";
import { ClassesToday } from "./study/School";
import { NotesView, useFullNotes } from "./notes/NotesView";
import { ProjectsView, useProjects } from "./projects/ProjectsView";
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
import { useWidgets } from "./useWidgets";
import { useAppLinks, linkPlaces, type LinkPlace } from "./appLinks";
import { LinksCtx } from "./links";
import { QuickSwitcher, type Command } from "./QuickSwitcher";
import { flushAll } from "../data/pending";
import { isDay } from "../data/widgets";
import { t } from "../i18n";

export type Area = "today" | "ideas" | "notes" | "projects" | "books" | "study" | "todo" | "journal" | "review" | "thoughts" | "inbox" | "search" | "trash" | "sync" | "settings" | "more";

const AREAS: { id: Area; icon: ReactNode }[] = [
  { id: "today", icon: <Sun size={20} /> },
  { id: "ideas", icon: <Lightbulb size={20} /> },
  { id: "notes", icon: <FileText size={20} /> },
  { id: "projects", icon: <FolderKanban size={20} /> },
  { id: "books", icon: <BookOpen size={20} /> },
  { id: "study", icon: <GraduationCap size={20} /> },
  { id: "todo", icon: <CheckSquare size={20} /> },
  { id: "journal", icon: <NotebookPen size={20} /> },
  { id: "review", icon: <Scale size={20} /> },
  { id: "thoughts", icon: <Feather size={20} /> },
  { id: "inbox", icon: <Inbox size={20} /> },
  { id: "search", icon: <Search size={20} /> },
  { id: "trash", icon: <Trash2 size={20} /> },
  { id: "sync", icon: <Usb size={20} /> },
  { id: "settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar (SPEC 4.1); the rest lives under More.
const BOTTOM: Area[] = ["today", "ideas", "books", "todo", "more"];

function More({ go }: { go: (a: Area) => void }) {
  return (
    <div className="page">
      <div className="page-inner">
        <h1>{t.area.more}</h1>
        <div className="stack" style={{ gap: 4 }}>
          {AREAS.filter(a => !BOTTOM.includes(a.id)).map(a => (
            <button key={a.id} className="nav-item" onClick={() => go(a.id)}>
              {a.icon}
              <span className="label">{t.area[a.id]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Hold More (right-click on PC) for these without leaving the current page.
const QUICK: Area[] = ["notes", "study", "projects", "journal", "review", "thoughts", "inbox"];

interface PopItem {
  id: string;
  icon: ReactNode;
  label: string;
  count?: number;
}

/** Where a popup goes: above a button low on the screen (bottom bar), below one high up (sidebar). */
function popAt(el: HTMLElement): CSSProperties {
  const r = el.getBoundingClientRect();
  const at: CSSProperties = { right: "auto", bottom: "auto", left: Math.max(8, Math.min(r.left + 4, innerWidth - 208)) };
  if (r.top > innerHeight / 2) at.bottom = innerHeight - r.top + 8;
  else at.top = r.bottom + 4;
  return at;
}

/** Small window next to a held button (More, Today). While the finger that opened it is still
 *  down, sliding onto an item and lifting picks it; otherwise it stays open to be tapped. */
function QuickPop(props: { label: string; items: PopItem[]; at?: CSSProperties; pick(id: string): void; onClose(): void }) {
  const [over, setOver] = useState<string>();
  const overRef = useRef<string>(undefined);
  const down = useRef(true);
  // The click that follows the lift lands later; only a new touch may close the window.
  const touched = useRef(false);
  useBack(true, props.onClose);

  useEffect(() => {
    const pick = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-pick]");
      overRef.current = el?.dataset.pick;
      setOver(overRef.current);
    };
    const move = (e: PointerEvent) => down.current && pick(e);
    const up = (e: PointerEvent) => {
      if (!down.current) return;
      pick(e);
      down.current = false;
      if (overRef.current) props.pick(overRef.current);
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
      <div className="more-pop" role="menu" aria-label={props.label} style={props.at}>
        {props.items.map(i => (
          <button
            key={i.id}
            data-pick={i.id}
            role="menuitem"
            className={`menu-item${over === i.id ? " active" : ""}`}
            onClick={() => props.pick(i.id)}
          >
            {i.icon}
            <span>{i.label}</span>
            {!!i.count && <span className="count">{i.count}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/** An idea not opened for a while comes back (SPEC 5.4). "Not now" hides it for 14 days. */
function ResurfaceCard(props: { idea: Idea; today: string; onOpen(): void; onLater(): void }) {
  const seen = (props.idea.lastSeen ?? props.idea.created).slice(0, 10);
  const days = Math.round((Date.parse(props.today) - Date.parse(seen)) / 86400000);
  return (
    <div className="today-card resurface" aria-label={t.shell.oldIdea}>
      <Lightbulb size={18} />
      <span className="what">
        <span className="muted small">{t.shell.notOpenedFor(days)}</span>
        <b>{props.idea.title || t.shell.untitledIdea}</b>
      </span>
      <span className="row" style={{ gap: 4 }}>
        <button className="btn ghost" onClick={props.onLater}>
          {t.shell.notNow}
        </button>
        <button className="btn" onClick={props.onOpen}>
          {t.common.open}
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
    <div className="today-card day-card" aria-label={t.shell.todaysJournal}>
      <button className="day-journal" onClick={props.onJournal}>
        <NotebookPen size={18} />
        {e ? (
          <span className="what">
            <span className="muted small">
              {t.area.journal}{mood && <> · <span style={{ color: `var(--${mood.color})` }}>{t.journal.moods[mood.id]}</span></>}
            </span>
            <span className="one-line">{e.preview || <span className="muted">{t.shell.onlyMood}</span>}</span>
          </span>
        ) : (
          <span>{t.shell.writeJournal}</span>
        )}
      </button>
      <span className="row" style={{ gap: 4 }}>
        <button className="btn ghost" onClick={props.onReview}>
          <Scale size={16} /> {props.review ? t.shell.reviewCount(props.review.answered, QUESTION_COUNT) : t.shell.eveningReview}
        </button>
        <button className="btn" onClick={props.onCloseDay}>
          <Moon size={16} /> {t.shell.closeDay}
        </button>
      </span>
    </div>
  );
}

/** A place in the app a home-screen widget asks for (Android, see PolarisWidgets.java). */
export interface OpenRequest {
  target: string;
  key: number;
}

const OPEN_AREAS: Area[] = ["today", "todo", "inbox", "notes", "ideas", "projects", "books", "study", "journal", "review", "thoughts"];

export function Shell(props: { captureKey?: number; startArea?: Area; openRequest?: OpenRequest }) {
  const { captureKey = 0, startArea = "today", openRequest } = props;
  const [area, setArea] = useState<Area>(startArea);
  const [view, setView] = useState<View>("today");
  const [homeView, setHomeView] = useState<View>("today");
  const todo = useTodo();
  const inbox = useInbox();
  const fullNotes = useFullNotes();
  const ideas = useIdeas();
  const projects = useProjects();
  const books = useBooks();
  const quotes = useQuotes(books);
  const study = useStudy();
  const courses = useCourses();
  const [studyRequest, setStudyRequest] = useState<StudyRequest | undefined>();
  const openStudy = (r: Omit<StudyRequest, "key">) => {
    setStudyRequest({ ...r, key: Date.now() });
    setArea("study");
  };
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
  const [target, setTarget] = useState<{ path: string; key: number; isNew?: boolean } | undefined>();
  const today = isoDate();
  useReminders(todo.tasks, todo.loaded, path => {
    setTarget({ path, key: Date.now() });
    setArea("todo");
  });
  const openIn = (a: Area, path: string) => {
    setTarget({ path, key: Date.now() });
    setArea(a);
  };
  const go = (a: Area) => {
    setTarget(undefined);
    setThoughtTarget(undefined);
    setJournalTarget(undefined);
    setReviewTarget(undefined);
    setStudyRequest(a === "study" ? { key: Date.now() } : undefined);
    setArea(a);
  };

  // Android back: first whatever is open (ui/useBack), then back to Today, then leave the app.
  const { platform, notes, bump, toast } = useApp();
  const areaRef = useRef(area);
  areaRef.current = area;
  // The area last opened from More (page or hold popup): back goes to More, not Today.
  const fromMore = useRef<Area | null>(null);
  const goFromMore = (a: Area) => {
    go(a);
    fromMore.current = a;
  };
  useEffect(
    () =>
      platform.onBackButton?.(() => {
        if (goBack()) return;
        if (fromMore.current && fromMore.current === areaRef.current) {
          fromMore.current = null;
          go("more");
        } else if (areaRef.current !== "today") go("today");
        else void platform.leaveApp?.();
      }),
    [platform],
  );

  // Ctrl+F: search (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // Ctrl+F in a note finds in that note (the editor takes it first); Ctrl+Shift+F always searches everything.
      if (k === "f" && (e.shiftKey || !e.defaultPrevented)) {
        e.preventDefault();
        setArea("search");
        setSearchKey(k => k + 1);
      } else if ((k === "o" || k === "p") && !e.shiftKey) {
        e.preventDefault();
        setSwitcher(k === "o" ? "open" : "commands");
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

  // Home-screen widgets: their data, and the places they open.
  useWidgets(
    { tasks: todo.tasks, inbox, notes: fullNotes, ideas, projects, books, quotes, thoughts, journal, reviews },
    todo.loaded && thoughts.loaded,
  );
  const [newIdeaKey, setNewIdeaKey] = useState(0);
  useEffect(() => {
    if (!openRequest) return;
    const [kind, ...rest] = openRequest.target.split(":");
    const arg = rest.join(":");
    if (kind === "area" && OPEN_AREAS.includes(arg as Area)) {
      go(arg as Area);
      if (arg === "todo") setView("today");
    } else if (kind === "open") {
      const [a, ...p] = arg.split(":");
      if (a === "study" && p.length) openStudy({ path: p.join(":") });
      else if (OPEN_AREAS.includes(a as Area) && p.length) openIn(a as Area, p.join(":"));
    } else if (kind === "thought" && arg) openThought({ id: arg });
    else if (kind === "journal" && isDay(arg)) openJournal(arg);
    else if (kind === "review" && isDay(arg)) openReview(arg);
    else if (kind === "close-day") {
      go("today");
      setClosing(true);
    } else if (kind === "new" && arg === "note") void newNote();
    else if (kind === "new" && arg === "idea") {
      go("ideas");
      setNewIdeaKey(Date.now());
    }
  }, [openRequest]);

  let page: ReactNode;
  switch (area) {
    case "today":
      page = (
        <TodoView
          view={homeView}
          setView={setHomeView}
          data={todo}
          projects={projects}
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
                <ClassesToday subjects={study} courses={courses} onOpen={s => openStudy({ path: s.path })} />
                <StudyCard
                  subjects={study}
                  onReview={() => openStudy({ review: true })}
                  onContinue={(path, chapter) => openStudy({ path, chapter })}
                />
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
                    <span>{t.area.inbox}</span>
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
      page = <IdeasView ideas={ideas} openPath={target} newKey={newIdeaKey} onOpenProject={path => openIn("projects", path)} />;
      break;
    case "notes":
      page = <NotesView list={fullNotes} openPath={target} />;
      break;
    case "projects":
      page = <ProjectsView projects={projects} todo={todo} openPath={target} onOpenIdea={path => openIn("ideas", path)} />;
      break;
    case "books":
      page = <BooksView books={books} quotes={quotes} openPath={target} />;
      break;
    case "study":
      page = <StudyView subjects={study} request={studyRequest} />;
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
      page = <TodoView view={view} setView={setView} data={todo} openPath={target} projects={projects} />;
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
            if (d.area === "study") {
              openStudy({ path: d.path });
              return true;
            }
            if (!["todo", "inbox", "ideas", "notes", "books", "projects"].includes(d.area)) return false;
            if (d.area === "books" && !d.path.endsWith("/book.md") && !isQuotePath(d.path)) return false;
            if (d.area === "projects" && !isProjectPath(d.path) && !isStepNotePath(d.path)) return false;
            setTarget({ path: d.path, key: Date.now() });
            setArea(d.area as Area);
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
      page = <More go={goFromMore} />;
      break;
  }

  const inMore = !BOTTOM.includes(area);
  const [morePop, setMorePop] = useState(false);
  const moreHold = useHold(() => setMorePop(true));
  // Hold Today (right-click on PC): create something new without leaving the current page.
  const [todayPop, setTodayPop] = useState<CSSProperties>();
  const todayHold = useHold(el => setTodayPop(popAt(el)));
  const newNote = async () => {
    try {
      const n = await createFullNote(notes);
      bump();
      setTarget({ path: n.path, key: Date.now(), isNew: true });
      setArea("notes");
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };
  const held = (id: Area) => (id === "more" ? moreHold : id === "today" ? todayHold : undefined);

  // [[Links]] in every editor, Ctrl+O to open a note by title, Ctrl+P for commands (Obsidian-like).
  const [switcher, setSwitcher] = useState<"open" | "commands" | null>(null);
  const linkLists = { notes: fullNotes, ideas, projects, books, study };
  const openPlace = (p: LinkPlace) =>
    void flushAll().then(() => {
      if (p.area === "study") openStudy({ path: p.path });
      else openIn(p.area as Area, p.path);
    });
  const newTitled = async (title: string) => {
    try {
      await flushAll();
      const n = await createFullNote(notes, `# ${title}\n\n`);
      bump();
      setTarget({ path: n.path, key: Date.now(), isNew: true });
      setArea("notes");
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };
  const links = useAppLinks(linkLists, notes, { open: openPlace, day: d => void flushAll().then(() => openJournal(d)), create: title => void newTitled(title) });
  const commands: Command[] = [
    { id: "new-note", label: t.shell.newNote, icon: <FilePlus size={16} />, run: () => void newNote() },
    { id: "open", label: t.switcher.title, icon: <Search size={16} />, run: () => setSwitcher("open") },
    { id: "search", label: t.search.title, icon: <Search size={16} />, run: () => (setArea("search"), setSearchKey(k => k + 1)) },
    ...AREAS.map(a => ({ id: `go-${a.id}`, label: t.area[a.id], icon: a.icon, run: () => go(a.id) })),
  ];

  // To-do lists right under "To-do" in the sidebar (wide screens; narrow ones use chips).
  const todoNav = (
    <div className="sub-nav" aria-label={t.shell.todoLists}>
      {VIEWS.map(v => (
        <button
          key={v.id}
          className={`nav-item sub${sameView(view, v.id) ? " active" : ""}`}
          onClick={() => setView(v.id)}
        >
          {v.icon}
          <span className="label">{t.todo.views[v.id]}</span>
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
      <nav className="sidebar" aria-label={t.shell.areas}>
        <div className="brand">POLARIS</div>
        {AREAS.map(a => (
          <Fragment key={a.id}>
            <button
              className={`nav-item${area === a.id ? " active" : ""}`}
              onClick={() => !(a.id === "today" && todayHold.eaten()) && go(a.id)}
              {...(a.id === "today" ? todayHold.handlers : {})}
              title={t.area[a.id]}
            >
              {a.icon}
              <span className="label">{t.area[a.id]}</span>
              {a.id === "todo" && todayCount > 0 && <span className="count">{todayCount}</span>}
              {a.id === "inbox" && inbox.length > 0 && <span className="count">{inbox.length}</span>}
            </button>
            {a.id === "todo" && area === "todo" && todoNav}
          </Fragment>
        ))}
      </nav>
      <main className="main">
        <LinksCtx.Provider value={links}>{page}</LinksCtx.Provider>
      </main>
      {switcher && (
        <QuickSwitcher
          mode={switcher}
          places={linkPlaces(linkLists)}
          commands={commands}
          onOpen={openPlace}
          onCreate={title => void newTitled(title)}
          onClose={() => setSwitcher(null)}
        />
      )}
      {closing && <CloseDay day={today} onClose={() => setClosing(false)} />}
      <nav className="bottombar" aria-label={t.shell.areas}>
        {BOTTOM.map(id => {
          const a = AREAS.find(x => x.id === id);
          const active = id === "more" ? inMore : area === id;
          const hold = held(id);
          return (
            <button
              key={id}
              className={`nav-item${active ? " active" : ""}`}
              onClick={() => !hold?.eaten() && go(id)}
              {...(hold ? { ...hold.handlers, style: { touchAction: "none" } } : {})}
            >
              {a ? a.icon : <Menu size={20} />}
              <span>{t.area[id]}</span>
            </button>
          );
        })}
      </nav>
      {morePop && (
        <QuickPop
          label={t.shell.quickAreas}
          items={QUICK.map(id => ({
            id,
            icon: AREAS.find(x => x.id === id)!.icon,
            label: t.area[id],
            count: id === "inbox" ? inbox.length : undefined,
          }))}
          pick={a => {
            setMorePop(false);
            goFromMore(a as Area);
          }}
          onClose={() => setMorePop(false)}
        />
      )}
      {todayPop && (
        <QuickPop
          label={t.shell.quickNew}
          at={todayPop}
          items={[{ id: "note", icon: <FilePlus size={20} />, label: t.shell.newNote }]}
          pick={() => {
            setTodayPop(undefined);
            void newNote();
          }}
          onClose={() => setTodayPop(undefined)}
        />
      )}
    </div>
  );
}

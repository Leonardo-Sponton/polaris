import { addDays, isoDate, isoMinute, parseLocal } from "./dates";
import { MOODS, type Entry } from "./journal";
import type { Book } from "./books";
import type { FullNote } from "./fullnotes";
import type { Idea } from "./ideas";
import { itemParts } from "./inbox";
import type { Note } from "./notes";
import { projectTasks, stepNumber, type Project } from "./projects";
import { reviewQueue, type Quote } from "./quotes";
import { QUESTIONS, type ReviewEntry } from "./review";
import { citation, thoughtOfDay, type Thought, type ThoughtsState } from "./thoughts";
import { compareTasks, type Task } from "./todo";
import { t } from "../i18n";

// Android home-screen widgets. The widgets are drawn by Android, not by the app, so the app
// writes what they show into one JSON file (the "snapshot", see PolarisWidgets.java) every time
// its data changes. Dates that move with the clock (which tasks are late, the thought of the
// day) are written for a week ahead, so the widgets stay right after midnight without the app.

/** How many days ahead the snapshot covers. */
export const AHEAD_DAYS = 7;
const MAX_ROWS = 30;

export interface WidgetTask {
  path: string;
  title: string;
  /**
   * The date the task counts on (ISO); the widget shows it when it is today or earlier.
   * Done tasks: the day they were done; the widget shows them, ticked, only on that day.
   */
  day: string;
  done: boolean;
  time?: string;
  evening: boolean;
  priority?: number;
  repeat: boolean;
  project?: string;
}

export interface Snapshot {
  version: 1;
  /** Absolute data folder: the widget completes tasks in it. */
  root: string;
  written: string;
  /** Theme colors (CSS variables without "--"), so the widgets look like the app. */
  colors: Record<string, string>;
  labels: Record<string, string>;
  tasks: WidgetTask[];
  inbox: { count: number; items: { path: string; title: string }[] };
  notes: { path: string; title: string; preview: string; pinned: boolean }[];
  ideas: { path: string; title: string; status: string }[];
  projects: { path: string; title: string; step: string; todos: string }[];
  reading: { path: string; title: string; author: string; cover?: string }[];
  quotesDue: number;
  quotesLabel: string;
  /** ISO day → thought of that day. */
  thoughts: Record<string, { id: string; text: string; cite: string }>;
  /** Today only; the widget shows it when `day` is still today. */
  journal: {
    day: string;
    mood?: string;
    moodColor?: string;
    preview: string;
    written: boolean;
  };
  review: { day: string; label: string };
}

export interface WidgetInput {
  root: string;
  colors: Record<string, string>;
  tasks: Task[];
  inbox: Note[];
  notes: FullNote[];
  ideas: Idea[];
  projects: Project[];
  books: Book[];
  quotes: Quote[];
  thoughts: { all: Thought[]; state: ThoughtsState };
  journal: Entry[];
  reviews: ReviewEntry[];
}

/** The date a task counts on (same rule as To-do's Today: its `when`, or an earlier due date). */
function dayOf(k: Task): string | undefined {
  if (k.when && k.when !== "someday") return k.due && k.due < k.when ? k.due : k.when;
  return k.due;
}

export function buildSnapshot(d: WidgetInput, now = new Date()): Snapshot {
  const today = isoDate(now);
  const last = isoDate(addDays(now, AHEAD_DAYS));
  const projectTitle = new Map(d.projects.map(p => [p.slug, p.title]));

  const open = d.tasks.filter(k => k.status === "open" && (dayOf(k) ?? "9999") <= last).sort(compareTasks);
  // Done today stays in the list, ticked: tapping it again opens it (undo from the home screen).
  const doneToday = d.tasks
    .filter(k => k.status === "done" && k.doneAt?.startsWith(today))
    .sort((a, b) => (a.doneAt ?? "").localeCompare(b.doneAt ?? ""));
  const tasks = [...open, ...doneToday].map(k => ({
    path: k.path,
    title: k.title || t.common.untitled,
    day: k.status === "done" ? today : dayOf(k)!,
    done: k.status === "done",
    time: k.time,
    evening: k.evening,
    priority: k.priority,
    repeat: !!k.repeat,
    project: k.project ? (projectTitle.get(k.project) ?? k.project) : undefined,
  }));

  const thoughts: Snapshot["thoughts"] = {};
  for (let i = 0; i <= AHEAD_DAYS; i++) {
    const day = isoDate(addDays(now, i));
    const th = thoughtOfDay(d.thoughts.all, d.thoughts.state, day)?.thought;
    if (th)
      thoughts[day] = {
        id: th.id,
        text: th.text,
        cite: th.author || th.work ? citation(th) : "",
      };
  }

  const entry = d.journal.find(e => e.day === today);
  const mood = entry?.mood && MOODS.find(m => m.id === entry.mood);
  const review = d.reviews.find(e => e.day === today);
  const quotesDue = reviewQueue(d.quotes, today).length;

  return {
    version: 1,
    root: d.root,
    written: isoMinute(now),
    colors: d.colors,
    labels: {
      today: t.area.today,
      overdue: t.todo.sections.overdue,
      evening: t.todo.sections.evening,
      nothingToday: t.widgets.nothingToday,
      capture: t.widgets.capture,
      inbox: t.area.inbox,
      notes: t.area.notes,
      newNote: t.shell.newNote,
      noNotes: t.widgets.noNotes,
      ideas: t.area.ideas,
      noIdeas: t.widgets.noIdeas,
      projects: t.area.projects,
      noProjects: t.widgets.noProjects,
      reading: t.books.status.reading,
      noReading: t.widgets.noReading,
      thought: t.thoughts.ofTheDay,
      journal: t.area.journal,
      review: t.area.review,
      eveningReview: t.shell.eveningReview,
      closeDay: t.shell.closeDay,
      journalEmpty: t.widgets.journalEmpty,
      noMood: t.widgets.noMood,
      done: t.widgets.done("%s"),
      reopened: t.widgets.reopened("%s"),
      syncing: t.widgets.syncing,
      gone: t.widgets.gone,
      untitled: t.common.untitled,
      ...Object.fromEntries(Object.entries(t.ideas.status).map(([k, v]) => [`idea.${k}`, v])),
    },
    tasks,
    inbox: {
      count: d.inbox.length,
      items: d.inbox.slice(0, 5).map(n => ({
        path: n.path,
        title: itemParts(n.body).title || t.common.empty,
      })),
    },
    notes: d.notes.slice(0, MAX_ROWS).map(n => ({
      path: n.path,
      title: n.title || t.common.untitled,
      preview: n.preview,
      pinned: n.pinned,
    })),
    ideas: d.ideas
      .filter(i => i.status === "draft" || i.status === "maturing")
      .slice(0, MAX_ROWS)
      .map(i => ({
        path: i.path,
        title: i.title || t.shell.untitledIdea,
        status: i.status,
      })),
    projects: d.projects
      .filter(p => p.status === "active")
      .slice(0, MAX_ROWS)
      .map(p => {
        const open = projectTasks(d.tasks, p.slug).filter(k => k.status === "open").length;
        return {
          path: p.path,
          title: p.title || t.common.untitled,
          step: t.widgets.stepOf(stepNumber(p.flow, p.step.id), p.flow.steps.length, p.step.name),
          todos: open ? t.widgets.todos(open) : "",
        };
      }),
    reading: d.books
      .filter(b => b.status === "reading")
      .slice(0, MAX_ROWS)
      .map(b => ({
        path: b.path,
        title: b.title || t.common.untitled,
        author: b.author,
        cover: b.cover,
      })),
    quotesDue,
    quotesLabel: quotesDue ? t.widgets.quotesToReview(quotesDue) : "",
    thoughts,
    journal: {
      day: today,
      mood: mood ? t.journal.moods[mood.id] : undefined,
      moodColor: mood?.color,
      preview: entry?.preview ?? "",
      written: !!entry,
    },
    review: {
      day: today,
      label: review ? t.shell.reviewCount(review.answered, QUESTIONS.length) : t.shell.eveningReview,
    },
  };
}

/** Is `day` a real date? Used by the widget targets the app accepts. */
export const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !!parseLocal(day);

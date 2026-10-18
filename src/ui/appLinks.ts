import { useMemo, useRef } from "react";
import type { WikiLinks } from "../editor/wikiLinks";
import type { FullNote } from "../data/fullnotes";
import type { Idea } from "../data/ideas";
import type { Project } from "../data/projects";
import type { Book } from "../data/books";
import { linkTargets, type Subject } from "../data/study";
import { fold } from "../data/search";
import type { Notes } from "../data/notes";
import { isDay } from "../data/widgets";

// [[Links]] across the whole app, as in an Obsidian vault: a name opens the note, idea,
// project, book or study note with that title (accents and capitals ignored), or a journal day
// ([[2026-10-18]]). A link to nothing makes a new note with that title.

export interface LinkPlace {
  area: "notes" | "ideas" | "projects" | "books" | "study" | "journal";
  path: string;
  title: string;
}

export function linkPlaces(lists: { notes: FullNote[]; ideas: Idea[]; projects: Project[]; books: Book[]; study: Subject[] }): LinkPlace[] {
  const out: LinkPlace[] = [];
  for (const n of lists.notes) if (n.title) out.push({ area: "notes", path: n.path, title: n.title });
  for (const x of linkTargets(lists.study)) out.push({ area: "study", path: x.path, title: x.title });
  for (const i of lists.ideas) if (i.title) out.push({ area: "ideas", path: i.path, title: i.title });
  for (const p of lists.projects) if (p.title) out.push({ area: "projects", path: p.path, title: p.title });
  for (const b of lists.books) if (b.title) out.push({ area: "books", path: b.path, title: b.title });
  return out;
}

export function findPlace(places: LinkPlace[], name: string): LinkPlace | null {
  const key = fold(name.trim()).folded;
  if (!key) return null;
  return places.find(p => fold(p.title).folded === key) ?? null;
}

export function useAppLinks(
  lists: { notes: FullNote[]; ideas: Idea[]; projects: Project[]; books: Book[]; study: Subject[] },
  store: Notes,
  go: { open(place: LinkPlace): void; day(day: string): void; create(title: string): void },
): WikiLinks {
  const places = useMemo(() => linkPlaces(lists), [lists.notes, lists.ideas, lists.projects, lists.books, lists.study]);
  const ref = useRef({ places, go });
  ref.current = { places, go };
  return useMemo<WikiLinks>(
    () => ({
      names: () => ref.current.places.map(p => p.title),
      open: name => {
        if (isDay(name.trim())) return ref.current.go.day(name.trim());
        const hit = findPlace(ref.current.places, name);
        if (hit) ref.current.go.open(hit);
        else ref.current.go.create(name.trim());
      },
      read: async name => {
        const hit = findPlace(ref.current.places, name);
        if (!hit) return null;
        try {
          return (await store.load(hit.path)).body;
        } catch {
          return null;
        }
      },
    }),
    [store],
  );
}

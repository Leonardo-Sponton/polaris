import type { Storage } from "../storage/types";
import { slugify } from "./dates";

// User to-do lists (#home, #work…) in .hypomnemata/lists.json (SPEC 5.3). A task names its list
// by id in `list:`; the name and color here are only for display, so renaming touches no task.

export interface TodoList {
  id: string;
  name: string;
  /** One of LIST_COLORS. */
  color: string;
}

export const LISTS_PATH = ".hypomnemata/lists.json";

/** Theme color names (CSS variables), so lists stay readable in both themes. */
export const LIST_COLORS = ["accent", "h1", "h2", "h3", "ok", "err"];

export async function loadLists(s: Storage): Promise<TodoList[]> {
  if (!(await s.stat(LISTS_PATH))) return [];
  try {
    const raw = JSON.parse(await s.read(LISTS_PATH));
    const arr: unknown[] = Array.isArray(raw?.lists) ? raw.lists : [];
    return arr.flatMap(x => {
      const l = x as Partial<TodoList>;
      if (typeof l?.id !== "string" || !l.id) return [];
      return [
        {
          id: l.id,
          name: typeof l.name === "string" && l.name ? l.name : l.id,
          color: LIST_COLORS.includes(l.color ?? "") ? l.color! : "accent",
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function saveLists(s: Storage, lists: TodoList[]) {
  // Keep other keys a newer version may have written.
  let old: Record<string, unknown> = {};
  try {
    if (await s.stat(LISTS_PATH)) old = JSON.parse(await s.read(LISTS_PATH));
  } catch {
    /* unreadable: replaced below */
  }
  await s.write(LISTS_PATH, JSON.stringify({ ...old, lists }, null, 2) + "\n");
}

/** Lists from the file plus any list a task names that the file does not know (hand edits, sync). */
export function allLists(saved: TodoList[], used: Iterable<string | undefined>): TodoList[] {
  const out = [...saved];
  for (const id of used) {
    if (id && !out.some(l => l.id === id))
      out.push({ id, name: id, color: LIST_COLORS[out.length % LIST_COLORS.length] });
  }
  return out;
}

export function newList(name: string, existing: TodoList[]): TodoList {
  const color = LIST_COLORS[existing.length % LIST_COLORS.length];
  return { id: slugify(name), name: name.trim(), color };
}

import { useCallback } from "react";
import { createInboxItem, type Capture } from "../data/inbox";
import { loadLists, newList, saveLists } from "../data/lists";
import { createTask, dayLabel } from "../data/todo";
import { useApp } from "./context";

// Saves a captured line (SPEC 5.2): an inbox item, or a to-do when the line asks for one.
// Used by the Today screen and by the small --capture window. Returns false on failure.

export function whereLabel(c: Capture): string {
  if (c.to === "inbox") return "Inbox";
  const t = c.task;
  if (t.when) return t.when === "someday" ? "Someday" : dayLabel(t.when);
  return t.list ? `#${t.listName}` : "Anytime";
}

export function useCapture(opts: { quiet?: boolean } = {}) {
  const { notes, bump, toast } = useApp();
  const quiet = !!opts.quiet;
  return useCallback(
    async (c: Capture) => {
      try {
        if (c.to === "inbox") await createInboxItem(notes, c.text);
        else {
          const t = c.task;
          if (t.list) {
            const lists = await loadLists(notes.storage);
            if (!lists.some(l => l.id === t.list))
              await saveLists(notes.storage, [...lists, { ...newList(t.listName ?? t.list, lists), id: t.list }]);
          }
          await createTask(notes, t.title, {
            when: t.when,
            evening: t.evening,
            time: t.time,
            repeat: t.repeat,
            priority: t.priority,
            list: t.list,
          });
        }
        bump();
        if (!quiet) toast({ text: `Added to ${whereLabel(c)}` });
        return true;
      } catch (e) {
        toast({ text: e instanceof Error ? e.message : String(e), error: true });
        return false;
      }
    },
    [notes, bump, toast, quiet],
  );
}

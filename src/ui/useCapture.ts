import { useCallback } from "react";
import { createInboxItem, type Capture } from "../data/inbox";
import { loadLists, newList, saveLists } from "../data/lists";
import { createTask, dayLabel } from "../data/todo";
import { useApp } from "./context";
import { t } from "../i18n";

// Saves a captured line (SPEC 5.2): an inbox item, or a to-do when the line asks for one.
// Used by the Today screen and by the small --capture window. Returns false on failure.

export function whereLabel(c: Capture): string {
  if (c.to === "inbox") return t.area.inbox;
  const k = c.task;
  if (k.when) return k.when === "someday" ? t.todo.views.someday : dayLabel(k.when);
  return k.list ? `#${k.listName}` : t.todo.views.anytime;
}

export function useCapture(opts: { quiet?: boolean } = {}) {
  const { notes, bump, toast } = useApp();
  const quiet = !!opts.quiet;
  return useCallback(
    async (c: Capture) => {
      try {
        if (c.to === "inbox") await createInboxItem(notes, c.text);
        else {
          const k = c.task;
          if (k.list) {
            const lists = await loadLists(notes.storage);
            if (!lists.some(l => l.id === k.list))
              await saveLists(notes.storage, [...lists, { ...newList(k.listName ?? k.list, lists), id: k.list }]);
          }
          await createTask(notes, k.title, {
            when: k.when,
            evening: k.evening,
            time: k.time,
            repeat: k.repeat,
            priority: k.priority,
            list: k.list,
          });
        }
        bump();
        if (!quiet) toast({ text: t.capture.addedTo(whereLabel(c)) });
        return true;
      } catch (e) {
        toast({ text: e instanceof Error ? e.message : String(e), error: true });
        return false;
      }
    },
    [notes, bump, toast, quiet],
  );
}

import { flushAll } from "../../data/pending";
import { t } from "../../i18n";
import { dayLabel, finishTask, reopenTask, undoFinish, updateTask, type Task } from "../../data/todo";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useApp } from "../context";

// Task changes shared by the To-do lists and the project steps: each writes the open task screen
// first, saves, reloads and offers Undo where it makes sense.

export function useTaskActions(onRemoved?: (path: string) => void) {
  const { notes, bump, toast, confirmDelete } = useApp();
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });
  const run = async (job: () => Promise<unknown>) => {
    try {
      await flushAll(); // an open task screen writes its last edits first
      await job();
      bump();
    } catch (e) {
      fail(e);
    }
  };

  return {
    fail,
    finish: (path: string, status: "done" | "canceled") =>
      run(async () => {
        const c = await finishTask(notes, path, status);
        const next = c.next ? t.todo.nextOn(dayLabel(String(c.next.data.when))) : "";
        toast({
          text: `${status === "done" ? t.todo.done : t.todo.canceled}${next}`,
          action: { label: t.common.undo, run: () => undoFinish(notes, c).then(bump, fail) },
        });
      }),
    reopen: (path: string) => run(() => reopenTask(notes, path)),
    remove: async (path: string) =>
      (await confirmDelete()) &&
      run(async () => {
        const trashed = await moveToTrash(notes.storage, path);
        onRemoved?.(path);
        toast({
          text: t.todo.deleted,
          action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
        });
      }),
    schedule: (k: Task, w: { when?: string; evening?: boolean }) =>
      run(() => updateTask(notes, k.path, { when: w.when, evening: w.evening || undefined })),
    move: (k: Task, to: string | undefined) => run(() => updateTask(notes, k.path, { list: to })),
  };
}

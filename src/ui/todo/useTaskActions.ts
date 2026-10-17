import { flushAll } from "../../data/pending";
import { dayLabel, finishTask, reopenTask, undoFinish, updateTask, type Task } from "../../data/todo";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { useApp } from "../context";

// Task changes shared by the To-do lists and the project steps: each writes the open task screen
// first, saves, reloads and offers Undo where it makes sense.

export function useTaskActions(onRemoved?: (path: string) => void) {
  const { notes, bump, toast } = useApp();
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
        const next = c.next ? ` · next ${dayLabel(String(c.next.data.when))}` : "";
        toast({
          text: `${status === "done" ? "Done" : "Canceled"}${next}`,
          action: { label: "Undo", run: () => undoFinish(notes, c).then(bump, fail) },
        });
      }),
    reopen: (path: string) => run(() => reopenTask(notes, path)),
    remove: (path: string) =>
      run(async () => {
        const trashed = await moveToTrash(notes.storage, path);
        onRemoved?.(path);
        toast({
          text: "Task deleted",
          action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
        });
      }),
    schedule: (t: Task, w: { when?: string; evening?: boolean }) =>
      run(() => updateTask(notes, t.path, { when: w.when, evening: w.evening || undefined })),
    move: (t: Task, to: string | undefined) => run(() => updateTask(notes, t.path, { list: to })),
  };
}

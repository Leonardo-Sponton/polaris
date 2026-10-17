import { useEffect, useRef } from "react";
import { sameReminders, upcomingReminders, type Reminder } from "../data/reminders";
import type { Task } from "../data/todo";
import { useApp } from "./context";

/**
 * Keeps the platform's scheduled reminders in step with the tasks on disk (SPEC 5.3), and
 * calls `onOpen` with a task's path when one of its reminders is tapped.
 */
export function useReminders(tasks: Task[], loaded: boolean, onOpen: (path: string) => void) {
  const { platform, toast } = useApp();
  const last = useRef<Reminder[] | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (!loaded || !platform.setReminders) return;
    const list = upcomingReminders(tasks);
    if (last.current && sameReminders(last.current, list)) return;
    last.current = list;
    platform.setReminders(list).catch(e => {
      last.current = null;
      toast({ text: `Could not set reminders: ${e?.message ?? e}`, error: true });
    });
  }, [tasks, loaded, platform, toast]);

  useEffect(() => platform.onReminderOpen?.(path => openRef.current(path)), [platform]);
}

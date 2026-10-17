import { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import { allLists, loadLists, newList, saveLists, type TodoList } from "../../data/lists";
import { loadTasks, type Task } from "../../data/todo";
import { useApp } from "../context";

// Tasks and user lists, reloaded whenever data on disk changes.

export interface TodoData {
  tasks: Task[];
  /** Saved lists plus lists named by tasks only. */
  lists: TodoList[];
  loaded: boolean;
  /** Adds a list to lists.json when it is not there yet; returns its id. */
  ensureList(id: string, name: string): Promise<string>;
  saveLists(lists: TodoList[]): Promise<void>;
}

export function useTodo(): TodoData {
  const { notes, version, bump, toast } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [saved, setSaved] = useState<TodoList[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadTasks(notes, p => toast({ text: t.common.couldNotRead(p), error: true })),
      loadLists(notes.storage),
    ]).then(([list, l]) => {
      if (!alive) return;
      setTasks(list);
      setSaved(l);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);

  const save = useCallback(
    async (lists: TodoList[]) => {
      await saveLists(notes.storage, lists);
      setSaved(lists);
      bump();
    },
    [notes, bump],
  );

  const ensureList = useCallback(
    async (id: string, name: string) => {
      const current = await loadLists(notes.storage);
      if (!current.some(l => l.id === id)) await save([...current, { ...newList(name, current), id }]);
      return id;
    },
    [notes, save],
  );

  return {
    tasks,
    lists: allLists(
      saved,
      tasks.map(k => k.list),
    ),
    loaded,
    ensureList,
    saveLists: save,
  };
}

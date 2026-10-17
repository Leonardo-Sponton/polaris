import type { Storage } from "../storage/types";

// Deleting moves a file to .trash/ at the same relative path (SPEC 2.4); nothing is erased.
// The Trash screen (restore, empty) comes in stage 1e.

export async function moveToTrash(s: Storage, path: string): Promise<string> {
  const m = /^(.*?)(\.[^./]*)?$/.exec(`.trash/${path}`)!;
  let to = m[0];
  for (let i = 2; await s.stat(to); i++) to = `${m[1]}-${i}${m[2] ?? ""}`;
  await s.move(path, to);
  return to;
}

/** Undo: puts a trashed file back where it was. */
export async function restoreFromTrash(s: Storage, trashed: string, original: string) {
  if (await s.stat(original)) throw new Error(`${original} already exists`);
  await s.move(trashed, original);
}

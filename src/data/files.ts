import type { Storage } from "../storage/types";

/**
 * Every file under `dir` (recursive), as paths relative to the data folder.
 * `skip` gets each folder path and can leave it out.
 */
export async function walkFiles(s: Storage, dir = "", skip?: (path: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (const f of await s.list(dir)) {
    const path = dir ? `${dir}/${f.name}` : f.name;
    if (f.isDir) {
      if (!skip?.(path)) out.push(...(await walkFiles(s, path, skip)));
    } else out.push(path);
  }
  return out;
}

/** The area a file belongs to: the first folder of its path (todo, inbox, ideas…). */
export const areaOf = (path: string) => path.split("/")[0];

/** App folders that are not content: .trash, .polaris, and any other hidden folder. */
export const isHidden = (path: string) => areaOf(path).startsWith(".");

/** A file name safe on Linux, Android and FAT-formatted cards; keeps the extension. */
export function safeFileName(name: string): string {
  const clean = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return clean.slice(-120) || "file";
}

/** Copies a picked file into a folder, renaming it when the name is taken. */
export async function addFile(s: Storage, dir: string, name: string, data: Uint8Array): Promise<string> {
  const clean = safeFileName(name);
  const dot = clean.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  let target = clean;
  for (let i = 2; await s.stat(`${dir}/${target}`); i++) target = `${stem} (${i})${ext}`;
  await s.writeBinary(`${dir}/${target}`, data);
  return target;
}

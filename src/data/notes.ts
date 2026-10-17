import type { Document } from "yaml";
import type { Storage } from "../storage/types";
import { isoMinute } from "./dates";
import { parse, stringify, type Data } from "./frontmatter";

// Loading and saving records. Lessons from MyNotes (SPEC 2.4):
// - every save is read back and compared before it counts as saved;
// - if the file changed on disk since it was loaded, the save stops with a ConflictError
//   and the user picks which version to keep.

export interface Note {
  path: string;
  data: Data;
  body: string;
  /** Exact file text as last read or written by the app; used to detect outside changes. */
  text: string;
  doc: Document;
  raw?: string;
}

export class ConflictError extends Error {
  constructor(
    public path: string,
    /** Current text on disk, or null when the file was deleted outside the app. */
    public diskText: string | null,
  ) {
    super(`${path} changed outside the app`);
  }
}

export class SaveError extends Error {}

function toNote(path: string, text: string): Note {
  const p = parse(text);
  return { path, text, data: p.data, body: p.body, doc: p.doc, raw: p.raw };
}

export class Notes {
  constructor(public storage: Storage) {}

  async load(path: string): Promise<Note> {
    return toNote(path, await this.storage.read(path));
  }

  async exists(path: string) {
    return (await this.storage.stat(path)) !== null;
  }

  private async writeChecked(path: string, text: string): Promise<Note> {
    await this.storage.write(path, text);
    const back = await this.storage.read(path);
    if (back !== text) throw new SaveError(`Saving ${path} failed: the file reads back different`);
    return toNote(path, text);
  }

  /** Creates a new file. Fails if the path is taken. `created`/`modified` are filled in. */
  async create(path: string, data: Data, body: string): Promise<Note> {
    if (await this.exists(path)) throw new SaveError(`${path} already exists`);
    const now = isoMinute();
    const { type, ...rest } = data;
    const full = { type, created: now, modified: now, ...rest };
    return this.writeChecked(path, stringify(full, body));
  }

  /**
   * Saves new header and body over a loaded note. Throws ConflictError if the file on disk is
   * no longer what was loaded, unless `force` (the user chose "keep mine").
   */
  async save(note: Note, data: Data, body: string, opts: { force?: boolean; touch?: boolean } = {}): Promise<Note> {
    if (!opts.force) {
      let disk: string | null = null;
      try {
        disk = await this.storage.read(note.path);
      } catch {
        disk = null;
      }
      if (disk !== note.text) throw new ConflictError(note.path, disk);
    }
    const next = opts.touch === false ? data : { ...data, modified: isoMinute() };
    const text = stringify(next, body, note);
    if (text === note.text) return note;
    return this.writeChecked(note.path, text);
  }

  /** "Keep both": writes my version next to the original as "<name> (my copy).md". */
  async saveCopy(note: Note, data: Data, body: string): Promise<Note> {
    const base = note.path.replace(/\.md$/, "");
    let path = `${base} (my copy).md`;
    for (let i = 2; await this.exists(path); i++) path = `${base} (my copy ${i}).md`;
    return this.writeChecked(path, stringify({ ...data, modified: isoMinute() }, body, note));
  }

  /** A free path like dir/name.md, adding -2, -3… when the name is taken. */
  async freePath(dir: string, name: string, ext = ".md"): Promise<string> {
    let path = `${dir}/${name}${ext}`;
    for (let i = 2; await this.exists(path); i++) path = `${dir}/${name}-${i}${ext}`;
    return path;
  }

  /** Loads every .md file of a folder (not recursive). Broken files are skipped and reported. */
  async loadDir(dir: string, onError?: (path: string, e: unknown) => void): Promise<Note[]> {
    const out: Note[] = [];
    for (const f of await this.storage.list(dir)) {
      if (f.isDir || !f.name.endsWith(".md")) continue;
      const path = `${dir}/${f.name}`;
      try {
        out.push(await this.load(path));
      } catch (e) {
        onError?.(path, e);
      }
    }
    return out;
  }
}

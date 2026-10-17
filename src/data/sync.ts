import { joinPath, parentOf, type Storage } from "../storage/types";
import { isoMinute } from "./dates";
import { SETTINGS_PATH } from "./settings";
import { moveToTrash } from "./trash";

// USB sync (SPEC 6): the PC compares its files and the device's with the state of the last
// successful sync (path → content hash) and decides, file by file, what to copy, what to move
// to the trash, and what changed on both sides (a conflict: left untouched, the user chooses).

/** path → sha256 of the content (hex). */
export type Hashes = Map<string, string>;

export const SYNC_DIR = ".hypomnemata/sync";
/** On the device while a sync runs: the app saves, then blocks editing (SPEC 6.3). */
export const LOCK_PATH = ".hypomnemata/sync.lock";
/** On the device: when and with which PC it last synced. */
export const DEVICE_LAST = `${SYNC_DIR}/last.json`;
/** Default Android data folder (SPEC 2.3). */
export const DEVICE_DIR = "/storage/emulated/0/Documents/Hypomnemata";
/** How long the PC waits after writing the lock, so the device app sees it and saves first. */
export const LOCK_WAIT_MS = 3000;
/** How often the device app looks for the lock. */
export const LOCK_POLL_MS = 1500;

// Per device, never copied: the trash, the sync state, this device's settings, a restore's
// leftovers, the sample-data record and half-written temp files.
const NOT_SYNCED = [".trash/", `${SYNC_DIR}/`, ".hypomnemata/before-restore/"];
const NOT_SYNCED_FILES = [LOCK_PATH, SETTINGS_PATH, ".hypomnemata/sample-files.json"];

export function isSynced(path: string): boolean {
  if (NOT_SYNCED.some(p => path.startsWith(p)) || NOT_SYNCED_FILES.includes(path)) return false;
  return !path.slice(path.lastIndexOf("/") + 1).includes(".tmp-");
}

export type Kind = "same" | "gone" | "toDevice" | "toPC" | "trashDevice" | "trashPC" | "conflict";

export interface Step {
  path: string;
  kind: Kind;
  pc?: string;
  device?: string;
}

/**
 * The decision table of SPEC 6.2 for every path on either side or in the last sync.
 * "same": equal on both sides (also when both changed the same way, e.g. after an interrupted
 * sync); "gone": deleted on both sides.
 */
export function plan(pc: Hashes, device: Hashes, base: Hashes): Step[] {
  const paths = new Set([...pc.keys(), ...device.keys(), ...base.keys()]);
  const steps: Step[] = [];
  for (const path of [...paths].sort()) {
    if (!isSynced(path)) continue;
    const p = pc.get(path);
    const d = device.get(path);
    const b = base.get(path);
    let kind: Kind;
    if (p === d) kind = p === undefined ? "gone" : "same";
    else if (p === b) kind = d === undefined ? "trashPC" : "toPC";
    else if (d === b) kind = p === undefined ? "trashDevice" : "toDevice";
    else kind = "conflict";
    steps.push({ path, kind, pc: p, device: d });
  }
  return steps;
}

/** One side of a sync: its files and a quick way to get every file's hash. */
export interface Side {
  storage: Storage;
  hashes(): Promise<Hashes>;
}

export interface Result {
  /** The new last-sync state. Conflicts keep their old entry, so they come up again. */
  state: Hashes;
  conflicts: Step[];
  counts: { toDevice: number; toPC: number; trashDevice: number; trashPC: number };
}

export type Progress = (text: string, done: number, total: number) => void;

/**
 * Files deleted on one side go to the other side's trash. A whole folder (a book with its cover
 * and quotes) deleted at once goes as one trash item, so it is restored as one.
 */
function trashItems(paths: string[], others: Hashes, mine: Hashes): string[] {
  const gone = new Set(paths);
  const out = new Set<string>();
  for (const p of paths) {
    let item = p;
    // Only folders inside an area (books/<slug>), never an area folder itself.
    for (let d = parentOf(p); d.includes("/"); d = parentOf(d)) {
      const under = (h: Hashes) => [...h.keys()].filter(k => k.startsWith(d + "/"));
      if (under(others).length === 0 && under(mine).every(k => gone.has(k))) item = d;
    }
    out.add(item);
  }
  return [...out].filter(i => ![...out].some(o => o !== i && i.startsWith(o + "/")));
}

export async function sha256(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Copies one file and checks what arrived against the hash it should have. */
async function copy(from: Storage, to: Storage, path: string, hash: string) {
  const data = await from.readBinary(path);
  if ((await sha256(data)) !== hash) throw new Error(`${path} changed during the sync; sync again`);
  await to.writeBinary(path, data);
}

/** Runs one sync over two sides. Conflicts are not touched. */
export async function run(pc: Side, device: Side, base: Hashes, progress?: Progress): Promise<Result> {
  progress?.("Comparing files…", 0, 0);
  const [ph, dh] = await Promise.all([pc.hashes(), device.hashes()]);
  const steps = plan(ph, dh, base);
  const state: Hashes = new Map();
  const counts = { toDevice: 0, toPC: 0, trashDevice: 0, trashPC: 0 };
  const work = steps.filter(s => s.kind !== "same" && s.kind !== "gone" && s.kind !== "conflict");
  let done = 0;
  const tick = (what: string) => progress?.(what, ++done, work.length);

  for (const s of steps) {
    if (s.kind === "same") state.set(s.path, s.pc!);
    if (s.kind === "conflict" && base.has(s.path)) state.set(s.path, base.get(s.path)!);
  }
  for (const s of work.filter(s => s.kind === "toDevice")) {
    await copy(pc.storage, device.storage, s.path, s.pc!);
    state.set(s.path, s.pc!);
    counts.toDevice++;
    tick(`Sending ${s.path}`);
  }
  for (const s of work.filter(s => s.kind === "toPC")) {
    await copy(device.storage, pc.storage, s.path, s.device!);
    state.set(s.path, s.device!);
    counts.toPC++;
    tick(`Receiving ${s.path}`);
  }
  const trashed = (k: Kind) => work.filter(s => s.kind === k).map(s => s.path);
  for (const item of trashItems(trashed("trashDevice"), ph, dh)) {
    await moveToTrash(device.storage, item);
    counts.trashDevice++;
    tick(`Moving ${item} to the device's trash`);
  }
  for (const item of trashItems(trashed("trashPC"), dh, ph)) {
    await moveToTrash(pc.storage, item);
    counts.trashPC++;
    tick(`Moving ${item} to the trash`);
  }
  return { state, conflicts: steps.filter(s => s.kind === "conflict"), counts };
}

// ---- Saved state ----

export interface LastSync {
  at: string;
  /** The other side's name: the device model on the PC, the PC's name on the device. */
  with: string;
  files: Record<string, string>;
}

const statePath = (serial: string) => `${SYNC_DIR}/${serial.replace(/[^\w.-]/g, "_")}.json`;

async function readJson(s: Storage, path: string): Promise<LastSync | null> {
  try {
    return (await s.stat(path)) ? JSON.parse(await s.read(path)) : null;
  } catch {
    return null;
  }
}

/** The PC's record of the last sync with this device. */
export const loadLast = (s: Storage, serial: string) => readJson(s, statePath(serial));

/** The device's record (shown in its Sync screen). */
export const loadDeviceLast = (s: Storage) => readJson(s, DEVICE_LAST);

const toJson = (last: LastSync) => JSON.stringify(last, null, 1) + "\n";

export interface Target {
  serial: string;
  /** The device's model, e.g. "SM-X000". */
  model: string;
  /** This PC's name. */
  pcName: string;
}

/**
 * A whole sync with one device: lock the device (its app saves and stops editing), sync, save
 * the new state on both sides, unlock. The PC's own unsaved edits must be written before.
 */
export async function syncDevice(pc: Side, device: Side, t: Target, progress?: Progress, wait = LOCK_WAIT_MS): Promise<Result> {
  const now = new Date();
  progress?.("Waiting for the device to save…", 0, 0);
  await device.storage.write(LOCK_PATH, JSON.stringify({ pc: t.pcName, at: isoMinute(now) }) + "\n");
  try {
    await new Promise(r => setTimeout(r, wait));
    const last = await loadLast(pc.storage, t.serial);
    const result = await run(pc, device, new Map(Object.entries(last?.files ?? {})), progress);
    const files = Object.fromEntries([...result.state].sort(([a], [b]) => a.localeCompare(b)));
    const at = isoMinute(new Date());
    await pc.storage.write(statePath(t.serial), toJson({ at, with: t.model, files }));
    await device.storage.write(DEVICE_LAST, toJson({ at, with: t.pcName, files }));
    return result;
  } finally {
    await device.storage.remove(LOCK_PATH);
  }
}

/** Hashes of every synced file of a Storage (used by the tests and the in-memory preview). */
export async function storageHashes(s: Storage, dir = ""): Promise<Hashes> {
  const out: Hashes = new Map();
  for (const f of await s.list(dir)) {
    const path = joinPath(dir, f.name);
    if (f.isDir) {
      if (path === ".trash") continue;
      for (const [k, v] of await storageHashes(s, path)) out.set(k, v);
    } else if (isSynced(path)) out.set(path, await sha256(await s.readBinary(path)));
  }
  return out;
}

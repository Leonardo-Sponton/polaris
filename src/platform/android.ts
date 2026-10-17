import { registerPlugin } from "@capacitor/core";
import type { FileInfo, Storage } from "../storage/types";
import type { Platform } from "./types";

// Native side: android/app/src/main/java/.../HypoFilesPlugin.java
interface HypoFiles {
  hasAccess(): Promise<{ granted: boolean }>;
  openAccessSettings(): Promise<void>;
  storageRoot(): Promise<{ path: string }>;
  list(o: { root: string; path: string }): Promise<{ entries: FileInfo[] }>;
  stat(o: { root: string; path: string }): Promise<{ info: FileInfo | null }>;
  read(o: { root: string; path: string }): Promise<{ text: string }>;
  readBase64(o: { root: string; path: string }): Promise<{ data: string }>;
  write(o: { root: string; path: string; text: string }): Promise<void>;
  writeBase64(o: { root: string; path: string; data: string }): Promise<void>;
  move(o: { root: string; from: string; to: string }): Promise<void>;
  remove(o: { root: string; path: string }): Promise<void>;
  showKeyboard(): Promise<void>;
  addListener(event: "capture", cb: () => void): Promise<{ remove(): Promise<void> }>;
}

const Native = registerPlugin<HypoFiles>("HypoFiles");
const KEY = "hypomnemata.dataDir";

function toBase64(data: Uint8Array) {
  let s = "";
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function androidPlatform(): Platform {
  // The folder is a per-device choice, so it is kept in the WebView's own storage.
  const root = () => {
    const r = localStorage.getItem(KEY);
    if (!r) throw new Error("No data folder chosen");
    return r;
  };
  const storage: Storage = {
    list: async path => (await Native.list({ root: root(), path })).entries,
    stat: async path => (await Native.stat({ root: root(), path })).info,
    read: async path => (await Native.read({ root: root(), path })).text,
    readBinary: async path => fromBase64((await Native.readBase64({ root: root(), path })).data),
    write: (path, text) => Native.write({ root: root(), path, text }),
    writeBinary: (path, data) => Native.writeBase64({ root: root(), path, data: toBase64(data) }),
    move: (from, to) => Native.move({ root: root(), from, to }),
    remove: path => Native.remove({ root: root(), path }),
  };
  return {
    name: "android",
    storage,
    getDataDir: async () => localStorage.getItem(KEY),
    defaultDataDir: async () => `${(await Native.storageRoot()).path}/Documents/Hypomnemata`,
    setDataDir: async dir => localStorage.setItem(KEY, dir.replace(/\/+$/, "")),
    hasFileAccess: async () => (await Native.hasAccess()).granted,
    openFileAccessSettings: () => Native.openAccessSettings(),
    // Backups go to the phone's Download folder, outside the data folder.
    saveBackup: async (name, data) => {
      const dir = `${(await Native.storageRoot()).path}/Download`;
      await Native.writeBase64({ root: dir, path: name, data: toBase64(data) });
      return `${dir}/${name}`;
    },
    showKeyboard: () => Native.showKeyboard(),
    onCaptureRequest: cb => {
      const handle = Native.addListener("capture", cb);
      return () => void handle.then(h => h.remove());
    },
  };
}

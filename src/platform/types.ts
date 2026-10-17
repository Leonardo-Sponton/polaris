import type { Storage } from "../storage/types";

// What each launcher (Electron, Android) gives the app besides file access.
export interface Platform {
  name: "electron" | "android" | "memory";
  /** Absolute data folder, or null before the first-run choice. */
  getDataDir(): Promise<string | null>;
  defaultDataDir(): Promise<string>;
  setDataDir(dir: string): Promise<void>;
  /** Native folder picker (desktop). Returns null when canceled or not available. */
  pickFolder?(): Promise<string | null>;
  /** Android "All files access" (see SPEC 2.3). */
  hasFileAccess?(): Promise<boolean>;
  openFileAccessSettings?(): Promise<void>;
  openDataFolder?(): Promise<void>;
  /** Saves a backup .zip outside the data folder. Returns where it went, or null if canceled. */
  saveBackup?(name: string, data: Uint8Array): Promise<string | null>;
  storage: Storage;
  /** Calls back when a file changes outside the app. Returns a function that stops it. */
  onFileChanged?(cb: (path: string) => void): () => void;
  /** Desktop: the window is closing; `flush` writes unsaved edits first. */
  onClosing?(flush: () => Promise<void>): void;
  /** Desktop: closes this window (the quick capture window). */
  closeWindow?(): Promise<void>;
  /** Android: the "Capture" home-screen shortcut was used. Returns a function that stops it. */
  onCaptureRequest?(cb: () => void): () => void;
  /** Android: opens the keyboard for the focused field (focus() alone does not without a tap). */
  showKeyboard?(): Promise<void>;
}

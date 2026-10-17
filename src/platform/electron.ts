import type { FileInfo, Storage } from "../storage/types";
import type { Platform } from "./types";

// Functions exposed by electron/preload.cjs.
interface HypoBridge {
  config: {
    get(): Promise<{ dataDir: string | null; defaultDataDir: string }>;
    setDataDir(dir: string): Promise<string>;
  };
  pickFolder(): Promise<string | null>;
  openFolder(): Promise<void>;
  fs: {
    list(dir: string): Promise<FileInfo[]>;
    stat(path: string): Promise<FileInfo | null>;
    read(path: string): Promise<string>;
    readBinary(path: string): Promise<Uint8Array>;
    write(path: string, text: string): Promise<void>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    move(from: string, to: string): Promise<void>;
    remove(path: string): Promise<void>;
  };
  onFileChanged(cb: (path: string) => void): () => void;
  onClosing(flush: () => Promise<void>): void;
}

declare global {
  interface Window {
    hypo?: HypoBridge;
  }
}

export function isElectron() {
  return !!window.hypo;
}

export function electronPlatform(): Platform {
  const b = window.hypo!;
  const storage: Storage = { ...b.fs };
  return {
    name: "electron",
    storage,
    getDataDir: async () => (await b.config.get()).dataDir,
    defaultDataDir: async () => (await b.config.get()).defaultDataDir,
    setDataDir: async dir => void (await b.config.setDataDir(dir)),
    pickFolder: () => b.pickFolder(),
    openDataFolder: () => b.openFolder(),
    onFileChanged: cb => b.onFileChanged(cb),
    onClosing: flush => b.onClosing(flush),
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Platform } from "../platform/types";
import { Notes } from "../data/notes";
import { initDataFolder, loadSettings, saveSettings, type Settings } from "../data/settings";
import { flushAll } from "../data/pending";
import { Ctx, type AppCtx, type Toast } from "./context";
import { FileAccess, FirstRun } from "./FirstRun";
import { Shell } from "./Shell";
import { CaptureNotReady, CaptureWindow } from "./CaptureWindow";
import { SyncLock } from "./SyncView";

// `#capture`: the small quick capture window (Linux, `hypomnemata --capture`).
const CAPTURE_ONLY = location.hash === "#capture";
if (CAPTURE_ONLY) document.title = "Hypomnemata capture";

type Boot =
  | { step: "loading" }
  | { step: "choose" }
  | { step: "access" }
  | { step: "ready"; settings: Settings }
  | { step: "error"; message: string };

function applyTheme(theme: Settings["theme"]) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function App({ platform }: { platform: Platform }) {
  const [boot, setBoot] = useState<Boot>({ step: "loading" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [version, setVersion] = useState(0);
  const [captureKey, setCaptureKey] = useState(0);
  const nextId = useRef(1);
  const notes = useMemo(() => new Notes(platform.storage), [platform]);

  const start = useCallback(async () => {
    try {
      if (!(await platform.getDataDir())) return setBoot({ step: "choose" });
      if (platform.hasFileAccess && !(await platform.hasFileAccess())) return setBoot({ step: "access" });
      await initDataFolder(platform.storage);
      const settings = await loadSettings(platform.storage);
      applyTheme(settings.theme);
      setBoot({ step: "ready", settings });
    } catch (e) {
      setBoot({ step: "error", message: String(e) });
    }
  }, [platform]);

  useEffect(() => {
    start();
  }, [start]);

  // Android: coming back from the settings page may have granted file access.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && boot.step === "access" && start();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [boot.step, start]);

  useEffect(() => {
    if (boot.step !== "ready" || !platform.onFileChanged) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = platform.onFileChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setVersion(v => v + 1), 300);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [boot.step, platform]);

  // Unsaved edits are written when the app goes to the background (Android) or closes (desktop).
  useEffect(() => {
    platform.onClosing?.(flushAll);
    const onHide = () => document.visibilityState === "hidden" && flushAll();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [platform]);

  useEffect(() => platform.onCaptureRequest?.(() => setCaptureKey(k => k + 1)), [platform]);

  // Android: files may have changed while the app was in the background (USB sync, a file
  // manager), and reminders that fired since are no longer upcoming: reload on return.
  useEffect(() => {
    if (boot.step !== "ready" || !platform.onResume) return;
    return platform.onResume(() => setVersion(v => v + 1));
  }, [boot.step, platform]);

  const bump = useCallback(() => setVersion(v => v + 1), []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts(list => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), t.action ? 6000 : 3500);
  }, []);

  if (boot.step === "loading") return null;
  if (boot.step === "error")
    return (
      <div className="center-screen">
        <div className="card stack">
          <h1>Something went wrong</h1>
          <p className="err mono">{boot.message}</p>
          <button className="btn" onClick={start}>
            Try again
          </button>
        </div>
      </div>
    );
  if (CAPTURE_ONLY && (boot.step === "choose" || boot.step === "access")) return <CaptureNotReady />;
  if (boot.step === "choose") return <FirstRun platform={platform} onDone={start} />;
  if (boot.step === "access") return <FileAccess platform={platform} onCheck={start} />;

  const ctx: AppCtx = {
    platform,
    notes,
    settings: boot.settings,
    updateSettings: async s => {
      const settings = { ...boot.settings, ...s };
      await saveSettings(platform.storage, settings);
      applyTheme(settings.theme);
      setBoot({ step: "ready", settings });
    },
    toast,
    version,
    bump,
  };

  return (
    <Ctx.Provider value={ctx}>
      {CAPTURE_ONLY ? <CaptureWindow /> : <Shell captureKey={captureKey} />}
      <SyncLock />
      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  setToasts(list => list.filter(x => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

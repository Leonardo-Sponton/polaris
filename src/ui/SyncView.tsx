import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { flushAll } from "../data/pending";
import { DEVICE_DIR, LOCK_PATH, LOCK_POLL_MS, loadDeviceLast, loadLast, syncDevice, type LastSync, type Result } from "../data/sync";
import type { Device } from "../platform/types";
import { AskText } from "./Dialog";
import { useApp } from "./context";
import { useBack } from "./useBack";

// USB sync (SPEC 6). The PC runs it; Android only shows the last sync and, while a sync runs,
// the "Syncing from PC…" screen (SyncLock).

const when = (at: string) => at.replace("T", " ");

export function SyncView() {
  const { platform } = useApp();
  return platform.sync ? <PcSync /> : <DeviceSync />;
}

function PcSync() {
  const { platform, settings, updateSettings, bump, toast } = useApp();
  const sync = platform.sync!;
  const dir = settings.syncDeviceDir || DEVICE_DIR;
  const [devices, setDevices] = useState<{ adb: boolean; list: Device[] } | null>(null);
  const [lasts, setLasts] = useState<Record<string, LastSync | null>>({});
  const [progress, setProgress] = useState<{ text: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<(Result & { model: string }) | null>(null);
  const [editDir, setEditDir] = useState(false);

  const fail = useCallback((e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }), [toast]);

  const refresh = useCallback(async () => {
    try {
      const d = await sync.devices();
      setDevices(d);
      const out: Record<string, LastSync | null> = {};
      for (const dev of d.list) out[dev.serial] = await loadLast(platform.storage, dev.serial);
      setLasts(out);
    } catch (e) {
      fail(e);
    }
  }, [sync, platform, fail]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = async (d: Device) => {
    setResult(null);
    setProgress({ text: "Starting…", done: 0, total: 0 });
    try {
      await flushAll();
      const pc = { storage: platform.storage, hashes: () => sync.localHashes() };
      const device = { storage: sync.deviceStorage(d.serial, dir), hashes: () => sync.deviceHashes(d.serial, dir) };
      // Only a folder the app has set up: a wrong path must not receive a copy of everything.
      if (!(await device.storage.stat(".hypomnemata"))) {
        throw new Error(`No Hypomnemata data folder at ${dir} on the ${d.model}. Open the app there once, or change the device folder below.`);
      }
      const r = await syncDevice(pc, device, { serial: d.serial, model: d.model, pcName: await sync.pcName() }, (text, done, total) =>
        setProgress({ text, done, total }),
      );
      setResult({ ...r, model: d.model });
    } catch (e) {
      fail(e);
    } finally {
      setProgress(null);
      bump();
      refresh();
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <h1>Sync</h1>

        <section className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Devices</h2>
            <button className="btn ghost" onClick={refresh} title="Look for devices again">
              <RefreshCw size={18} /> Refresh
            </button>
          </div>
          {devices && !devices.adb && (
            <p className="err" style={{ margin: 0 }}>
              The adb program was not found. Install it with <span className="mono">sudo pacman -S android-tools</span>.
            </p>
          )}
          {devices?.adb && devices.list.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No device connected. Connect the phone or tablet with a USB cable, with USB debugging on
              (Settings → Developer options), then press Refresh.
            </p>
          )}
          {devices?.list.map(d => (
            <div key={d.serial} className="sync-device">
              <Smartphone size={22} />
              <span className="what">
                <b>{d.model}</b>
                <span className="muted small">
                  {d.state === "device"
                    ? lasts[d.serial]
                      ? `Last sync: ${when(lasts[d.serial]!.at)}`
                      : "Not synced yet"
                    : d.state === "unauthorized"
                      ? "Unlock the device and allow USB debugging for this computer"
                      : `Not ready (${d.state})`}
                </span>
              </span>
              <button className="btn primary" disabled={d.state !== "device" || !!progress} onClick={() => start(d)}>
                Sync now
              </button>
            </div>
          ))}
        </section>

        {result && <SyncResult r={result} />}

        <section className="card stack">
          <h2>Folder on the device</h2>
          <p className="mono" style={{ wordBreak: "break-all", margin: 0 }}>
            {dir}
          </p>
          <div className="row">
            <button className="btn" onClick={() => setEditDir(true)}>
              Change…
            </button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Files changed on only one side are copied to the other; files deleted on one side go to
            the other side's trash. A file changed on both sides is left as it is on each side and
            listed after the sync.
          </p>
        </section>
      </div>
      {progress && <SyncProgress {...progress} />}
      {editDir && (
        <AskText
          title="Data folder on the device"
          initial={dir}
          okLabel="Save"
          onClose={() => setEditDir(false)}
          onOk={t => {
            setEditDir(false);
            if (!t.startsWith("/")) return toast({ text: "The folder must start with /", error: true });
            updateSettings({ syncDeviceDir: t.replace(/\/+$/, "") === DEVICE_DIR ? undefined : t.replace(/\/+$/, "") }).catch(fail);
          }}
        />
      )}
    </div>
  );
}

function SyncResult({ r }: { r: Result & { model: string } }) {
  const c = r.counts;
  const lines = [
    c.toDevice && `${c.toDevice} sent to the ${r.model}`,
    c.toPC && `${c.toPC} received from the ${r.model}`,
    c.trashDevice && `${c.trashDevice} moved to the ${r.model}'s trash`,
    c.trashPC && `${c.trashPC} moved to this PC's trash`,
  ].filter(Boolean);
  return (
    <section className="card stack" aria-label="Sync result">
      <h2>Synced with the {r.model}</h2>
      <p style={{ margin: 0 }}>{lines.length ? lines.join(" · ") : "Everything was already the same."}</p>
      {r.conflicts.length > 0 && (
        <>
          <p className="err" style={{ margin: 0 }}>
            Changed on both sides, left untouched ({r.conflicts.length}):
          </p>
          <ul className="sync-conflicts mono small">
            {r.conflicts.map(s => (
              <li key={s.path}>
                {s.path}
                {!s.pc && " (deleted on this PC)"}
                {!s.device && " (deleted on the device)"}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SyncProgress(p: { text: string; done: number; total: number }) {
  useBack(true, () => {});
  return (
    <div className="dialog-backdrop">
      <div className="card stack dialog" role="dialog" aria-label="Syncing">
        <h2>Syncing…</h2>
        <p className="muted small one-line" style={{ margin: 0 }}>
          {p.text}
        </p>
        {p.total > 0 && <progress max={p.total} value={p.done} style={{ width: "100%" }} />}
        <p className="muted small" style={{ margin: 0 }}>
          Keep the cable connected.
        </p>
      </div>
    </div>
  );
}

function DeviceSync() {
  const { platform, version } = useApp();
  const [last, setLast] = useState<LastSync | null | undefined>();
  useEffect(() => {
    loadDeviceLast(platform.storage).then(setLast, () => setLast(null));
  }, [platform, version]);
  return (
    <div className="page">
      <div className="page-inner">
        <h1>Sync</h1>
        <section className="card stack">
          <h2>{last ? `Last sync: ${when(last.at)}` : last === null ? "Not synced yet" : "…"}</h2>
          {last && <p style={{ margin: 0 }}>With {last.with}</p>}
          <p className="muted" style={{ margin: 0 }}>
            {platform.name === "android"
              ? "Sync is started on the PC: connect this device with a USB cable (USB debugging on), open Hypomnemata on the PC and choose Sync → Sync now. While it runs, this app waits on a \"Syncing from PC\" screen."
              : "Sync works between the Linux app and the Android app."}
          </p>
        </section>
      </div>
    </div>
  );
}

/** A lock older than this is from a sync that broke off (cable pulled, PC closed). */
const STALE_MS = 10 * 60_000;

/**
 * Android, while the PC syncs (SPEC 6.3): unsaved edits are written, then the app waits behind
 * this screen; when the lock goes away everything is reloaded.
 */
export function SyncLock() {
  const { platform, bump } = useApp();
  const [lock, setLock] = useState<{ pc: string; stale: boolean } | null>(null);

  useEffect(() => {
    if (platform.name !== "android") return;
    let locked = false;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const st = await platform.storage.stat(LOCK_PATH);
        if (st) {
          let pc = "the PC";
          try {
            pc = JSON.parse(await platform.storage.read(LOCK_PATH)).pc || pc;
          } catch {
            /* written half or by hand: the name is not needed */
          }
          setLock({ pc, stale: Date.now() - st.mtime > STALE_MS });
          if (!locked) {
            locked = true;
            await flushAll();
          }
        } else if (locked) {
          locked = false;
          setLock(null);
          bump();
        }
      } catch {
        /* checked again soon */
      } finally {
        busy = false;
      }
    };
    check();
    const timer = setInterval(check, LOCK_POLL_MS);
    const stop = platform.onResume?.(check);
    return () => {
      clearInterval(timer);
      stop?.();
    };
  }, [platform, bump]);

  if (!lock) return null;
  return <LockScreen pc={lock.pc} stale={lock.stale} onUnlock={() => platform.storage.remove(LOCK_PATH)} />;
}

function LockScreen(p: { pc: string; stale: boolean; onUnlock(): void }) {
  useBack(true, () => {});
  return (
    <div className="dialog-backdrop sync-lock">
      <div className="card stack dialog" role="dialog" aria-label="Syncing from PC">
        <h2>Syncing from {p.pc}…</h2>
        <p className="muted" style={{ margin: 0 }}>
          Your edits are saved. The app comes back by itself when the sync ends.
        </p>
        {p.stale && (
          <>
            <p className="err" style={{ margin: 0 }}>
              This has taken more than 10 minutes; the sync probably stopped halfway (nothing is lost,
              the next sync finishes it).
            </p>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={p.onUnlock}>
                Stop waiting
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

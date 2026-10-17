import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Upload } from "lucide-react";
import { useApp } from "./context";
import type { Theme } from "../data/settings";
import { BEFORE_RESTORE, backupName, exportBackup, readBackup, restoreBackup, type Backup } from "../data/backup";
import { flushAll } from "../data/pending";
import { Confirm } from "./Dialog";

export function SettingsView() {
  const { platform, settings, updateSettings, bump, toast } = useApp();
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const doExport = async () => {
    setBusy(true);
    try {
      await flushAll();
      const zip = await exportBackup(platform.storage);
      const where = await platform.saveBackup!(backupName(), zip);
      if (where) toast({ text: `Backup saved: ${where}` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // The zip is checked before anything is asked or changed.
  const picked = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(readBackup(new Uint8Array(await f.arrayBuffer())));
    } catch (e) {
      fail(e);
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const doRestore = async (b: Backup) => {
    setPending(null);
    setBusy(true);
    try {
      await flushAll();
      await restoreBackup(platform.storage, b);
      bump();
      toast({ text: `Backup restored (${b.files.size} files)` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    platform.getDataDir().then(setDir);
  }, [platform]);

  const themes: Theme[] = ["dark", "light", "system"];

  return (
    <div className="page">
      <div className="page-inner">
        <h1>Settings</h1>

        <section className="card stack">
          <h2>Theme</h2>
          <div className="segmented" role="group" aria-label="Theme">
            {themes.map(t => (
              <button key={t} aria-pressed={settings.theme === t} onClick={() => updateSettings({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack">
          <h2>Data folder</h2>
          <p className="mono" style={{ wordBreak: "break-all", margin: 0 }}>
            {dir}
          </p>
          {platform.openDataFolder && (
            <div className="row">
              <button className="btn" onClick={() => platform.openDataFolder!()}>
                <FolderOpen size={18} /> Open folder
              </button>
            </div>
          )}
        </section>

        <section className="card stack">
          <h2>Backup</h2>
          <p className="muted" style={{ margin: 0 }}>
            One .zip file with all your notes, to-dos and the trash.
            {platform.name === "android" && " It is saved in the Download folder."}
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {platform.saveBackup && (
              <button className="btn" disabled={busy} onClick={doExport}>
                <Download size={18} /> Export backup (.zip)
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => file.current?.click()}>
              <Upload size={18} /> Restore backup…
            </button>
            <input
              ref={file}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={e => picked(e.target.files?.[0])}
            />
          </div>
        </section>
      </div>
      {pending && (
        <Confirm
          title="Restore this backup?"
          text={`Backup from ${pending.created.replace("T", " ") || "an unknown date"}, ${pending.files.size} files. It replaces your current data; the current data is first moved to ${BEFORE_RESTORE}/ so nothing is lost.`}
          okLabel="Restore"
          onClose={() => setPending(null)}
          onOk={() => doRestore(pending)}
        />
      )}
    </div>
  );
}

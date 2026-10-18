import { useEffect, useRef, useState } from "react";
import { BookOpen, Download, Feather, FileText, FolderKanban, FolderOpen, Lightbulb, NotebookPen, Plus, Sun, Upload } from "lucide-react";
import { useApp } from "./context";
import type { Theme } from "../data/settings";
import { BEFORE_RESTORE, backupName, exportBackup, readBackup, restoreBackup, type Backup } from "../data/backup";
import { flushAll } from "../data/pending";
import { Confirm } from "./Dialog";
import { deviceLang, LANGS, t } from "../i18n";

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
      if (where) toast({ text: t.settings.backupSaved(where) });
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
      toast({ text: t.settings.backupRestored(b.files.size) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    platform.getDataDir().then(setDir);
  }, [platform]);

  const themes: Theme[] = ["dark", "minimal", "light", "system"];

  return (
    <div className="page">
      <div className="page-inner">
        <h1>{t.settings.title}</h1>

        <section className="card stack">
          <h2>{t.settings.theme}</h2>
          <div className="segmented" role="group" aria-label={t.settings.theme}>
            {themes.map(th => (
              <button key={th} aria-pressed={settings.theme === th} onClick={() => updateSettings({ theme: th })}>
                {t.settings.themes[th]}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack">
          <h2>{t.settings.language}</h2>
          <div className="stack" role="radiogroup" aria-label={t.settings.language} style={{ gap: 2 }}>
            {LANGS.map(l => (
              <label key={l.id} className="row radio-row">
                <input
                  type="radio"
                  name="language"
                  checked={(settings.language ?? "system") === l.id}
                  onChange={() => updateSettings({ language: l.id === "system" ? undefined : l.id })}
                />
                {l.id === "system" ? t.settings.systemLang(LANGS.find(x => x.id === deviceLang())!.label) : l.label}
              </label>
            ))}
          </div>
        </section>

        <RemindersCard />
        <WidgetsCard />

        <section className="card stack">
          <h2>{t.settings.dataFolder}</h2>
          <p className="mono" style={{ wordBreak: "break-all", margin: 0 }}>
            {dir}
          </p>
          {platform.openDataFolder && (
            <div className="row">
              <button className="btn" onClick={() => platform.openDataFolder!()}>
                <FolderOpen size={18} /> {t.settings.openFolder}
              </button>
            </div>
          )}
        </section>

        <section className="card stack">
          <h2>{t.settings.backup}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.settings.backupText}
            {platform.name === "android" && t.settings.backupAndroid}
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {platform.saveBackup && (
              <button className="btn" disabled={busy} onClick={doExport}>
                <Download size={18} /> {t.settings.exportBackup}
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => file.current?.click()}>
              <Upload size={18} /> {t.settings.restoreBackup}
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
          title={t.settings.restoreTitle}
          text={t.settings.restoreText(pending.created.replace("T", " "), pending.files.size, BEFORE_RESTORE)}
          okLabel={t.common.restore}
          onClose={() => setPending(null)}
          onOk={() => doRestore(pending)}
        />
      )}
    </div>
  );
}

/** Reminder permissions on Android; on the PC, how reminders keep working (SPEC 5.3). */
function RemindersCard() {
  const { platform } = useApp();
  const [access, setAccess] = useState<{ notifications: boolean; exact: boolean } | null>(null);

  useEffect(() => {
    if (!platform.reminderAccess) return;
    let alive = true;
    const check = () => platform.reminderAccess!().then(a => alive && setAccess(a));
    check();
    const stop = platform.onResume?.(check);
    return () => {
      alive = false;
      stop?.();
    };
  }, [platform]);

  if (platform.name === "electron")
    return (
      <section className="card stack">
        <h2>{t.settings.reminders}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t.settings.remindersPc1} <span className="mono">polaris --background</span>.
        </p>
      </section>
    );
  if (!access) return null;
  return (
    <section className="card stack">
      <h2>{t.settings.reminders}</h2>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>{access.notifications ? t.settings.notificationsOn : t.settings.notificationsOff}</span>
        {!access.notifications && (
          <button className="btn" onClick={() => platform.askNotifications!()}>
            {t.settings.allow}
          </button>
        )}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>{access.exact ? t.settings.exactOn : t.settings.exactOff}</span>
        {!access.exact && (
          <button className="btn" onClick={() => platform.openExactAlarmSettings!()}>
            {t.settings.allowExact}
          </button>
        )}
      </div>
    </section>
  );
}

const WIDGETS = [
  { id: "today", icon: <Sun size={18} /> },
  { id: "capture", icon: <Plus size={18} /> },
  { id: "notes", icon: <FileText size={18} /> },
  { id: "ideas", icon: <Lightbulb size={18} /> },
  { id: "projects", icon: <FolderKanban size={18} /> },
  { id: "reading", icon: <BookOpen size={18} /> },
  { id: "thought", icon: <Feather size={18} /> },
  { id: "day", icon: <NotebookPen size={18} /> },
] as const;

/** Android: the home-screen widgets, each with a button that asks the launcher to add it. */
function WidgetsCard() {
  const { platform, toast } = useApp();
  if (!platform.pinWidget) return null;
  const add = (id: string) =>
    platform.pinWidget!(id).then(
      ok => !ok && toast({ text: t.settings.widgetsManual }),
      e => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    );
  return (
    <section className="card stack">
      <h2>{t.settings.widgets}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t.settings.widgetsText}
      </p>
      {WIDGETS.map(w => (
        <div key={w.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span className="row" style={{ gap: 10, flex: 1, minWidth: 0, flexWrap: "nowrap" }}>
            <span style={{ flexShrink: 0, display: "flex" }}>{w.icon}</span>
            <span style={{ minWidth: 0 }}>
              {t.settings.widgetNames[w.id]}
              <span className="muted small" style={{ display: "block" }}>
                {t.settings.widgetDescs[w.id]}
              </span>
            </span>
          </span>
          <button className="btn" style={{ flexShrink: 0 }} onClick={() => add(w.id)}>
            {t.settings.addWidget}
          </button>
        </div>
      ))}
    </section>
  );
}

import { useEffect, useState } from "react";
import { FolderOpen, ShieldCheck } from "lucide-react";
import type { Platform } from "../platform/types";

// First run: choose where the notes live (SPEC 2.3).
export function FirstRun({ platform, onDone }: { platform: Platform; onDone: () => void }) {
  const [dir, setDir] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    platform.defaultDataDir().then(setDir);
  }, [platform]);

  const pick = async () => {
    const d = await platform.pickFolder?.();
    if (d) setDir(d);
  };

  const confirm = async () => {
    try {
      await platform.setDataDir(dir.trim());
      onDone();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="center-screen">
      <div className="card stack">
        <h1>Welcome to Hypomnemata</h1>
        <p>
          Your notes are plain Markdown files in a folder you choose. You can open them with any editor and
          copy the folder to back them up.
        </p>
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted">Data folder</span>
          <input className="field mono" value={dir} onChange={e => setDir(e.target.value)} spellCheck={false} />
        </label>
        <div className="row">
          {platform.pickFolder && (
            <button className="btn" onClick={pick}>
              <FolderOpen size={18} /> Choose…
            </button>
          )}
          <button className="btn primary" disabled={!dir.trim()} onClick={confirm}>
            Use this folder
          </button>
        </div>
        <p className="muted">If the folder already has Hypomnemata files, they are used as they are.</p>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}

// Android: the app needs "All files access" to see files copied by the PC (SPEC 2.3).
export function FileAccess({ platform, onCheck }: { platform: Platform; onCheck: () => void }) {
  return (
    <div className="center-screen">
      <div className="card stack">
        <h1>Allow access to your notes folder</h1>
        <p>
          Hypomnemata keeps your notes in a normal folder so the PC can copy them over USB. Android only lets an
          app read files it did not create itself when you turn on <b>All files access</b>.
        </p>
        <p className="muted">The app works offline and never sends anything anywhere.</p>
        <div className="row">
          <button className="btn primary" onClick={() => platform.openFileAccessSettings?.()}>
            <ShieldCheck size={18} /> Open settings
          </button>
          <button className="btn" onClick={onCheck}>
            I turned it on
          </button>
        </div>
      </div>
    </div>
  );
}

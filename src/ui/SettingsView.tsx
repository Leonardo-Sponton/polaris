import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { useApp } from "./context";
import type { Theme } from "../data/settings";

export function SettingsView() {
  const { platform, settings, updateSettings } = useApp();
  const [dir, setDir] = useState<string | null>(null);

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
      </div>
    </div>
  );
}

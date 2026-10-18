import { useEffect, useRef } from "react";
import { buildSnapshot, type WidgetInput } from "../data/widgets";
import { useApp } from "./context";

// Keeps the Android home-screen widgets up to date (data/widgets): after every change the
// snapshot is written again, a moment later so a burst of reloads writes it once.

const COLORS = ["bg", "surface", "line", "text", "strong", "muted", "accent", "on-accent", "h1", "h2", "h3", "ok", "cyan", "err"];

export function useWidgets(input: Omit<WidgetInput, "root" | "colors">, loaded: boolean) {
  const { platform } = useApp();
  const last = useRef("");
  const ref = useRef(input);
  ref.current = input;
  const send = platform.setWidgetData;

  useEffect(() => {
    if (!send || !loaded) return;
    const timer = setTimeout(async () => {
      const root = await platform.getDataDir();
      if (!root) return;
      const css = getComputedStyle(document.documentElement);
      const colors = Object.fromEntries(COLORS.map(c => [c, css.getPropertyValue(`--${c}`).trim()]));
      const snap = buildSnapshot({ ...ref.current, root, colors });
      // Unchanged apart from the time it was made: nothing to redraw.
      const key = JSON.stringify({ ...snap, written: "" });
      if (key === last.current) return;
      last.current = key;
      send(JSON.stringify(snap)).catch(() => (last.current = ""));
    }, 800);
    return () => clearTimeout(timer);
  }, [send, platform, loaded, ...Object.values(input)]);
}

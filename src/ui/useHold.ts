import { useEffect, useRef } from "react";

// Hold a row (touch) or right-click it (PC) to open its options, as in the task rows.
// `eaten()` is true right after a hold, so the click that follows does not open the row.

const HOLD = 500;

export function useHold(onMenu: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const ate = useRef(false);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  return {
    eaten: () => ate.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        ate.current = false;
        if (e.pointerType !== "touch") return;
        start.current = { x: e.clientX, y: e.clientY };
        stop();
        timer.current = setTimeout(() => {
          ate.current = true;
          navigator.vibrate?.(20);
          onMenu();
        }, HOLD);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 10) stop();
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        stop();
        onMenu();
      },
    },
  };
}

import { useEffect, useState } from "react";
import { useApp } from "../context";

// Book covers (SPEC 5.6): any picked image is shrunk to at most 800 px and stored as JPEG, so a
// phone photo of a few MB becomes ~100 KB in the data folder (and in sync and backups).

const MAX = 800;

export async function shrinkImage(file: Blob): Promise<Uint8Array> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff"; // transparent PNGs get a white page, not black
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not read this image");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A displayable URL for a cover file. Reloaded when the file changes (a new cover keeps the
 * name cover.jpg, so its modification time tells).
 */
export function useCoverUrl(path: string | undefined): string | null {
  const { notes, version } = useApp();
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return setShown(null);
    let alive = true;
    (async () => {
      const st = await notes.storage.stat(path);
      if (!st) return alive && setShown(null);
      const key = `${path}@${st.mtime}:${st.size}`;
      if (shown?.key === key) return;
      const bytes = await notes.storage.readBinary(path);
      if (alive) setShown({ key, url: URL.createObjectURL(new Blob([bytes as BlobPart])) });
    })().catch(() => alive && setShown(null));
    return () => {
      alive = false;
    };
  }, [notes, path, version]);
  // The previous picture is freed once it is replaced or the card goes away.
  useEffect(() => {
    const url = shown?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shown]);
  return shown?.url ?? null;
}

/** A steady color per title for books without a cover. */
export function placeholderColor(title: string) {
  const colors = ["accent", "h1", "h2", "h3", "ok"];
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(--${colors[h % colors.length]})`;
}

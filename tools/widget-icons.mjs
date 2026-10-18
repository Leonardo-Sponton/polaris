// Android vector drawables for the home-screen widgets, made from the same lucide icons the app
// uses (node_modules/lucide-react), so both look alike. Run after updating lucide-react:
//   node tools/widget-icons.mjs
import { writeFileSync } from "node:fs";

const ICONS = ["sun", "plus", "file-text", "file-plus", "lightbulb", "folder-kanban", "book-open", "feather",
  "notebook-pen", "scale", "moon", "inbox", "check", "pin", "repeat"];
const OUT = "android/app/src/main/res/drawable";

const n = v => Number(v ?? 0);

/**
 * Writes every number apart. SVG lets arc flags run together ("a2 2 0 00-2 2"); Android's path
 * reader does not, so arcs are read here param by param (the 4th and 5th are one digit each).
 */
function spaced(d) {
  const out = [];
  let i = 0, cmd = "", k = 0;
  const num = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i;
  while (i < d.length) {
    const c = d[i];
    if (/[\s,]/.test(c)) { i++; continue; }
    if (/[a-z]/i.test(c)) { out.push(c); cmd = c; k = 0; i++; continue; }
    if (/a/i.test(cmd) && (k % 7 === 3 || k % 7 === 4)) { out.push(c); i++; k++; continue; }
    const m = num.exec(d.slice(i));
    if (!m) throw new Error(`Bad path near ${d.slice(i)}`);
    out.push(m[0]); i += m[0].length; k++;
  }
  return out.join(" ").replace(/ ([a-z]) /gi, " $1");
}
function toPath(tag, a) {
  switch (tag) {
    case "path":
      return a.d;
    case "circle":
    case "ellipse": {
      const rx = n(a.r ?? a.rx), ry = n(a.r ?? a.ry), cx = n(a.cx), cy = n(a.cy);
      return `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0`;
    }
    case "rect": {
      const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height);
      const r = Math.min(n(a.rx ?? a.ry), w / 2, h / 2);
      if (!r) return `M${x},${y}h${w}v${h}h${-w}z`;
      return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}` +
        `h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}z`;
    }
    case "line":
      return `M${a.x1},${a.y1}L${a.x2},${a.y2}`;
    case "polyline":
    case "polygon": {
      const p = a.points.trim().split(/[\s,]+/);
      let d = `M${p[0]},${p[1]}`;
      for (let i = 2; i < p.length; i += 2) d += `L${p[i]},${p[i + 1]}`;
      return tag === "polygon" ? d + "z" : d;
    }
  }
  throw new Error(`Unknown SVG element ${tag}`);
}

for (const name of ICONS) {
  const { __iconData } = await import(`../node_modules/lucide-react/dist/esm/icons/${name}.mjs`);
  const node = __iconData.node;
  const paths = node
    .map(([tag, a]) => `    <path\n        android:pathData="${spaced(toPath(tag, a))}"\n        android:strokeColor="#FFFFFFFF"\n` +
      `        android:strokeWidth="2"\n        android:strokeLineCap="round"\n        android:strokeLineJoin="round" />`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- lucide "${name}" (ISC license), made by tools/widget-icons.mjs. Tinted in code. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${paths}
</vector>
`;
  writeFileSync(`${OUT}/ic_w_${name.replace(/-/g, "_")}.xml`, xml);
}
console.log(`${ICONS.length} icons in ${OUT}`);

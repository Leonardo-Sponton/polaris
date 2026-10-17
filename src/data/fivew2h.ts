// The 5W2H block (SPEC 3.4): plain Markdown that any editor can read, shown by the app as a
// small form. The block is the "## 5W2H" section: from its heading to the next "## " heading.
//
//   ## 5W2H
//   - **What:** …
//   - **Why:** …

export const FIELDS = ["What", "Why", "Where", "When", "Who", "How", "How much"] as const;
export type Field = (typeof FIELDS)[number];

export interface Block {
  values: Record<Field, string>;
  /** Lines inside the section that are not one of the seven fields (kept as they are). */
  extra: string;
}

export const emptyBlock = (): Block => ({
  values: Object.fromEntries(FIELDS.map(f => [f, ""])) as Record<Field, string>,
  extra: "",
});

const HEAD = /^##[ \t]+5W2H[ \t]*#*[ \t]*$/im;
const FIELD = /^[-*+][ \t]+\*\*([^*]+?):?\*\*:?[ \t]*(.*)$/;

/**
 * Splits a body into the text without the block and the block itself (null when there is none).
 * The rest keeps everything before and after the section, so `join(rest, block)` gives back an
 * equivalent body with the block moved to the end.
 */
export function split(body: string): { rest: string; block: Block | null } {
  const m = HEAD.exec(body);
  if (!m) return { rest: body, block: null };
  const start = m.index;
  const after = body.slice(start + m[0].length);
  const next = /^##[ \t]/m.exec(after);
  const inner = next ? after.slice(0, next.index) : after;
  const tail = next ? after.slice(next.index) : "";

  const block = emptyBlock();
  const extra: string[] = [];
  for (const line of inner.split("\n")) {
    const f = FIELD.exec(line.trim());
    const name = f && FIELDS.find(x => x.toLowerCase() === f[1].trim().toLowerCase());
    if (name) block.values[name] = f![2].trim();
    else extra.push(line);
  }
  block.extra = extra.join("\n").trim();

  const before = body.slice(0, start).replace(/\s+$/, "");
  const rest = tail ? `${before}${before ? "\n\n" : ""}${tail}` : before ? `${before}\n` : "";
  return { rest, block };
}

export function format(block: Block): string {
  const lines = FIELDS.map(f => `- **${f}:** ${block.values[f].replace(/\s*\n\s*/g, " ").trim()}`.trimEnd());
  return `## 5W2H\n${lines.join("\n")}\n${block.extra ? `\n${block.extra}\n` : ""}`;
}

/** The body with the block at the end (or without it when `block` is null). */
export function join(rest: string, block: Block | null): string {
  if (!block) return rest;
  const base = rest.replace(/\s+$/, "");
  return `${base}${base ? "\n\n" : ""}${format(block)}`;
}

export const isEmpty = (b: Block) => !b.extra && FIELDS.every(f => !b.values[f].trim());

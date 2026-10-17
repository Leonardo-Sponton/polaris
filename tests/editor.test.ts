import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { buildDecorations, toggleTask } from "../src/editor/livePreview";
import { previewOf } from "../src/data/frontmatter";

const stateOf = (doc: string) => EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });

/** What the reader sees: the text with hidden parts removed, boxes as [ ]/[x], plus line classes. */
function render(doc: string, rawLines: number[] = []) {
  const state = stateOf(doc);
  const set = buildDecorations(state, [{ from: 0, to: doc.length }], new Set(rawLines));
  const hidden: [number, number, string?][] = [];
  const lineCls: Record<number, string[]> = {};
  const marks: string[] = [];
  set.between(0, doc.length, (from, to, d) => {
    const spec = d.spec as { class?: string; widget?: { checked: boolean } };
    if (from === to && spec.class) (lineCls[state.doc.lineAt(from).number] ??= []).push(spec.class);
    else if (spec.class) marks.push(`${spec.class}:${doc.slice(from, to)}`);
    else hidden.push([from, to, spec.widget ? (spec.widget.checked ? "[x]" : "[ ]") : ""]);
  });
  let out = "";
  let pos = 0;
  for (const [from, to, shown] of hidden.sort((a, b) => a[0] - b[0])) {
    out += doc.slice(pos, from) + shown;
    pos = to;
  }
  return { text: out + doc.slice(pos), lineCls, marks };
}

describe("live preview", () => {
  it("hides Markdown symbols away from the caret", () => {
    const r = render("# Title\n\nSome **bold** and *it* and `code`.\n\n> quoted\n");
    expect(r.text).toBe("Title\n\nSome bold and it and code.\n\nquoted\n");
    expect(r.lineCls[1]).toEqual(["cm-hm-h1"]);
    expect(r.lineCls[5]).toEqual(["cm-hm-quote"]);
    expect(r.marks).toEqual(expect.arrayContaining(["cm-hm-strong:**bold**", "cm-hm-em:*it*", "cm-hm-code:`code`"]));
  });

  it("shows raw text on the caret lines only", () => {
    const r = render("# Title\n**a** **b**\n## Sub", [2]);
    expect(r.text).toBe("Title\n**a** **b**\nSub");
    expect(r.lineCls[3]).toEqual(["cm-hm-h2"]);
  });

  it("draws task boxes, hides the dash and strikes done tasks", () => {
    const r = render("- [ ] buy bread\n- [x] buy milk\n- plain");
    expect(r.text).toBe("[ ] buy bread\n[x] buy milk\n- plain");
    expect(r.marks).toContain("cm-hm-done: buy milk");
    expect(r.marks).toContain("cm-hm-bullet:-");
  });

  it("keeps the box on the caret line but shows the dash", () => {
    expect(render("- [ ] task", [1]).text).toBe("- [ ] task");
  });

  it("does not hide inside fenced code", () => {
    const r = render("```\n# not a title **x**\n```");
    expect(r.text).toBe("```\n# not a title **x**\n```");
    expect(r.lineCls[2]).toEqual(["cm-hm-codeblock"]);
  });

  it("toggles a task box both ways", () => {
    const s = stateOf("- [ ] a\n- [X] b");
    expect(toggleTask(s, 2)).toEqual({ from: 3, to: 4, insert: "x" });
    expect(toggleTask(s, 10)).toEqual({ from: 11, to: 12, insert: " " });
    expect(toggleTask(s, 0)).toBeNull();
  });
});

describe("list preview", () => {
  it("uses the title, else the first line without symbols", () => {
    expect(previewOf("# Hello\nbody")).toBe("Hello");
    expect(previewOf("\n- [ ] call **Ana**\n")).toBe("call Ana");
    expect(previewOf("> a *quote*")).toBe("a quote");
    expect(previewOf("")).toBe("");
  });
});

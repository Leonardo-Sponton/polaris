import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";

// Live preview like MyNotes (SPEC 4.3): Markdown is shown formatted and its symbols (#, **, >…)
// are hidden, except on the lines that hold the caret, where the raw text is visible for editing.
// It reads the parse tree from @codemirror/lang-markdown, so it follows the same rules as the parser.

const hide = Decoration.replace({});
const line = (cls: string) => Decoration.line({ class: cls });
const mark = (cls: string) => Decoration.mark({ class: cls });

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("span");
    box.className = `cm-hm-check${this.checked ? " done" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

/** Line numbers that show raw Markdown: every line touched by a selection, while focused. */
function caretLines(view: EditorView): Set<number> {
  const out = new Set<number>();
  if (!view.hasFocus) return out;
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

/**
 * The decorations for `ranges` of the text. `raw` holds the line numbers shown as plain Markdown.
 * Pure (no DOM), so tests can call it.
 */
export function buildDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  raw: Set<number>,
): DecorationSet {
  const isRaw = (pos: number) => raw.has(state.doc.lineAt(pos).number);
  const decos: Range<Decoration>[] = [];
  const eachLine = (from: number, to: number, cls: string) => {
    for (let pos = from; pos <= to; ) {
      const l = state.doc.lineAt(pos);
      decos.push(line(cls).range(l.from));
      pos = l.to + 1;
    }
  };
  // Hides a symbol and the space right after it ("# ", "> ").
  const hideMark = (from: number, to: number, withSpace = false) => {
    if (isRaw(from)) return;
    if (withSpace && state.sliceDoc(to, to + 1) === " ") to++;
    if (to > from) decos.push(hide.range(from, to));
  };

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: node => {
        const name = node.name;
        const h = /^ATXHeading(\d)$/.exec(name);
        if (h) {
          decos.push(line(`cm-hm-h${Math.min(+h[1], 3)}`).range(state.doc.lineAt(node.from).from));
          return;
        }
        switch (name) {
          case "HeaderMark": {
            // Opening "# " at the start, or optional closing " #" at the end.
            const atStart = node.from === state.doc.lineAt(node.from).from;
            if (atStart) hideMark(node.from, node.to, true);
            else hideMark(state.sliceDoc(node.from - 1, node.from) === " " ? node.from - 1 : node.from, node.to);
            break;
          }
          case "Blockquote":
            eachLine(node.from, node.to, "cm-hm-quote");
            break;
          case "QuoteMark":
            hideMark(node.from, node.to, true);
            break;
          case "StrongEmphasis":
            decos.push(mark("cm-hm-strong").range(node.from, node.to));
            break;
          case "Emphasis":
            decos.push(mark("cm-hm-em").range(node.from, node.to));
            break;
          case "Strikethrough":
            decos.push(mark("cm-hm-strike").range(node.from, node.to));
            break;
          case "InlineCode":
            decos.push(mark("cm-hm-code").range(node.from, node.to));
            break;
          case "EmphasisMark":
          case "StrikethroughMark":
            hideMark(node.from, node.to);
            break;
          case "CodeMark":
            if (node.node.parent?.name === "InlineCode") hideMark(node.from, node.to);
            break;
          case "FencedCode":
          case "CodeBlock":
            eachLine(node.from, node.to, "cm-hm-codeblock");
            return false;
          case "Link":
            decos.push(mark("cm-hm-link").range(node.from, node.to));
            break;
          case "HorizontalRule":
            if (!isRaw(node.from)) {
              decos.push(line("cm-hm-hr").range(state.doc.lineAt(node.from).from));
              decos.push(hide.range(node.from, node.to));
            }
            break;
          case "ListMark": {
            // "- [ ] task": the "- " is hidden and the box is drawn instead.
            const next = node.node.nextSibling;
            if (next?.name === "Task") hideMark(node.from, node.to, true);
            else decos.push(mark("cm-hm-bullet").range(node.from, node.to));
            break;
          }
          case "TaskMarker": {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            decos.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to));
            const task = node.node.parent;
            if (checked && task && task.to > node.to) decos.push(mark("cm-hm-done").range(node.to, task.to));
            break;
          }
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

/** Flips "[ ]" ↔ "[x]" for the task box that starts at `pos`. */
export function toggleTask(state: EditorState, pos: number) {
  const box = state.sliceDoc(pos, pos + 3);
  if (!/^\[[ xX]\]$/.test(box)) return null;
  return { from: pos + 1, to: pos + 2, insert: box[1] === " " ? "x" : " " };
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state, view.visibleRanges, caretLines(view));
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged)
        this.decorations = buildDecorations(u.state, u.view.visibleRanges, caretLines(u.view));
    }
  },
  {
    decorations: v => v.decorations,
    eventHandlers: {
      // Tapping a box toggles it without moving the caret or opening the Android keyboard.
      mousedown(e, view) {
        const el = e.target as HTMLElement;
        if (!el.classList?.contains("cm-hm-check")) return false;
        const change = toggleTask(view.state, view.posAtDOM(el));
        if (!change) return false;
        e.preventDefault();
        view.dispatch({ changes: change, userEvent: "input.toggle" });
        return true;
      },
    },
  },
);

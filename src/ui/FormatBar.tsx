import type { EditorView } from "@codemirror/view";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table,
  type LucideIcon,
} from "lucide-react";
import { formatSpec, type Format } from "../editor/format";
import { t } from "../i18n";

// The quick formatting strip under the note bar: one tap writes the Markdown for the user
// (the long version is the MarkdownGuide). Scrolls sideways on the phone.

const BUTTONS: [Format, LucideIcon][] = [
  ["h1", Heading1],
  ["h2", Heading2],
  ["bold", Bold],
  ["italic", Italic],
  ["strike", Strikethrough],
  ["list", List],
  ["numbered", ListOrdered],
  ["todo", ListTodo],
  ["quote", Quote],
  ["code", Code],
  ["link", Link],
  ["line", Minus],
  ["table", Table],
];

export function FormatBar({ view }: { view: { current: EditorView | null } }) {
  const fb = t.formatBar;
  const apply = (f: Format) => {
    const v = view.current;
    if (!v) return;
    const c = fb.column;
    const table = `| ${c} 1 | ${c} 2 |\n| --- | --- |\n|  |  |`;
    v.dispatch({ ...formatSpec(v.state, f, table), scrollIntoView: true, userEvent: "format" });
    v.focus();
  };
  return (
    <div className="format-bar" role="toolbar" aria-label={fb.label}>
      {BUTTONS.map(([f, Icon]) => (
        <button
          key={f}
          className="btn ghost icon"
          title={fb.names[f]}
          aria-label={fb.names[f]}
          // Keep the focus (and the Android keyboard) in the editor.
          onPointerDown={e => e.preventDefault()}
          onMouseDown={e => e.preventDefault()}
          onClick={() => apply(f)}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}

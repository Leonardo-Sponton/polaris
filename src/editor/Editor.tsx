import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { livePreview } from "./livePreview";

// The Markdown text area used everywhere (SPEC 4.3). It owns its text while mounted:
// the parent gets every change through onChange and remounts it (new `key`) to load other text.

interface Props {
  text: string;
  onChange(text: string): void;
  /** Ctrl+S. */
  onSaveNow?(): void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Slash commands: typing "/name" alone on a line removes it and runs commands[name]. */
  commands?: Record<string, () => void>;
  /** Gets the CodeMirror view while mounted (the format bar writes through it). */
  viewRef?: { current: EditorView | null };
}

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--text)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--sans)", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { padding: "8px 0 40vh", caretColor: "var(--accent)", maxWidth: "760px", margin: "0 auto" },
  ".cm-line": { padding: "0 4px" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
});

export function Editor({ text, onChange, onSaveNow, placeholder, autoFocus, commands, viewRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Latest callbacks, so the editor is created once per mount.
  const cb = useRef({ onChange, onSaveNow, commands });
  cb.current = { onChange, onSaveNow, commands };

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                cb.current.onSaveNow?.();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // GFM base: task lists "- [ ]" and ~~strike~~. Enter continues lists (markdownKeymap).
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          // Keep the caret clear of the screen edges and the Android keyboard while typing.
          EditorView.scrollMargins.of(() => ({ top: 24, bottom: 48 })),
          EditorView.contentAttributes.of({ spellcheck: "true", autocapitalize: "sentences", autocorrect: "on" }),
          placeholderExt(placeholder ?? ""),
          livePreview,
          theme,
          EditorView.updateListener.of(u => {
            if (!u.docChanged) return;
            if (u.transactions.some(t => t.isUserEvent("input")) && runCommand(u.view, cb.current.commands)) return;
            cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    if (viewRef) viewRef.current = view;
    if (autoFocus) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    }
    return () => {
      if (viewRef?.current === view) viewRef.current = null;
      view.destroy();
    };
    // Created once per mount on purpose (see the comment at the top).
  }, []);

  return <div className="editor" ref={host} />;
}

/** When the caret line is exactly "/name" for a known command: removes it and runs the command. */
function runCommand(view: EditorView, commands?: Record<string, () => void>): boolean {
  if (!commands) return false;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const m = /^\s*\/(\S+)\s*$/.exec(line.text);
  const run = m && sel.head === line.to && commands[m[1].toLowerCase()];
  if (!run) return false;
  // Dispatching inside an update listener is not allowed: do it right after.
  queueMicrotask(() => {
    view.dispatch({ changes: { from: line.from, to: line.to }, userEvent: "delete" });
    run();
  });
  return true;
}

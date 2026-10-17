import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { routeCapture, type Capture } from "../../data/inbox";
import { parseQuickAdd, type QuickAdd as Parsed } from "../../data/quickadd";
import { describeRule, parseRule } from "../../data/recur";
import { dayLabel } from "../../data/todo";

// One-line task entry (SPEC 5.3). The recognized parts are colored inside the field (a copy of
// the text drawn behind a transparent text area) and summed up in a preview line below.
// With `onCapture` it is the quick capture field (SPEC 5.2): the preview says where the line
// goes (Inbox or To-do) before Enter, and "Keep as note" sends a matched line to the inbox.

const PRIO = { 1: "High", 2: "Medium", 3: "Low" } as const;

export function previewParts(q: Parsed): string[] {
  const out: string[] = [];
  if (q.when) out.push(q.when === "someday" ? "Someday" : dayLabel(q.when));
  if (q.evening) out.push("Evening");
  if (q.time) out.push(q.time);
  if (q.repeat) out.push(describeRule(parseRule(q.repeat)!));
  if (q.listName) out.push(`#${q.listName}`);
  if (q.priority) out.push(`${PRIO[q.priority]} priority`);
  return out;
}

type Props = { placeholder: string; autoFocus?: boolean } & (
  | { onAdd(q: Parsed): Promise<boolean>; onCapture?: undefined }
  | { onCapture(c: Capture): Promise<boolean>; onAdd?: undefined }
);

export const QuickAdd = forwardRef<HTMLTextAreaElement, Props>(function QuickAdd(
  { placeholder, autoFocus, onAdd, onCapture },
  ref,
) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [asNote, setAsNote] = useState(false);
  const q = useMemo(() => parseQuickAdd(text), [text]);
  const route = useMemo(() => (onCapture ? routeCapture(text, new Date(), asNote) : null), [onCapture, text, asNote]);

  const marked: ReactNode[] = [];
  let at = 0;
  for (const s of route?.to === "inbox" ? [] : q.spans) {
    marked.push(text.slice(at, s.start));
    marked.push(
      <mark key={s.start} className={`qa-${s.kind}`}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  marked.push(text.slice(at) + "​"); // keeps the last empty line's height

  // The links under the field must not take the focus (that would close the phone keyboard).
  const keepFocus = (e: React.PointerEvent) => e.preventDefault();

  const clear = () => {
    setText("");
    setAsNote(false);
  };

  const submit = async (value = text) => {
    if (busy) return;
    if (onCapture) {
      const c = value === text && route ? route : routeCapture(value, new Date(), asNote);
      if (c.to === "inbox" && !c.text) return;
      setBusy(true);
      try {
        if (await onCapture(c)) clear();
      } finally {
        setBusy(false);
      }
      return;
    }
    const parsed = value === text ? q : parseQuickAdd(value);
    if (!parsed.title) return;
    setBusy(true);
    try {
      if (await onAdd(parsed)) clear();
    } finally {
      setBusy(false);
    }
  };

  const task = route ? (route.to === "todo" ? route.task : null) : q;
  const parts = task ? previewParts(task) : [];
  const canAdd = route ? (route.to === "todo" ? !!route.task.title : !!route.text) : !!q.title;

  return (
    <div className="quick-add">
      <div className="qa-box">
        <div className="qa-mirror" aria-hidden>
          {marked}
        </div>
        <textarea
          ref={ref}
          className="qa-input"
          rows={1}
          value={text}
          placeholder={placeholder}
          spellCheck
          enterKeyHint="done"
          autoFocus={autoFocus}
          aria-label={onCapture ? "Quick capture" : "New task"}
          onChange={e => {
            // Some Android keyboards send Enter as a new line instead of a key event.
            const v = e.target.value;
            if (v.includes("\n")) {
              const line = v.replace(/\n/g, " ").trim();
              setText(line);
              submit(line);
            } else setText(v);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") clear();
          }}
        />
        <button
          className="btn ghost icon qa-add"
          aria-label={onCapture ? "Capture" : "Add task"}
          disabled={!canAdd || busy}
          onClick={() => submit()}
        >
          <Plus size={20} />
        </button>
      </div>
      {text.trim() && route?.to === "inbox" && (
        <div className="qa-preview mono">
          <span className="qa-dest">Inbox</span> {route.text}
          {asNote && (
            <button className="qa-link" onPointerDown={keepFocus} onClick={() => setAsNote(false)}>
              Make it a to-do
            </button>
          )}
        </div>
      )}
      {text.trim() && task && (
        <div className="qa-preview mono">
          {route && <span className="qa-dest">To-do</span>}{" "}
          {task.title ? <strong>{task.title}</strong> : <span className="err">Type a title</span>}
          {parts.map(p => (
            <span key={p}> · {p}</span>
          ))}
          {route && (
            <button className="qa-link" onPointerDown={keepFocus} onClick={() => setAsNote(true)}>
              Keep as note
            </button>
          )}
        </div>
      )}
    </div>
  );
});

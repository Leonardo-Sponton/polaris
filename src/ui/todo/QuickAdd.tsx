import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { parseQuickAdd, type QuickAdd as Parsed } from "../../data/quickadd";
import { describeRule, parseRule } from "../../data/recur";
import { dayLabel } from "../../data/todo";

// One-line task entry (SPEC 5.3). The recognized parts are colored inside the field (a copy of
// the text drawn behind a transparent text area) and summed up in a preview line below.

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

interface Props {
  placeholder: string;
  onAdd(q: Parsed): Promise<boolean>;
}

export const QuickAdd = forwardRef<HTMLTextAreaElement, Props>(function QuickAdd({ placeholder, onAdd }, ref) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useMemo(() => parseQuickAdd(text), [text]);

  const marked: ReactNode[] = [];
  let at = 0;
  for (const s of q.spans) {
    marked.push(text.slice(at, s.start));
    marked.push(
      <mark key={s.start} className={`qa-${s.kind}`}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  marked.push(text.slice(at) + "​"); // keeps the last empty line's height

  const submit = async (value = text) => {
    const parsed = value === text ? q : parseQuickAdd(value);
    if (!parsed.title || busy) return;
    setBusy(true);
    try {
      if (await onAdd(parsed)) setText("");
    } finally {
      setBusy(false);
    }
  };

  const parts = previewParts(q);

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
          aria-label="New task"
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
            } else if (e.key === "Escape") setText("");
          }}
        />
        <button
          className="btn ghost icon qa-add"
          aria-label="Add task"
          disabled={!q.title || busy}
          onClick={() => submit()}
        >
          <Plus size={20} />
        </button>
      </div>
      {text.trim() && (
        <div className="qa-preview mono">
          {q.title ? <strong>{q.title}</strong> : <span className="err">Type a title</span>}
          {parts.map(p => (
            <span key={p}> · {p}</span>
          ))}
        </div>
      )}
    </div>
  );
});

import { useRef, useState } from "react";
import { t, word } from "../i18n";
import { X } from "lucide-react";
import { emptyBlock, FIELD_NAMES, FIELDS, isEmpty, join, split, type Block, type Field } from "../data/fivew2h";
import { useApp } from "./context";

// The 5W2H block as a form (SPEC 3.4): seven labeled fields, written back as Markdown.


export function FiveW2HForm(props: { block: Block; onChange(b: Block): void; onRemove(): void; autoFocus?: boolean }) {
  const { toast } = useApp();
  const [b, setB] = useState(props.block);

  const set = (f: Field, v: string) => {
    const next = { ...b, values: { ...b.values, [f]: v.replace(/\n/g, " ") } };
    setB(next);
    props.onChange(next);
  };

  const remove = () => {
    const old = b;
    props.onRemove();
    if (!isEmpty(old)) toast({ text: t.w2h.removed, action: { label: t.common.undo, run: () => props.onChange(old) } });
  };

  return (
    <section className="w2h" aria-label="5W2H">
      <div className="w2h-head">
        <span className="fl">5W2H</span>
        <button className="btn ghost icon" aria-label={t.w2h.remove} title={t.w2h.remove} onClick={remove}>
          <X size={16} />
        </button>
      </div>
      <div className="task-fields">
        {FIELDS.map((f, i) => (
          <label key={f} className="contents">
            <span className="fl">{word(FIELD_NAMES[f])}</span>
            <input
              className="field"
              value={b.values[f]}
              placeholder={t.w2h.hints[f]}
              autoFocus={props.autoFocus && i === 0}
              onChange={e => set(f, e.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

/**
 * Keeps a body's 5W2H block apart from the free text shown in the editor. `text()` is the editor
 * text, `body()` the full text to save (block at the end); `write` is called after each change.
 */
export function useFiveW2H(initial: string, write: () => void) {
  const [first] = useState(() => split(initial));
  const textRef = useRef(first.rest);
  const blockRef = useRef(first.block);
  const [block, setBlock] = useState(first.block);
  const [rev, setRev] = useState(0);

  const change = (b: Block | null) => {
    blockRef.current = b;
    setBlock(b);
    write();
  };

  return {
    initialText: first.rest,
    text: () => textRef.current,
    setText: (s: string) => (textRef.current = s),
    body: () => join(textRef.current, blockRef.current),
    has: block !== null,
    /** Adds an empty block (or focuses the one there). */
    insert: () => {
      if (!blockRef.current) change(emptyBlock());
      setRev(r => r + 1);
    },
    /** The form, or nothing when the body has no block. */
    form: block && (
      <FiveW2HForm
        key={rev}
        block={block}
        autoFocus={rev > 0}
        onChange={b => change(b)}
        onRemove={() => change(null)}
      />
    ),
  };
}

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { KINDS, ThoughtError, createThought, parseThemes, problems, saveThought, type Fields, type Kind, type Thought } from "../../data/thoughts";
import { useApp } from "../context";
import { useBack } from "../useBack";

// New or edited own thought (SPEC 5.10). Unlike notes it is saved with a button: the kind decides
// which fields are required and repeats are refused, so a half-typed thought is never written.

interface Props {
  all: Thought[];
  /** Missing: a new thought. */
  thought?: Thought;
  /** The saved thought's id, or nothing when cancelled. */
  onDone(id?: string): void;
}

export function ThoughtForm({ all, thought, onDone }: Props) {
  const { notes, bump } = useApp();
  const [kind, setKind] = useState<Kind>(thought?.kind ?? "mine");
  const [text, setText] = useState(thought?.text ?? "");
  const [author, setAuthor] = useState(thought?.author ?? "");
  const [work, setWork] = useState(thought?.work ?? "");
  const [reference, setReference] = useState(thought?.reference ?? "");
  const [source, setSource] = useState(thought?.source ?? "");
  const [themes, setThemes] = useState(thought?.themes.join(", ") ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cancel = () => onDone(thought?.id);
  useBack(true, cancel);

  // Fields hidden for the chosen kind are not saved.
  const fields = (): Fields =>
    kind === "mine"
      ? { kind, text, themes: parseThemes(themes) }
      : { kind, text, author, work, reference, source: kind === "verified" ? source : undefined, themes: parseThemes(themes) };

  const save = async () => {
    const f = fields();
    const errs = problems(f);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const n = thought ? await saveThought(notes, all, thought, f) : await createThought(notes, all, f);
      bump();
      onDone(n.path.replace(/^thoughts\//, "").replace(/\.md$/, ""));
    } catch (e) {
      setErrors(e instanceof ThoughtError ? e.message.split("\n") : [e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const input = (label: string, value: string, set: (v: string) => void, placeholder: string, required = false) => (
    <>
      <span className="fl">
        {label}
        {required && " *"}
      </span>
      <input className="field" value={value} placeholder={placeholder} onChange={e => set(e.target.value)} />
    </>
  );

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={cancel} aria-label="Cancel">
          <ArrowLeft size={20} />
        </button>
        <span className="muted small">{thought ? "Edit thought" : "New thought"}</span>
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <div className="chips" role="radiogroup" aria-label="Kind">
            {KINDS.map(k => (
              <button
                key={k.id}
                role="radio"
                aria-checked={kind === k.id}
                className={`chip${kind === k.id ? " active" : ""}`}
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {KINDS.find(k => k.id === kind)!.hint}
          </p>
          <textarea
            className="quote-input"
            rows={4}
            value={text}
            autoFocus={!thought}
            placeholder={kind === "mine" ? "Your thought" : "The quote, word for word"}
            aria-label="Text"
            onChange={e => setText(e.target.value)}
          />
          <div className="task-fields">
            {kind !== "mine" && input("Author", author, setAuthor, kind === "uncertain" ? "Usually attributed to" : "e.g. Seneca", true)}
            {kind !== "mine" && input("Work", work, setWork, "e.g. Letters to Lucilius")}
            {kind !== "mine" && input("Reference", reference, setReference, "e.g. Letter 1, §3 or p. 42")}
            {kind === "verified" && input("Source", source, setSource, "Where you checked it: edition, page, link", true)}
            {input("Themes", themes, setThemes, "e.g. time, courage")}
          </div>
          {errors.length > 0 && (
            <ul className="err small th-errors" role="alert">
              {errors.map(e => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="row task-actions" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={cancel}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

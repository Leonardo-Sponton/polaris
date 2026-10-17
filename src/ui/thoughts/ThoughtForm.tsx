import { useState } from "react";
import { t } from "../../i18n";
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
        <button className="btn ghost icon back" onClick={cancel} aria-label={t.common.cancel}>
          <ArrowLeft size={20} />
        </button>
        <span className="muted small">{thought ? t.thoughts.editThought : t.thoughts.newThought}</span>
      </div>
      <div className="page task-page">
        <div className="page-inner stack">
          <div className="chips" role="radiogroup" aria-label={t.thoughts.kind}>
            {KINDS.map(k => (
              <button
                key={k.id}
                role="radio"
                aria-checked={kind === k.id}
                className={`chip${kind === k.id ? " active" : ""}`}
                onClick={() => setKind(k.id)}
              >
                {t.thoughts.kinds[k.id][0]}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {t.thoughts.kinds[kind][1]}
          </p>
          <textarea
            className="quote-input"
            rows={4}
            value={text}
            autoFocus={!thought}
            placeholder={kind === "mine" ? t.thoughts.yourThought : t.thoughts.wordForWord}
            aria-label={t.thoughts.text}
            onChange={e => setText(e.target.value)}
          />
          <div className="task-fields">
            {kind !== "mine" && input(t.thoughts.author, author, setAuthor, kind === "uncertain" ? t.thoughts.attributedTo : t.thoughts.authorEg, true)}
            {kind !== "mine" && input(t.thoughts.work, work, setWork, t.thoughts.workEg)}
            {kind !== "mine" && input(t.thoughts.reference, reference, setReference, t.thoughts.referenceEg)}
            {kind === "verified" && input(t.thoughts.source, source, setSource, t.thoughts.sourceEg, true)}
            {input(t.thoughts.themes, themes, setThemes, t.thoughts.themesEg)}
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
              {t.common.cancel}
            </button>
            <button className="btn primary" disabled={busy} onClick={save}>
              {t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import type { Data } from "../../data/frontmatter";
import {
  QUESTIONS,
  RESULTS,
  answerPatch,
  answersOf,
  assumptionsOf,
  assumptionsPatch,
  score,
  type Answer,
  type Assumption,
} from "../../data/ideas";
import { useApp } from "../context";

// The idea's homework (SPEC 5.4): the viability checklist with its score and the riskiest
// assumptions. Both start folded so a fresh draft stays a plain page.

const ANSWERS: { id: Answer; label: string }[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "unsure", label: "Unsure" },
];

function Fold(props: { title: string; meta: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fold-box">
      <button className="section-head fold" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {props.title} <span className="mono muted">{props.meta}</span>
      </button>
      {open && <div className="fold-body stack">{props.children}</div>}
    </section>
  );
}

export function Viability({ data, patch }: { data: Data; patch(p: Data): void }) {
  const answers = answersOf(data);
  const s = score(answers);
  const list = assumptionsOf(data);
  const tested = list.filter(a => a.result !== "untested").length;

  return (
    <>
      <Fold
        title="Viability checklist"
        meta={
          s.answered ? (
            <>
              {s.yes}/{s.total}
              {s.viable && <span className="viable"> · Maybe viable</span>}
            </>
          ) : (
            "not answered"
          )
        }
      >
        <ol className="checklist">
          {QUESTIONS.map(q => (
            <li key={q.id}>
              <span>{q.text}</span>
              <div className="segmented">
                {ANSWERS.map(a => (
                  <button
                    key={a.id}
                    aria-pressed={answers[q.id] === a.id}
                    onClick={() => patch(answerPatch(data, q.id, a.id))}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <p className="muted small">
          Score = number of “yes”. Tap a chosen answer again to clear it.
          {s.viable && " All yes: maybe viable. Test the riskiest assumption next."}
        </p>
      </Fold>

      <Fold title="Riskiest assumptions" meta={list.length ? `${tested}/${list.length} tested` : "none yet"}>
        <Assumptions list={list} patch={patch} />
      </Fold>
    </>
  );
}

function Assumptions({ list, patch }: { list: Assumption[]; patch(p: Data): void }) {
  const { toast } = useApp();
  const [added, setAdded] = useState(-1);
  const save = (next: Assumption[]) => patch(assumptionsPatch(next));
  const set = (i: number, p: Partial<Assumption>) => save(list.map((a, j) => (j === i ? { ...a, ...p } : a)));

  const remove = (i: number) => {
    const old = list;
    save(list.filter((_, j) => j !== i));
    if (old[i].text || old[i].test || old[i].notes) {
      toast({ text: "Assumption removed", action: { label: "Undo", run: () => save(old) } });
    }
  };

  return (
    <>
      {list.length === 0 && (
        <p className="muted small">
          What must be true for this idea to work? Write the riskiest first, with a small, cheap way
          to test it.
        </p>
      )}
      {list.map((a, i) => (
        <div key={i} className={`assumption r-${a.result}`}>
          <div className="row">
            <input
              className="field grow"
              value={a.text}
              placeholder="e.g. People will pay for it"
              aria-label="Assumption"
              autoFocus={i === added}
              onChange={e => set(i, { text: e.target.value })}
            />
            <button className="btn ghost icon" aria-label="Remove assumption" title="Remove" onClick={() => remove(i)}>
              <X size={16} />
            </button>
          </div>
          <input
            className="field"
            value={a.test}
            placeholder="How to test: e.g. ask 5 friends to pre-order"
            aria-label="How to test"
            onChange={e => set(i, { test: e.target.value })}
          />
          <div className="segmented">
            {RESULTS.map(r => (
              <button key={r.id} aria-pressed={a.result === r.id} onClick={() => set(i, { result: r.id })}>
                {r.label}
              </button>
            ))}
          </div>
          <input
            className="field"
            value={a.notes}
            placeholder="Notes: what happened"
            aria-label="Notes"
            onChange={e => set(i, { notes: e.target.value })}
          />
        </div>
      ))}
      <div className="row">
        <button
          className="btn ghost"
          onClick={() => {
            setAdded(list.length);
            save([...list, { text: "", test: "", result: "untested", notes: "" }]);
          }}
        >
          <Plus size={16} /> Assumption
        </button>
      </div>
    </>
  );
}

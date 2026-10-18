import { useEffect, useRef, useState } from "react";
import { FolderOpen, Sparkles } from "lucide-react";
import type { NewCard, Subject } from "../../data/study";
import { useApp } from "../context";
import { Dialog } from "../Dialog";
import { lang, t } from "../../i18n";

// Flashcards drafted by the local AI (PC): pick a material and a chapter, the model writes
// cards, the user ticks and edits the good ones, and only those are saved (in the subject's
// "Flashcards: <material>" note, which travels to the phone with the USB sync).

type Draft = NewCard & { keep: boolean };
const WHOLE = -1;

export function AiCards(props: { subject: Subject; onSave(cards: NewCard[], from: { material: string; title: string }): void; onClose(): void }) {
  const { notes, platform } = useApp();
  const ai = platform.ai!;
  const mats = props.subject.materials.filter(m => m.chapters.length);
  const [model, setModel] = useState<{ model: string | null; exists: boolean } | null>(null);
  const [mat, setMat] = useState(mats[0]?.path ?? "");
  const m = mats.find(x => x.path === mat);
  const [chapter, setChapter] = useState<number>(m?.at ?? m?.chapters[0]?.n ?? WHOLE);
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState<{ start: number; done: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    void ai.get().then(setModel);
    const off = ai.onProgress(p => setBusy(b => b && { ...b, ...p }));
    return () => {
      alive.current = false;
      off();
      void ai.cancel();
    };
  }, [ai]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const choose = async () => {
    const p = await ai.chooseModel();
    if (p) setModel(await ai.get());
  };

  const generate = async () => {
    if (!m) return;
    setError("");
    setDrafts(null);
    setBusy({ start: Date.now(), done: 0, total: 1 });
    try {
      const body = (await notes.load(m.path)).body;
      const ch = chapter === WHOLE ? null : m.chapters.find(c => c.n === chapter);
      const text = ch ? body.slice(ch.from, ch.to) : body;
      const cards = await ai.cards({ text, count, lang: lang === "pt-BR" ? "pt" : "en" });
      if (!alive.current) return;
      setDrafts(cards.map(c => ({ ...c, keep: true })));
      if (!cards.length) setError(t.ai.nothing);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (alive.current) setError(msg.includes("no-model") ? t.ai.noModel : msg.includes("busy") ? t.ai.busy : msg);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const save = () => {
    if (!m || !drafts) return;
    props.onSave(
      drafts.filter(d => d.keep && d.front.trim() && d.back.trim()),
      { material: m.name, title: m.title },
    );
  };
  const kept = drafts?.filter(d => d.keep).length ?? 0;
  const edit = (i: number, patch: Partial<Draft>) => setDrafts(drafts!.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <Dialog title={t.ai.title} onClose={props.onClose}>
      {model && !model.exists ? (
        <>
          <p style={{ margin: 0 }}>{model.model ? t.ai.modelMissing(model.model) : t.ai.needModel}</p>
          <p className="muted small" style={{ margin: 0 }}>
            {t.ai.modelHint}
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={props.onClose}>
              {t.common.cancel}
            </button>
            <button className="btn primary" onClick={choose}>
              <FolderOpen size={16} /> {t.ai.chooseModel}
            </button>
          </div>
        </>
      ) : mats.length === 0 ? (
        <>
          <p className="muted">{t.ai.noMaterials}</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={props.onClose}>
              {t.common.close}
            </button>
          </div>
        </>
      ) : (
        <>
          {!drafts && (
            <>
              <select
                className="field"
                value={mat}
                aria-label={t.ai.material}
                disabled={!!busy}
                onChange={e => {
                  setMat(e.target.value);
                  const nm = mats.find(x => x.path === e.target.value);
                  setChapter(nm?.at ?? nm?.chapters[0]?.n ?? WHOLE);
                }}
              >
                {mats.map(x => (
                  <option key={x.path} value={x.path}>
                    {x.title}
                  </option>
                ))}
              </select>
              <select className="field" value={chapter} aria-label={t.ai.chapter} disabled={!!busy} onChange={e => setChapter(Number(e.target.value))}>
                {m?.chapters.map(c => (
                  <option key={c.n} value={c.n}>
                    {c.title || t.study.chapter(c.n)}
                    {m.done.includes(c.n) ? " ✓" : ""}
                  </option>
                ))}
                <option value={WHOLE}>{t.ai.whole}</option>
              </select>
              <label className="row" style={{ gap: 8 }}>
                <span>{t.ai.howMany}</span>
                <select className="field" style={{ width: 90 }} value={count} disabled={!!busy} onChange={e => setCount(Number(e.target.value))}>
                  {[5, 8, 12, 20].map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small" style={{ margin: 0 }}>
                {chapter === WHOLE ? t.ai.wholeSlow : t.ai.time}
              </p>
            </>
          )}

          {busy && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="ai-progress">
                <span style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} />
              </div>
              <span className="muted small">{t.ai.working(Math.round((now - busy.start) / 1000), busy.done, busy.total)}</span>
            </div>
          )}
          {error && <p className="err small" style={{ margin: 0 }}>{error}</p>}

          {drafts && drafts.length > 0 && (
            <>
              <p className="muted small" style={{ margin: 0 }}>
                {t.ai.review}
              </p>
              <ol className="ai-drafts">
                {drafts.map((d, i) => (
                  <li key={i} className={d.keep ? "" : "off"}>
                    <label className="row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={d.keep} onChange={e => edit(i, { keep: e.target.checked })} />
                      <span className="muted small">{t.ai.keep}</span>
                    </label>
                    <textarea className="field" rows={2} value={d.front} aria-label={t.study.cardFront} onChange={e => edit(i, { front: e.target.value })} />
                    <textarea className="field" rows={2} value={d.back} aria-label={t.study.cardBack} onChange={e => edit(i, { back: e.target.value })} />
                  </li>
                ))}
              </ol>
            </>
          )}

          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn" onClick={busy ? () => void ai.cancel() : props.onClose}>
              {busy ? t.ai.stop : t.common.cancel}
            </button>
            {drafts ? (
              <>
                <button className="btn" onClick={() => setDrafts(null)}>
                  {t.ai.again}
                </button>
                <button className="btn primary" disabled={!kept} onClick={save}>
                  {t.ai.save(kept)}
                </button>
              </>
            ) : (
              <button className="btn primary" disabled={!!busy || !m || !model} onClick={generate}>
                <Sparkles size={16} /> {t.ai.generate}
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

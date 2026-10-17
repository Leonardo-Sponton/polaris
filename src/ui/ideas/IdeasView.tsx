import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { STATUSES, TEMPLATES, createIdea, loadIdeas, markSeen, type Idea, type Template } from "../../data/ideas";
import { AskText } from "../Dialog";
import { useApp } from "../context";
import { IdeaEditor } from "./IdeaEditor";

// Ideas (SPEC 5.4): the list grouped by status, filtered by template or tag, and the idea screen
// on the right (one at a time on the phone).

/** Ideas, reloaded whenever data on disk changes. */
export function useIdeas(): Idea[] {
  const { notes, version, toast } = useApp();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  useEffect(() => {
    let alive = true;
    loadIdeas(notes, p => toast({ text: `Could not read ${p}`, error: true })).then(list => alive && setIdeas(list));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);
  return ideas;
}

type Filter = { template?: Template; tag?: string };

export function IdeasView({ ideas, openPath }: { ideas: Idea[]; openPath?: { path: string; key: number } }) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [filter, setFilter] = useState<Filter>({});
  const [showArchived, setShowArchived] = useState(false);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  const openIdea = useCallback(
    async (path: string) => {
      try {
        // The Today card must stop showing it.
        if (await markSeen(notes, path)) bump();
      } catch {
        /* only the resurface date: opening matters more */
      }
      setOpen(path);
    },
    [notes, bump],
  );

  useEffect(() => {
    if (openPath) openIdea(openPath.path);
  }, [openPath, openIdea]);

  // Ctrl+N: new idea (SPEC 4.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setAsking(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const create = async (title: string) => {
    setAsking(false);
    try {
      const n = await createIdea(notes, title, filter.template ?? "blank");
      bump();
      setOpen(n.path);
    } catch (e) {
      fail(e);
    }
  };

  const tags = [...new Set(ideas.flatMap(i => i.tags))].sort();
  const usedTemplates = TEMPLATES.filter(t => ideas.some(i => i.template === t.id));
  const shown = ideas.filter(
    i => (!filter.template || i.template === filter.template) && (!filter.tag || i.tags.includes(filter.tag)),
  );
  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} className={`chip${active ? " active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>Ideas</h1>
          <button className="btn primary" onClick={() => setAsking(true)}>
            <Plus size={18} /> New
          </button>
        </div>
        {(usedTemplates.length > 1 || tags.length > 0) && (
          <div className="chips" aria-label="Filter">
            {chip("All", !filter.template && !filter.tag, () => setFilter({}))}
            {usedTemplates.map(t =>
              chip(t.label, filter.template === t.id, () =>
                setFilter(f => ({ ...f, template: f.template === t.id ? undefined : t.id })),
              ),
            )}
            {tags.map(t =>
              chip(`#${t}`, filter.tag === t, () => setFilter(f => ({ ...f, tag: f.tag === t ? undefined : t }))),
            )}
          </div>
        )}
        {ideas.length === 0 ? (
          <p className="muted empty-note">
            No ideas yet. Press New, or turn an inbox item into an idea. A title is enough to start.
          </p>
        ) : shown.length === 0 ? (
          <p className="muted empty-note">No ideas match this filter.</p>
        ) : (
          STATUSES.map(s => {
            const group = shown.filter(i => i.status === s.id);
            if (!group.length) return null;
            const folded = s.id === "archived" && !showArchived;
            return (
              <section key={s.id} className="task-section">
                {s.id === "archived" ? (
                  <button className="section-head fold" onClick={() => setShowArchived(v => !v)}>
                    {folded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {s.label} <span className="mono muted">{group.length}</span>
                  </button>
                ) : (
                  <div className="section-head">
                    {s.label} <span className="mono muted">{group.length}</span>
                  </div>
                )}
                {!folded && (
                  <ul className="list">
                    {group.map(i => (
                      <li key={i.path}>
                        <button
                          className={`list-item${open === i.path ? " active" : ""}`}
                          onClick={() => openIdea(i.path)}
                        >
                          <span className="list-title">{i.title || <span className="muted">(untitled)</span>}</span>
                          <span className="list-meta mono">
                            {[
                              i.template !== "blank" && TEMPLATES.find(t => t.id === i.template)!.label,
                              ...i.tags.map(t => `#${t}`),
                              i.modified.slice(0, 10),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {i.status === "archived" && i.archivedReason && (
                            <span className="list-meta">{i.archivedReason}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
      <div className="detail-pane">
        {open ? (
          <IdeaEditor key={open} path={open} onBack={() => setOpen(null)} onGone={() => setOpen(null)} />
        ) : (
          <div className="detail-empty muted">Pick an idea or press New.</div>
        )}
      </div>
      {asking && (
        <AskText
          title="New idea"
          placeholder="A title is enough"
          okLabel="Create"
          onClose={() => setAsking(false)}
          onOk={create}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  STATUSES,
  TEMPLATES,
  archivePatch,
  createIdea,
  loadIdeas,
  markSeen,
  reopenPatch,
  updateIdea,
  type Idea,
  type Template,
} from "../../data/ideas";
import type { Data } from "../../data/frontmatter";
import { flushAll } from "../../data/pending";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { AskText } from "../Dialog";
import { useApp } from "../context";
import { useHold } from "../useHold";
import { IdeaEditor } from "./IdeaEditor";
import { IdeaMenu } from "./IdeaMenu";

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

function IdeaRow({ idea: i, active, onOpen, onMenu }: { idea: Idea; active: boolean; onOpen(): void; onMenu(): void }) {
  const hold = useHold(onMenu);
  return (
    <li className="idea-li" {...hold.handlers}>
      <button className={`list-item${active ? " active" : ""}`} onClick={() => !hold.eaten() && onOpen()}>
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
        {i.status === "archived" && i.archivedReason && <span className="list-meta">{i.archivedReason}</span>}
      </button>
    </li>
  );
}

export function IdeasView({ ideas, openPath }: { ideas: Idea[]; openPath?: { path: string; key: number } }) {
  const { notes, bump, toast } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [filter, setFilter] = useState<Filter>({});
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<Idea | null>(null);
  const [archiving, setArchiving] = useState<Idea | null>(null);

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

  // Header changes from the hold menu, with Undo.
  const change = async (i: Idea, patch: Data, text: string) => {
    try {
      await flushAll(); // an open idea screen writes its last edits first
      const old = await updateIdea(notes, i.path, patch);
      bump();
      toast({ text, action: { label: "Undo", run: () => updateIdea(notes, i.path, old).then(bump, fail) } });
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (i: Idea) => {
    try {
      await flushAll();
      if (open === i.path) setOpen(null);
      const trashed = await moveToTrash(notes.storage, i.path);
      bump();
      toast({
        text: "Idea deleted",
        action: { label: "Undo", run: () => restoreFromTrash(notes.storage, trashed, i.path).then(bump, fail) },
      });
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
                      <IdeaRow
                        key={i.path}
                        idea={i}
                        active={open === i.path}
                        onOpen={() => openIdea(i.path)}
                        onMenu={() => setMenu(i)}
                      />
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
      {menu && (
        <IdeaMenu
          idea={menu}
          onClose={() => setMenu(null)}
          onOpen={() => openIdea(menu.path)}
          onStatus={st => change(menu, { status: st }, st === "draft" ? "Back to Draft" : "Moved to Maturing")}
          onTemplate={t => change(menu, { template: t }, `Template: ${TEMPLATES.find(x => x.id === t)!.label}`)}
          onArchive={() => setArchiving(menu)}
          onReopen={() => change(menu, reopenPatch(), "Reopened · Maturing")}
          onDelete={() => remove(menu)}
        />
      )}
      {archiving && (
        <AskText
          title="Why didn't it work?"
          placeholder="e.g. Too expensive to build alone"
          okLabel="Archive"
          onClose={() => setArchiving(null)}
          onOk={reason => {
            setArchiving(null);
            change(archiving, archivePatch(reason), "Archived");
          }}
        />
      )}
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

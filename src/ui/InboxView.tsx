import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { titleOf } from "../data/frontmatter";
import { stamp } from "../data/dates";
import type { Note } from "../data/notes";
import { NoteEditor } from "./NoteEditor";
import { useApp } from "./context";

// Inbox, first version: a list of items and the editor. Quick capture and the
// "→ To-do / → Idea" actions arrive in stage 1d (SPEC 5.2).

/** What a list row shows: the title, or else the first line without Markdown symbols. */
export function previewOf(body: string): string {
  const t = titleOf(body);
  if (t) return t;
  const first = body.split("\n").find(l => l.trim()) ?? "";
  return first.replace(/^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, "").trim();
}

export function InboxView() {
  const { notes, version, bump, toast } = useApp();
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState<{ path: string; isNew: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    notes
      .loadDir("inbox", p => toast({ text: `Could not read ${p}`, error: true }))
      .then(list => alive && setItems(list.sort((a, b) => b.path.localeCompare(a.path))));
    return () => {
      alive = false;
    };
  }, [notes, version, toast]);

  const create = async () => {
    try {
      const path = await notes.freePath("inbox", stamp());
      await notes.create(path, { type: "inbox" }, "");
      setOpen({ path, isNew: true });
      bump();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <div className={`split${open ? " has-detail" : ""}`}>
      <div className="list-pane">
        <div className="list-head">
          <h1>Inbox</h1>
          <button className="btn primary" onClick={create}>
            <Plus size={18} /> New
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted">Nothing here. Press New to write something down.</p>
        ) : (
          <ul className="list">
            {items.map(n => (
              <li key={n.path}>
                <button
                  className={`list-item${open?.path === n.path ? " active" : ""}`}
                  onClick={() => setOpen({ path: n.path, isNew: false })}
                >
                  <span className="list-title">{previewOf(n.body) || <span className="muted">(empty)</span>}</span>
                  <span className="list-meta mono">{String(n.data.created ?? "").replace("T", " ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="detail-pane">
        {open ? (
          <NoteEditor
            key={open.path}
            path={open.path}
            placeholder="Write anything… (start the first line with # for a title)"
            onBack={() => setOpen(null)}
            removeIfEmpty
            autoFocus={open.isNew}
          />
        ) : (
          <div className="detail-empty muted">Pick an item or press New.</div>
        )}
      </div>
    </div>
  );
}

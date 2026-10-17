import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { BOOK_FILE } from "../data/books";
import { areaOf } from "../data/files";
import { parse, previewOf } from "../data/frontmatter";
import { deleteForever, emptyTrash, listTrash, restore, type Trashed } from "../data/trash";
import { Confirm, Dialog } from "./Dialog";
import { useApp } from "./context";
import { areaLabel } from "./SearchView";

// Trash (SPEC 4.4): deleted files wait here until restored or deleted for good.

interface Row extends Trashed {
  title: string;
}

export function TrashView() {
  const { notes, version, bump, toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [menu, setMenu] = useState<Row | null>(null);
  const [ask, setAsk] = useState<{ title: string; text: string; ok: string; run(): Promise<void> } | null>(null);

  const fail = useCallback(
    (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true }),
    [toast],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Row[] = [];
      for (const t of await listTrash(notes.storage)) {
        let title = t.from.slice(t.from.lastIndexOf("/") + 1);
        try {
          if (t.path.endsWith(".md")) title = previewOf(parse(await notes.storage.read(t.path)).body) || "(empty)";
          // A book folder: its title is in the header of book.md.
          else if ((await notes.storage.stat(t.path))?.isDir) {
            title = String(parse(await notes.storage.read(`${t.path}/${BOOK_FILE}`)).data.title ?? "") || title;
          }
        } catch {
          /* keep the file name */
        }
        out.push({ ...t, title });
      }
      if (alive) setRows(out);
    })().catch(fail);
    return () => {
      alive = false;
    };
  }, [notes, version, fail]);

  const put = async (r: Row) => {
    try {
      const to = await restore(notes.storage, r);
      bump();
      toast({ text: to === r.from ? `Restored to ${areaLabel(areaOf(to))}` : `Restored as ${to}` });
    } catch (e) {
      fail(e);
    }
  };

  const confirmForever = (r: Row) =>
    setAsk({
      title: "Delete forever?",
      text: `“${r.title}” will be erased. This cannot be undone.`,
      ok: "Delete forever",
      run: () => deleteForever(notes.storage, r),
    });

  const confirmEmpty = () =>
    setAsk({
      title: "Empty the trash?",
      text: `All ${rows!.length} items will be erased. This cannot be undone.`,
      ok: "Empty trash",
      run: () => emptyTrash(notes.storage),
    });

  const item = (label: string, icon: React.ReactNode, run: () => void, cls = "") => (
    <button
      className={`menu-item${cls}`}
      onClick={() => {
        setMenu(null);
        run();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="page">
      <div className="page-inner">
        <div className="list-head" style={{ padding: "0 0 12px" }}>
          <h1>Trash</h1>
          {!!rows?.length && (
            <button className="btn" onClick={confirmEmpty}>
              <Trash2 size={18} /> Empty
            </button>
          )}
        </div>
        {rows && rows.length === 0 && <p className="muted">The trash is empty. Deleted items wait here.</p>}
        {!!rows?.length && (
          <ul className="list">
            {rows.map(r => (
              <li key={r.path} className="trash-li">
                <button className="list-item" onClick={() => setMenu(r)}>
                  <span className="list-title">{r.title}</span>
                  <span className="list-meta mono">
                    {areaLabel(areaOf(r.from))}
                    {r.at && ` · deleted ${r.at.replace("T", " ")}`}
                  </span>
                </button>
                <button className="btn ghost icon" title="Restore" aria-label="Restore" onClick={() => put(r)}>
                  <RotateCcw size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {menu && (
        <Dialog title={menu.title} onClose={() => setMenu(null)}>
          <div className="stack" style={{ gap: 2 }}>
            {item("Restore", <RotateCcw size={18} />, () => put(menu))}
            {item("Delete forever", <X size={18} />, () => confirmForever(menu), " danger")}
          </div>
        </Dialog>
      )}
      {ask && (
        <Confirm
          title={ask.title}
          text={ask.text}
          okLabel={ask.ok}
          onClose={() => setAsk(null)}
          onOk={() => {
            setAsk(null);
            ask.run().then(bump, fail);
          }}
        />
      )}
    </div>
  );
}

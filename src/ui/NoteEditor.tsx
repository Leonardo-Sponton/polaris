import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Editor } from "../editor/Editor";
import { ConflictError, type Note } from "../data/notes";
import { onFlush } from "../data/pending";
import { useApp } from "./context";

// Opens one file in the editor and keeps it saved (SPEC 2.4):
// autosave 1 s after typing stops, on leaving and when the app closes or goes to the background;
// every save is read back; outside changes are reloaded, or asked about when there are unsaved edits.
// Render it with key={path}: one instance per file.

type Status = "saved" | "unsaved" | "saving" | "error";

const STATUS_TEXT: Record<Status, string> = {
  saved: "Saved",
  unsaved: "Editing…",
  saving: "Saving…",
  error: "Not saved!",
};

interface Props {
  path: string;
  placeholder?: string;
  /** Shows a back arrow (phone layout). */
  onBack?(): void;
  /** Deletes the file when it is left empty (new items the user did not write in). */
  removeIfEmpty?: boolean;
  autoFocus?: boolean;
}

export function NoteEditor({ path, placeholder, onBack, removeIfEmpty, autoFocus }: Props) {
  const { notes, toast, version, bump } = useApp();
  const [note, setNote] = useState<Note | null>(null);
  const [rev, setRev] = useState(0);
  const [status, setStatus] = useState<Status>("saved");
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  const [gone, setGone] = useState<string | null>(null);

  const noteRef = useRef<Note | null>(null); // last version read or written by us
  const body = useRef(""); // text in the editor now
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve()); // disk work runs one step at a time
  const blocked = useRef(false); // a conflict is open: no autosave until the user picks

  const show = useCallback((n: Note) => {
    noteRef.current = n;
    body.current = n.body;
    setNote(n);
    setRev(r => r + 1);
    setStatus("saved");
  }, []);

  const enqueue = (job: () => Promise<void>) => (queue.current = queue.current.then(job, job));

  const save = useCallback(
    (force = false) => {
      clearTimeout(timer.current);
      return enqueue(async () => {
        const n = noteRef.current;
        if (!n || (blocked.current && !force) || (!force && n.body === body.current)) return;
        setStatus("saving");
        try {
          const saved = await notes.save(n, n.data, body.current, { force });
          noteRef.current = saved;
          setStatus(saved.body === body.current ? "saved" : "unsaved");
          bump();
        } catch (e) {
          if (e instanceof ConflictError) {
            blocked.current = true;
            setConflict(e);
            setStatus("unsaved");
          } else {
            setStatus("error");
            toast({ text: e instanceof Error ? e.message : String(e), error: true });
          }
        }
      });
    },
    [notes, bump, toast],
  );

  // Load; on leaving, write what is pending and drop the file if it was left empty.
  useEffect(() => {
    let alive = true;
    notes.load(path).then(
      n => alive && show(n),
      e => alive && setGone(e instanceof Error ? e.message : String(e)),
    );
    const stop = onFlush(() => save());
    return () => {
      alive = false;
      stop();
      save().then(async () => {
        if (removeIfEmpty && !blocked.current && noteRef.current && body.current.trim() === "") {
          await notes.storage.remove(path);
          bump();
        }
      });
    };
    // One instance per path (key={path}); the callbacks are stable.
  }, []);

  // Something changed on disk: reload this file if it was changed outside and we have no edits.
  useEffect(() => {
    if (!noteRef.current) return;
    enqueue(async () => {
      const n = noteRef.current;
      if (!n || blocked.current) return;
      let disk: string | null = null;
      try {
        disk = await notes.storage.read(path);
      } catch {
        disk = null;
      }
      if (disk === n.text) return;
      if (body.current !== n.body) return; // unsaved edits: the next save raises the conflict
      if (disk === null) setGone("This note was deleted or moved outside the app.");
      else show(await notes.load(path));
    });
  }, [version]);

  const onChange = (text: string) => {
    body.current = text;
    setStatus("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), 1000);
  };

  const resolve = (choice: "mine" | "file" | "both") => {
    const c = conflict!;
    setConflict(null);
    blocked.current = false;
    if (choice === "mine") {
      // Compare against what is on disk now, so the forced save always writes.
      noteRef.current = { ...noteRef.current!, text: c.diskText ?? "" };
      save(true);
      return;
    }
    enqueue(async () => {
      try {
        if (choice === "both") {
          const n = noteRef.current!;
          const copy = await notes.saveCopy(n, n.data, body.current);
          toast({ text: `Your version was saved as ${copy.path.split("/").pop()}` });
        }
        if (c.diskText === null) {
          setGone("This note was deleted or moved outside the app.");
          return;
        }
        show(await notes.load(path));
        bump();
      } catch (e) {
        toast({ text: e instanceof Error ? e.message : String(e), error: true });
      }
    });
  };

  return (
    <div className="note-editor">
      <div className="note-bar">
        {onBack && (
          <button className="btn ghost icon" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
        )}
        <span className={`note-status mono${status === "error" ? " err" : ""}`} aria-live="polite">
          {note ? STATUS_TEXT[status] : ""}
        </span>
      </div>
      {gone ? (
        <div className="page">
          <div className="page-inner">
            <p className="err">{gone}</p>
          </div>
        </div>
      ) : (
        note && (
          <Editor
            key={rev}
            text={note.body}
            onChange={onChange}
            onSaveNow={() => save()}
            placeholder={placeholder}
            autoFocus={autoFocus && rev === 1}
          />
        )
      )}
      {conflict && (
        <div className="dialog-backdrop">
          <div className="card stack dialog" role="alertdialog" aria-labelledby="conflict-title">
            <h2 id="conflict-title">This note changed outside the app</h2>
            <p className="muted" style={{ margin: 0 }}>
              {conflict.diskText === null
                ? "The file was deleted or moved while you were editing it."
                : "Another program or a sync changed the file while you were editing it."}{" "}
              Which version do you want to keep?
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => resolve("mine")}>
                Keep mine
              </button>
              <button className="btn" onClick={() => resolve("file")}>
                {conflict.diskText === null ? "Discard mine" : "Keep the file's"}
              </button>
              {conflict.diskText !== null && (
                <button className="btn" onClick={() => resolve("both")}>
                  Keep both
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

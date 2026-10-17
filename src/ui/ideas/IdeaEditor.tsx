import { useRef, useState } from "react";
import { t } from "../../i18n";
import { Archive, ArrowLeft, FolderKanban, FolderPlus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Editor } from "../../editor/Editor";
import type { Data } from "../../data/frontmatter";
import {
  TEMPLATES,
  addSection,
  archivePatch,
  missingSections,
  parseTags,
  reopenPatch,
  toIdea,
  type Template,
} from "../../data/ideas";
import type { Note } from "../../data/notes";
import { PROJECT_FILE, createProject, flowForTemplate } from "../../data/projects";
import { NewProject } from "../projects/NewProject";
import { joinTitle, splitTitle } from "../../data/todo";
import { moveToTrash, restoreFromTrash } from "../../data/trash";
import { AskText } from "../Dialog";
import { useApp } from "../context";
import { useFiveW2H } from "../FiveW2H";
import { useBack } from "../useBack";
import { useNoteFile, type NoteFile } from "../useNoteFile";
import { Viability } from "./Viability";

// The idea screen (SPEC 5.4): title, status, template, tags, then the free draft with the
// template's optional sections. Everything is saved as you go.

interface Props {
  path: string;
  onBack(): void;
  /** The idea left this screen (deleted). */
  onGone(): void;
  onOpenProject(path: string): void;
}

export function IdeaEditor({ path, onBack, onGone, onOpenProject }: Props) {
  const { notes, bump, toast } = useApp();
  const f = useNoteFile(path);
  useBack(true, onBack);
  const fail = (e: unknown) => toast({ text: e instanceof Error ? e.message : String(e), error: true });

  const remove = async () => {
    try {
      await f.saveNow();
      const trashed = await moveToTrash(notes.storage, path);
      onGone();
      bump();
      toast({
        text: t.ideas.deleted,
        action: { label: t.common.undo, run: () => restoreFromTrash(notes.storage, trashed, path).then(bump, fail) },
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className={`note-status mono${f.status === "error" ? " err" : ""}`} aria-live="polite">
          {f.note ? t.note.status[f.status] : ""}
        </span>
        {f.note && (
          <button className="btn ghost icon" aria-label={t.ideas.deleteIdea} title={t.common.delete} onClick={remove}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
      {f.gone ? (
        <div className="page">
          <div className="page-inner">
            <p className="err">{f.gone}</p>
          </div>
        </div>
      ) : (
        f.note && <IdeaForm key={f.rev} file={f} note={f.note} onOpenProject={onOpenProject} />
      )}
      {f.dialog}
    </div>
  );
}

function IdeaForm({ file: f, note, onOpenProject }: { file: NoteFile; note: Note; onOpenProject(path: string): void }) {
  const { notes, bump, toast } = useApp();
  const [making, setMaking] = useState(false);
  const split = splitTitle(note.body);
  const [title, setTitle] = useState(split.title);
  const [d, setD] = useState<Data>(note.data);
  const [restRev, setRestRev] = useState(0);
  const [tagText, setTagText] = useState(toIdea(note).tags.join(", "));
  const [archiving, setArchiving] = useState(false);
  const titleRef = useRef(split.title);
  const writeBody = () => f.setBody(joinTitle(titleRef.current, w.body()));
  const w = useFiveW2H(split.rest, writeBody);
  const [rest, setRest] = useState(w.initialText);

  const idea = toIdea({ ...note, data: d });
  const missing = missingSections(idea.template, rest);

  const patch = (p: Data) => {
    setD(old => ({ ...old, ...p }));
    f.setData(p);
  };

  const add = (name: string) => {
    const next = addSection(w.text(), name);
    w.setText(next);
    setRest(next);
    setRestRev(r => r + 1);
    writeBody();
  };

  const commitTags = () => {
    const tags = parseTags(tagText);
    setTagText(tags.join(", "));
    if (tags.join() !== idea.tags.join()) patch({ tags: tags.length ? tags : undefined });
  };

  const active = idea.status === "draft" || idea.status === "maturing";

  return (
    <div className="page task-page">
      <div className="page-inner stack">
        <textarea
          className="task-title-input"
          rows={1}
          value={title}
          placeholder={t.ideas.ideaTitle}
          aria-label={t.todo.title}
          onChange={e => {
            const v = e.target.value.replace(/\n/g, " ");
            setTitle(v);
            titleRef.current = v;
            writeBody();
          }}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
        />

        {idea.status === "archived" && (
          <div className="idea-archived">
            <span className="fl">{t.ideas.archivedBecause}</span>
            <p>{idea.archivedReason || <span className="muted">{t.ideas.noReason}</span>}</p>
          </div>
        )}

        <div className="task-fields">
          <span className="fl">{t.ideas.fStatus}</span>
          {active ? (
            <div className="segmented">
              <button aria-pressed={idea.status === "draft"} onClick={() => patch({ status: "draft" })}>
                {t.ideas.status.draft}
              </button>
              <button aria-pressed={idea.status === "maturing"} onClick={() => patch({ status: "maturing" })}>
                {t.ideas.status.maturing}
              </button>
            </div>
          ) : (
            <span>{idea.status === "archived" ? t.ideas.archived : t.ideas.becameProject}</span>
          )}

          <span className="fl">{t.ideas.fTemplate}</span>
          <select
            className="field"
            value={idea.template}
            onChange={e => patch({ template: e.target.value as Template })}
          >
            {TEMPLATES.map(x => (
              <option key={x.id} value={x.id}>
                {t.ideas.templates[x.id]}
              </option>
            ))}
          </select>

          <span className="fl">{t.ideas.fTags}</span>
          <input
            className="field"
            value={tagText}
            placeholder={t.ideas.tagsEg}
            onChange={e => setTagText(e.target.value)}
            onBlur={commitTags}
            onKeyDown={e => e.key === "Enter" && (e.target as HTMLElement).blur()}
          />
        </div>

        <div className="task-notes-head">
          <span className="fl">{t.ideas.draft}</span>
        </div>
        <div className="task-notes">
          <Editor
            key={restRev}
            text={rest}
            autoFocus={restRev > 0}
            placeholder={t.ideas.draftPlaceholder}
            onSaveNow={f.saveNow}
            commands={{ "5w2h": w.insert }}
            onChange={text => {
              w.setText(text);
              setRest(text);
              writeBody();
            }}
          />
        </div>
        {(missing.length > 0 || !w.has) && (
          <div className="row idea-sections" aria-label={t.ideas.addSection}>
            {missing.map(s => (
              <button key={s} className="btn ghost" onClick={() => add(s)}>
                <Plus size={16} /> {s}
              </button>
            ))}
            {!w.has && (
              <button className="btn ghost" onClick={w.insert}>
                <Plus size={16} /> 5W2H
              </button>
            )}
          </div>
        )}
        {w.form}

        <Viability data={d} patch={patch} />

        <div className="row task-actions">
          {active ? (
            <>
              <button className="btn" onClick={() => setMaking(true)}>
                <FolderPlus size={18} /> {t.ideas.makeProject}
              </button>
              <button className="btn" onClick={() => setArchiving(true)}>
                <Archive size={18} /> {t.ideas.archive}
              </button>
            </>
          ) : idea.status === "archived" ? (
            <button className="btn" onClick={() => patch(reopenPatch())}>
              <RotateCcw size={18} /> {t.todo.reopen}
            </button>
          ) : (
            idea.project && (
              <button className="btn" onClick={() => onOpenProject(`projects/${idea.project}/${PROJECT_FILE}`)}>
                <FolderKanban size={18} /> {t.ideas.openProject}
              </button>
            )
          )}
          <span className="muted small mono">{t.todo.created(String(d.created ?? "").replace("T", " "))}</span>
        </div>
      </div>

      {making && (
        <NewProject
          title={t.ideas.makeProject}
          initialName={title}
          initialFlow={flowForTemplate(idea.template)}
          okLabel={t.ideas.makeProjectOk}
          onClose={() => setMaking(false)}
          onOk={async (name, flow) => {
            setMaking(false);
            try {
              await f.saveNow();
              const n = await createProject(notes, { title: name, flow, idea: note.path });
              bump();
              onOpenProject(n.path);
            } catch (e) {
              toast({ text: e instanceof Error ? e.message : String(e), error: true });
            }
          }}
        />
      )}
      {archiving && (
        <AskText
          title={t.ideas.whyTitle}
          placeholder={t.ideas.whyEg}
          okLabel={t.ideas.archive}
          onClose={() => setArchiving(false)}
          onOk={reason => {
            setArchiving(false);
            patch(archivePatch(reason));
          }}
        />
      )}
    </div>
  );
}

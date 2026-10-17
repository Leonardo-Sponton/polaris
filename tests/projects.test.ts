import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { FLOWS, flowOf } from "../src/data/flows";
import { createIdea, toIdea } from "../src/data/ideas";
import {
  createProject,
  createStepNote,
  extraSteps,
  loadProjects,
  loadStepNotes,
  missingStepSections,
  projectPathOf,
  stepIdOf,
} from "../src/data/projects";

describe("flows", () => {
  it("ships Business (6 steps from the Plano de Voo) and Software (8 steps)", () => {
    expect(FLOWS.map(f => [f.id, f.steps.length])).toEqual([
      ["business", 6],
      ["software", 8],
    ]);
    for (const f of FLOWS) {
      expect(new Set(f.steps.map(s => s.id)).size).toBe(f.steps.length);
      for (const s of f.steps) {
        expect(s.id).toMatch(/^\d\d-[a-z0-9-]+$/);
        expect(s.name && s.guidance).toBeTruthy();
      }
    }
    expect(flowOf("business").steps[0].id).toBe("00-integrating-environment");
    expect(flowOf("odd").id).toBe("software");
  });
});

describe("projects", () => {
  it("creates a folder on the first step and links the idea both ways", async () => {
    const notes = new Notes(new MemoryStorage());
    const idea = await createIdea(notes, "My app", "software", new Date(2026, 9, 17));
    const n = await createProject(notes, { title: "My app", flow: "software", idea: idea.path });
    expect(n.path).toBe("projects/my-app/project.md");
    expect(n.data).toMatchObject({ type: "project", status: "active", flow: "software", step: "01-discovery", idea: "20261017-my-app" });
    expect(n.body).toBe("# My app\n");
    const i = toIdea(await notes.load(idea.path));
    expect(i).toMatchObject({ status: "project", project: "my-app" });

    const [p] = await loadProjects(notes);
    expect(p).toMatchObject({ slug: "my-app", dir: "projects/my-app", title: "My app", idea: idea.path });
    expect(p.step.name).toBe("Discovery");
    const again = await createProject(notes, { title: "My app", flow: "business" });
    expect(again.path).toBe("projects/my-app-2/project.md");
    expect(again.data.idea).toBeUndefined();
  });

  it("reads hand-written headers safely", async () => {
    const s = new MemoryStorage();
    await s.write("projects/x/project.md", "---\ntype: project\nstatus: odd\nflow: business\nstep: 99-nope\nidea: ../etc\n---\n# X\n");
    await s.write("projects/empty/notes.txt", "no project.md");
    const [p] = await loadProjects(new Notes(s));
    expect(p).toMatchObject({ status: "active", title: "X", idea: undefined });
    expect(p.step.id).toBe("00-integrating-environment");
  });

  it("keeps step notes in step folders, in creation order", async () => {
    const s = new MemoryStorage();
    const notes = new Notes(s);
    const p = await createProject(notes, { title: "P", flow: "software" });
    const dir = "projects/p";
    const b = await createStepNote(notes, dir, "02-lean-canvas", "Canvas", new Date(2026, 9, 18, 9));
    const a = await createStepNote(notes, dir, "01-discovery", "Interviews", new Date(2026, 9, 17, 9));
    expect(a.path).toBe("projects/p/01-discovery/20261017-090000-interviews.md");
    expect(a.data.type).toBe("step-note");
    await s.write("projects/p/99-misc/x.md", "---\ntype: step-note\ncreated: 2026-01-01T00:00\n---\n# Old\n");
    const list = await loadStepNotes(notes, dir);
    // Same minute: by path, so by step and then by the time in the file name.
    expect(list.map(n => n.title)).toEqual(["Old", "Interviews", "Canvas"]);
    expect(list.find(n => n.title === "Interviews")!.step).toBe("01-discovery");
    expect(extraSteps(flowOf("software"), list)).toEqual(["99-misc"]);
    expect(projectPathOf(b.path)).toBe(p.path);
    expect(stepIdOf(b.path)).toBe("02-lean-canvas");
  });

  it("suggests the step's sections the note does not have yet", () => {
    const step = flowOf("software").steps[2];
    expect(missingStepSections(step.sections, "# R\n\n## must HAVE\n")).toEqual(["User stories", "Should have", "Could have", "Won't have"]);
    expect(missingStepSections([], "")).toEqual([]);
  });
});

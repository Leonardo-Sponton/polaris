import { parse } from "yaml";
import business from "./flows/business.yaml?raw";
import businessPt from "./flows/business.pt.yaml?raw";
import software from "./flows/software.yaml?raw";
import softwarePt from "./flows/software.pt.yaml?raw";
import startup from "./flows/startup.yaml?raw";
import startupPt from "./flows/startup.pt.yaml?raw";
import { lang, type Words } from "../i18n";

// Built-in project flows (SPEC 5.5), kept as YAML in data/flows/. Each step's id is also the name
// of the step's folder inside the project. Custom flows are not in this version (Q9).
// The words of each flow in Portuguese are in <flow>.pt.yaml, by step id; names, guidance and
// sections answer in the app's language when read.

export type FlowId = "business" | "startup" | "software";

export interface FlowStep {
  /** "02-lean-canvas": the step's folder name and the value of a project's `step`. */
  id: string;
  name: string;
  guidance: string;
  /** Suggested "##" sections for the step's notes. */
  sections: string[];
  /** The same sections in both languages, to find them in notes written in either. */
  sectionWords?: Words[];
}

export interface Flow {
  id: FlowId;
  name: string;
  steps: FlowStep[];
}

type Raw = { name?: unknown; guidance?: unknown; sections?: unknown };
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const pt = () => lang === "pt-BR";

function read(text: string, ptText: string): Flow {
  const f = parse(text);
  const p = parse(ptText) as { name?: unknown; steps?: (Raw & { id?: unknown })[] };
  const ptStep = new Map((p.steps ?? []).map(s => [String(s.id), s]));
  const flowName = { en: String(f.name), pt: String(p.name ?? f.name) };
  return {
    id: f.id,
    get name() {
      return pt() ? flowName.pt : flowName.en;
    },
    steps: (f.steps as (Raw & { id: unknown })[]).map(s => {
      const o = ptStep.get(String(s.id)) ?? {};
      const en = { name: String(s.name), guidance: String(s.guidance ?? "").trim(), sections: list(s.sections) };
      const ptw = {
        name: o.name ? String(o.name) : en.name,
        guidance: o.guidance ? String(o.guidance).trim() : en.guidance,
        sections: list(o.sections).length === en.sections.length ? list(o.sections) : en.sections,
      };
      return {
        id: String(s.id),
        get name() {
          return pt() ? ptw.name : en.name;
        },
        get guidance() {
          return pt() ? ptw.guidance : en.guidance;
        },
        get sections() {
          return pt() ? ptw.sections : en.sections;
        },
        sectionWords: en.sections.map((x, i) => ({ en: x, pt: ptw.sections[i] })),
      };
    }),
  };
}

export const FLOWS: Flow[] = [read(business, businessPt), read(startup, startupPt), read(software, softwarePt)];

export const flowOf = (id: unknown): Flow => FLOWS.find(f => f.id === id) ?? FLOWS[2];

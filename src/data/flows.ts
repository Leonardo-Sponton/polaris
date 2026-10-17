import { parse } from "yaml";
import business from "./flows/business.yaml?raw";
import software from "./flows/software.yaml?raw";

// Built-in project flows (SPEC 5.5), kept as YAML in data/flows/. Each step's id is also the name
// of the step's folder inside the project. Custom flows are not in this version (Q9).

export type FlowId = "business" | "software";

export interface FlowStep {
  /** "02-lean-canvas": the step's folder name and the value of a project's `step`. */
  id: string;
  name: string;
  guidance: string;
  /** Suggested "##" sections for the step's notes. */
  sections: string[];
}

export interface Flow {
  id: FlowId;
  name: string;
  steps: FlowStep[];
}

function read(text: string): Flow {
  const f = parse(text);
  return {
    id: f.id,
    name: String(f.name),
    steps: (f.steps as FlowStep[]).map(s => ({
      id: String(s.id),
      name: String(s.name),
      guidance: String(s.guidance ?? "").trim(),
      sections: Array.isArray(s.sections) ? s.sections.map(String) : [],
    })),
  };
}

export const FLOWS: Flow[] = [read(business), read(software)];

export const flowOf = (id: unknown): Flow => FLOWS.find(f => f.id === id) ?? FLOWS[1];

import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../src/i18n";
import { en } from "../src/i18n/en";
import { pt } from "../src/i18n/pt";
import { parseQuickAdd } from "../src/data/quickadd";
import { describeRule, parseRule } from "../src/data/recur";
import { dayLabel } from "../src/data/todo";

const SAT = new Date(2026, 9, 17); // Saturday 17 Oct 2026

afterEach(() => setLang("en"));

describe("dictionaries", () => {
  // The compiler checks the keys; this catches empty texts and lists of the wrong length.
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === "string") {
      expect(typeof b, path).toBe("string");
      if (a) expect(b, path).not.toBe("");
    } else if (Array.isArray(a)) {
      expect((b as unknown[]).length, path).toBe(a.length);
    } else if (a && typeof a === "object") {
      for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      expect(Object.keys(b as object).sort(), path).toEqual(Object.keys(a).sort());
    }
  };
  it("pt has every word en has", () => walk(en, pt, "t"));
});

describe("quick add in Portuguese", () => {
  const table: [string, object][] = [
    ["Comprar leite amanhã às 17h #casa !1", { title: "Comprar leite", when: "2026-10-18", time: "17:00", list: "casa", priority: 1 }],
    ["Ligar pra mãe na sexta", { title: "Ligar pra mãe", when: "2026-10-23" }],
    ["Dentista próxima terça 9h30", { title: "Dentista", when: "2026-10-20", time: "09:30" }],
    ["Relatório semana que vem", { title: "Relatório", when: "2026-10-19" }],
    ["Viagem 20 de outubro", { title: "Viagem", when: "2026-10-20" }],
    ["Festa dia 5 de dez de 2027", { title: "Festa", when: "2027-12-05" }],
    ["Conta em 3 dias", { title: "Conta", when: "2026-10-20" }],
    ["Ler hoje à noite", { title: "Ler", when: "2026-10-17", evening: true }],
    ["Alongar à noite", { title: "Alongar", when: "2026-10-17", evening: true }],
    ["Almoço ao meio-dia", { title: "Almoço", when: "2026-10-17", time: "12:00" }],
    ["Aprender piano algum dia", { title: "Aprender piano", when: "someday" }],
    ["Pagar aluguel todo mês no dia 5", { title: "Pagar aluguel", when: "2026-11-05", repeat: "FREQ=MONTHLY;BYMONTHDAY=5" }],
    ["Pagar luz todo dia 10", { title: "Pagar luz", when: "2026-11-10", repeat: "FREQ=MONTHLY;BYMONTHDAY=10" }],
    ["Academia toda seg e qui", { title: "Academia", when: "2026-10-19", repeat: "FREQ=WEEKLY;BYDAY=MO,TH" }],
    ["Feira todas as quartas", { title: "Feira", when: "2026-10-21", repeat: "FREQ=WEEKLY;BYDAY=WE" }],
    ["Regar plantas todo dia", { title: "Regar plantas", when: "2026-10-17", repeat: "FREQ=DAILY" }],
    ["Backup a cada 2 semanas", { title: "Backup", when: "2026-10-17", repeat: "FREQ=WEEKLY;INTERVAL=2" }],
    ["Reunião todo dia útil às 9", { title: "Reunião", when: "2026-10-19", time: "09:00", repeat: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" }],
    ["Impostos a cada 3 meses no último dia", { title: "Impostos", when: "2026-10-31", repeat: "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1" }],
    ["Revisar semanalmente", { title: "Revisar", repeat: "FREQ=WEEKLY" }],
    // Not dates or times: they stay in the title.
    ["Pagar segunda via do boleto", { title: "Pagar segunda via do boleto", when: undefined }],
    ["Pensar sobre a noite de ontem", { title: "Pensar sobre a noite de ontem", evening: undefined }],
    ["Comprar as 3 camisas", { title: "Comprar as 3 camisas", time: undefined }],
    ["Ter calma", { title: "Ter calma", when: undefined }],
    ["Sair 5 out of 10", { title: "Sair 5 out of 10", when: undefined }],
  ];
  for (const [input, want] of table) {
    it(input, () => {
      const got = parseQuickAdd(input, SAT) as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(want)) expect(got[k], k).toEqual(v);
    });
  }

  it("every Portuguese description reads back as the same rule", () => {
    setLang("pt-BR");
    for (const r of [
      "FREQ=DAILY",
      "FREQ=DAILY;INTERVAL=3",
      "FREQ=WEEKLY",
      "FREQ=WEEKLY;BYDAY=MO",
      "FREQ=WEEKLY;BYDAY=SU,SA",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      "FREQ=MONTHLY;BYMONTHDAY=22",
      "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1",
      "FREQ=YEARLY",
    ]) {
      const text = describeRule(parseRule(r)!);
      expect(parseQuickAdd(text, SAT).repeat, `${r} → ${text}`).toBe(r.startsWith("FREQ=YEARLY") ? "FREQ=YEARLY" : r);
    }
  });

  it("describes rules and days in Portuguese", () => {
    setLang("pt-BR");
    expect(describeRule(parseRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")!)).toBe("Todo dia útil");
    expect(describeRule(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")!)).toBe("A cada 2 semanas na segunda");
    expect(describeRule(parseRule("FREQ=MONTHLY;BYMONTHDAY=-1")!)).toBe("Todo mês no último dia");
    expect(dayLabel("2026-10-18", SAT)).toBe("Amanhã");
    expect(dayLabel("2026-10-21", SAT)).toBe("Quarta-feira");
    expect(dayLabel("2026-11-03", SAT)).toBe("Ter, 3 nov");
    expect(dayLabel("2027-01-03", SAT)).toBe("3 jan 2027");
  });
});

describe("files written in either language", () => {
  it("journal sections are found in both languages and created in the app's", async () => {
    const { appendTo, LEARNINGS } = await import("../src/data/journal");
    setLang("pt-BR");
    expect(appendTo("Texto\n", LEARNINGS, "Paciência.")).toBe("Texto\n\n## Aprendizados\n\nPaciência.\n");
    // A file written in English keeps its heading.
    expect(appendTo("## Learnings\n\nOne.\n", LEARNINGS, "Two.")).toBe("## Learnings\n\nOne.\n\nTwo.\n");
    setLang("en");
    expect(appendTo("## Aprendizados\n\nUm.\n", LEARNINGS, "Dois.")).toBe("## Aprendizados\n\nUm.\n\nDois.\n");
  });

  it("review answers under Portuguese or English headings are the same questions", async () => {
    const { joinReview, splitReview } = await import("../src/data/review");
    const p = splitReview("## Gratidão\n\nSol.\n\n## Repair\n\nLigar.\n\n## Outra\n\nFica.\n");
    expect(p.answers).toEqual({ Gratitude: "Sol.", Repair: "Ligar." });
    expect(p.extras).toEqual([{ title: "Outra", text: "Fica." }]);
    setLang("pt-BR");
    expect(joinReview(p)).toBe("## Gratidão\n\nSol.\n\n## Reparar\n\nLigar.\n\n## Outra\n\nFica.\n");
  });

  it("5W2H fields are read in both languages and written in the app's", async () => {
    const { format, split } = await import("../src/data/fivew2h");
    const { block } = split("## 5W2H\n- **O quê:** App\n- **Why:** Tempo\n- **Quanto:** R$ 0\n");
    expect(block!.values.What).toBe("App");
    expect(block!.values.Why).toBe("Tempo");
    expect(block!.values["How much"]).toBe("R$ 0");
    setLang("pt-BR");
    expect(format(block!)).toContain("- **O quê:** App\n- **Por quê:** Tempo\n");
  });

  it("idea and step sections count in either language", async () => {
    const { missingSections } = await import("../src/data/ideas");
    const { missingStepSections } = await import("../src/data/projects");
    const { FLOWS } = await import("../src/data/flows");
    setLang("pt-BR");
    expect(missingSections("business", "## Problem\n## Riscos")).toEqual(["Para quem", "Solução", "Por que agora"]);
    const step = FLOWS.find(f => f.id === "software")!.steps[2];
    expect(step.name).toBe("Requisitos");
    expect(missingStepSections(step.sectionWords!, "## Must have\n## Histórias de usuário\n")).toEqual([
      "Should have",
      "Could have",
      "Won't have",
    ]);
    setLang("en");
    expect(step.name).toBe("Requirements");
  });

  it("built-in thoughts: Portuguese quote and facts", async () => {
    const { BUILTIN, localized } = await import("../src/data/thoughts");
    setLang("pt-BR");
    const sen = localized(BUILTIN.find(x => x.id === "sen-ep1-3a")!);
    expect(sen.author).toBe("Sêneca");
    expect(sen.text).toBe("Tudo, Lucílio, nos é alheio; só o tempo é nosso.");
    const pes = localized(BUILTIN.find(x => x.id === "pes-mar-portugues")!);
    expect(pes.text).toBe("Valeu a pena? Tudo vale a pena / Se a alma não é pequena.");
    for (const b of BUILTIN) {
      expect(localized(b).work, b.id).toBeTruthy();
      if (!/^(mac|pes)-/.test(b.id)) expect(localized(b).text, b.id).not.toBe(b.text);
    }
  });
});

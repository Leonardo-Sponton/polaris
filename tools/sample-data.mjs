#!/usr/bin/env node
// Sample data, to see every screen filled in. Dates are relative to today, so Today, Upcoming
// and the reminders always have something. Each file carries `sample: true` (the app keeps that
// line when it saves, also in the next copy of a repeating task), and `remove` deletes every
// file that has it, in the trash too. Delete the line from a file to keep that file.
// .polaris/sample-files.json records that samples were added and which lists are theirs.
//
//   node tools/sample-data.mjs add <folder>       add to a data folder on this PC
//   node tools/sample-data.mjs remove <folder>
//   node tools/sample-data.mjs add --phone        add to the phone's data folder over adb
//   node tools/sample-data.mjs remove --phone
//
// Options for `add`: `--lang pt` writes the samples in Portuguese (default English); `--demo`
// also sets the app language and leaves out the reminder that fires a few minutes later (used
// for the README screenshots, in an empty folder). Book covers are downloaded from Open Library
// when there is a connection; the app itself never goes online.
// `add` again brings only areas that have no samples yet.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import LZString from "lz-string";

const ADB = process.env.ADB || path.join(os.homedir(), "Android/Sdk/platform-tools/adb");
// POLARIS_PHONE_DIR: another folder on the phone (the screenshot demo uses its own).
const PHONE_DIR = process.env.POLARIS_PHONE_DIR || "/storage/emulated/0/Documents/Polaris";
const MANIFEST = ".polaris/sample-files.json";
const LISTS = ".polaris/lists.json";

const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMinute = d => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const stamp = d =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const slug = t =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const day = n => isoDate(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n));
/** A moment `n` days from today at hh:mm, with `s` seconds (keeps file names apart). */
const at = (n, hh, mm, s = 0) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n, hh, mm, s);

function nextWeekday(wd) {
  const d = (wd - TODAY.getDay() + 7) % 7 || 7;
  return day(d);
}

function nextMonthDay(md) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + (TODAY.getDate() >= md ? 1 : 0), md);
  return isoDate(d);
}

const yamlValue = v =>
  typeof v === "string" && (/^\d{1,2}:\d{2}$/.test(v) || /[;=:#]/.test(v) && !/^\d{4}-\d{2}-\d{2}T/.test(v))
    ? JSON.stringify(v)
    : String(v);

/** Objects and lists of objects (checklist, assumptions) as indented YAML blocks. */
const yamlEntry = (k, v, ind = "") => {
  if (Array.isArray(v)) {
    const items = v.map(o =>
      Object.entries(o)
        .map(([kk, vv], i) => `${ind}${i ? "  " : "- "}${kk}: ${yamlValue(vv)}`)
        .join("\n"),
    );
    return `${ind}${k}:\n${items.join("\n")}`;
  }
  if (v && typeof v === "object") {
    return `${ind}${k}:\n${Object.entries(v).map(([kk, vv]) => yamlEntry(kk, vv, `${ind}  `)).join("\n")}`;
  }
  return `${ind}${k}: ${yamlValue(v)}`;
};

/** A small drawing for the Markdown tour (a picture in attachments/). */
/** A small Excalidraw drawing in the Obsidian plugin's file format (data/drawings.ts). */
function sampleDrawing(labels) {
  let seed = 7;
  const base = (id, type, x, y, w, h, extra = {}) => ({
    id, type, x, y, width: w, height: h, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [],
    frameId: null, roundness: type === "rectangle" ? { type: 3 } : null, seed: seed++, version: 1, versionNonce: seed++,
    isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...extra,
  });
  const colors = ["#a5d8ff", "#ffec99", "#b2f2bb"];
  const els = [];
  labels.forEach((label, i) => {
    const x = 20 + i * 220;
    els.push(base(`box${i}0000000`, "rectangle", x, 40, 160, 80, { backgroundColor: colors[i] }));
    els.push(base(`txt${i}0000`, "text", x + 20, 66, 120, 25, {
      text: label, originalText: label, fontSize: 20, fontFamily: 5, textAlign: "center", verticalAlign: "middle",
      containerId: null, autoResize: true, lineHeight: 1.25,
    }));
    if (i < labels.length - 1)
      els.push(base(`arr${i}000000`, "arrow", x + 165, 80, 50, 0, {
        points: [[0, 0], [50, 0]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow",
        lastCommittedPoint: null, elbowed: false,
      }));
  });
  const json = JSON.stringify({ type: "excalidraw", version: 2, source: "polaris", elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} }, null, "\t");
  const z = LZString.compressToBase64(json).replace(/(.{256})/g, "$1\n\n").replace(/\n+$/, "");
  const texts = labels.map((l, i) => `${l} ^txt${i}0000\n`).join("\n");
  return `---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'\n\n\n# Excalidraw Data\n\n## Text Elements\n${texts}\n%%\n## Drawing\n\`\`\`compressed-json\n${z}\n\`\`\`\n%%\n`;
}

const SKETCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
  <rect width="400" height="240" rx="16" fill="#1a1650"/>
  <circle cx="310" cy="70" r="34" fill="#e0c07a"/>
  <path d="M0 200 L90 110 L150 160 L230 80 L330 190 L400 150 L400 240 L0 240 Z" fill="#a67cff"/>
  <path d="M0 220 L120 170 L210 210 L300 175 L400 205 L400 240 L0 240 Z" fill="#7fd1d8" opacity="0.8"/>
</svg>
`;

function file(data, body) {
  const head = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => yamlEntry(k, v))
    .join("\n");
  return `---\n${head}\nsample: true\n---\n${body}`;
}

/**
 * The sample files, in English or Portuguese (`--lang pt`). Section headings use the words the
 * app writes in that language. `demo` leaves out the reminder that fires a few minutes after
 * adding (it would sit on Today in the screenshots).
 */
function samples(lang = "en", demo = false) {
  const T = (en, pt) => (lang === "pt" ? pt : en);
  const out = []; // [relative path, text]
  const covers = []; // [book folder, cover source]
  const binaries = []; // [relative path, Buffer]: files that cannot carry `sample: true`
  const fixed = new Set(); // files with a fixed name, added when missing even if their area has samples
  let sec = 0;
  const task = (created, title, data, notes = "") => {
    const c = new Date(created.getTime() + sec++ * 1000);
    const rel = `todo/${stamp(c)}-${slug(title)}.md`;
    const body = notes ? `# ${title}\n\n${notes}` : `# ${title}\n`;
    out.push([rel, file({ type: "todo", created: isoMinute(c), modified: isoMinute(c), status: "open", ...data }, body)]);
    return rel;
  };
  const inbox = (created, body) => {
    const c = new Date(created.getTime() + sec++ * 1000);
    out.push([`inbox/${stamp(c)}.md`, file({ type: "inbox", created: isoMinute(c), modified: isoMinute(c) }, body)]);
  };
  const W2H = T(["What", "Why", "Where", "When", "Who", "How", "How much"], ["O quê", "Por quê", "Onde", "Quando", "Quem", "Como", "Quanto"]);
  const w2h = v => `## 5W2H\n${W2H.map((f, i) => `- **${f}:** ${v[i]}`.trimEnd()).join("\n")}\n`;

  // ---- Today ----
  task(at(-3, 21, 10), T("Practice Spanish for 20 minutes", "Praticar espanhol por 20 minutos"),
    { when: day(0), time: "19:30", list: "study", priority: 1, repeat: "FREQ=DAILY" },
    T("- [x] Flashcards\n- [ ] One podcast episode\n- [ ] Write five sentences\n",
      "- [x] Flashcards\n- [ ] Um episódio do podcast\n- [ ] Escrever cinco frases\n"));
  task(at(-5, 9, 0), T("Pay the electricity bill", "Pagar a conta de luz"), { due: day(0), list: "home", priority: 2 });
  task(at(-1, 18, 40), T("Groceries for the week", "Compras da semana"), { when: day(0), list: "errands" },
    T("- [ ] Rice and beans\n- [ ] Coffee\n- [ ] Bananas\n- [ ] Oat milk\n",
      "- [ ] Arroz e feijão\n- [ ] Café\n- [ ] Banana\n- [ ] Leite de aveia\n"));
  task(at(-10, 7, 0), T("Stretch for 10 minutes", "Alongar por 10 minutos"), { when: day(0), evening: true, repeat: "FREQ=DAILY", list: "health" });
  task(at(-6, 12, 30), T("Send the quote to the client", "Enviar o orçamento para o cliente"), { when: day(-2), list: "work", priority: 1 },
    T("Two options: basic site and site + online shop.\n", "Duas opções: site simples e site + loja virtual.\n"));
  task(at(-9, 8, 15), T("Water the plants", "Regar as plantas"), { when: day(0), repeat: "FREQ=DAILY;INTERVAL=3", list: "home" });
  if (!demo) {
    const soon = new Date(NOW.getTime() + 5 * 60_000);
    const soonDay = Math.round((new Date(soon.getFullYear(), soon.getMonth(), soon.getDate()) - TODAY) / 86_400_000);
    task(at(0, NOW.getHours(), NOW.getMinutes()), T("Sample reminder: watch it arrive", "Lembrete de exemplo: veja ele chegar"),
      { when: day(soonDay), time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}` },
      T("This task reminds a few minutes after the sample data was added.\n", "Esta tarefa avisa alguns minutos depois que os exemplos foram adicionados.\n"));
  }

  // ---- Upcoming ----
  task(at(-4, 10, 5), T("Dentist appointment", "Consulta no dentista"), { when: day(1), time: "14:00", remind: `${day(1)}T13:00`, list: "health" },
    T("Reminder one hour before, to have time to get there.\n", "Lembrete uma hora antes, para dar tempo de chegar.\n"));
  task(at(-2, 20, 0), T("Finish the portfolio page", "Terminar a página do portfólio"), { when: day(3), due: day(4), list: "work", priority: 1 },
    T("## Checklist\n\n- [x] Pick three projects\n- [ ] Screenshots\n- [ ] Short text for each\n",
      "## Checklist\n\n- [x] Escolher três projetos\n- [ ] Capturas de tela\n- [ ] Um texto curto para cada\n"));
  task(at(-14, 18, 0), T("Weekly review", "Revisão da semana"), { when: nextWeekday(0), time: "18:00", repeat: "FREQ=WEEKLY;BYDAY=SU" },
    T("- [ ] Empty the inbox\n- [ ] Look at Upcoming\n- [ ] Pick 3 goals for the week\n",
      "- [ ] Esvaziar a caixa de entrada\n- [ ] Olhar os Próximos\n- [ ] Escolher 3 metas para a semana\n"));
  task(at(-1, 11, 20), T("Take the bike to the repair shop", "Levar a bicicleta para a revisão"), { when: day(6), list: "errands" });
  task(at(-20, 9, 0), T("Pay the rent", "Pagar o aluguel"), { when: nextMonthDay(5), repeat: "FREQ=MONTHLY;BYMONTHDAY=5", list: "home", priority: 2 });

  // ---- Anytime ----
  task(at(-7, 22, 0), T("Clean up the Downloads folder", "Limpar a pasta Downloads"), { list: "home" });
  task(at(-8, 15, 45), T("Try the Pomodoro technique for a week", "Testar a técnica Pomodoro por uma semana"), { list: "study", priority: 3 });
  task(at(-2, 9, 30), T("Back up the phone photos", "Fazer backup das fotos do celular"), {},
    T("Use the USB cable; keep a copy on the PC.\n", "Pelo cabo USB; guardar uma cópia no PC.\n"));

  // ---- Someday ----
  task(at(-30, 23, 0), T("Learn to play the ukulele", "Aprender a tocar ukulele"), { when: "someday" });
  task(at(-25, 19, 0), T("Trip to Chapada Diamantina", "Viagem para a Chapada Diamantina"), { when: "someday" },
    T("Best from April to October, after the rains.\n\n", "Melhor de abril a outubro, depois das chuvas.\n\n") +
    w2h(T(
      ["A 5-day hiking trip", "See the waterfalls and the Pai Inácio hill", "Lençóis, Bahia", "May", "Two friends and me", "Fly to Salvador, then the bus to Lençóis", "About 2,500 each with the guide"],
      ["Uma viagem de 5 dias de trilhas", "Ver as cachoeiras e o Morro do Pai Inácio", "Lençóis, Bahia", "Maio", "Eu e dois amigos", "Avião até Salvador, depois ônibus até Lençóis", "Uns 2.500 cada, com o guia"])));

  // ---- Logbook ----
  task(at(-4, 8, 0), T("Install Polaris on the tablet", "Instalar o Polaris no tablet"), { status: "done", done_at: isoMinute(at(-1, 20, 10)) });
  task(at(-6, 10, 0), T("Call the bank", "Ligar para o banco"), { status: "canceled", done_at: isoMinute(at(-3, 16, 0)) });
  task(at(-1, 7, 30), T("Read 20 pages", "Ler 20 páginas"), { status: "done", done_at: isoMinute(at(0, 8, 15)), list: "study" });

  // ---- Inbox ----
  inbox(at(-1, 23, 12), T("# Recipe: lentil soup\n\nThe one from the market stall; ask for the spices.\n",
    "# Receita: sopa de lentilha\n\nA da barraca da feira; perguntar os temperos.\n"));
  inbox(at(0, 7, 45), T("Film: Central Station (1998)\n", "Filme: Central do Brasil (1998)\n"));
  inbox(at(-2, 14, 3), T("Song to learn: Clair de Lune, Debussy\n", "Música para aprender: Clair de Lune, Debussy\n"));
  inbox(at(0, 9, 2), T("Does the library open on Saturday?\n", "A biblioteca abre no sábado?\n"));

  // ---- Notes ----
  const note = (created, modified, body, extra = {}) => {
    const c = new Date(created.getTime() + sec++ * 1000);
    out.push([`notes/${stamp(c)}.md`, file({ type: "note", created: isoMinute(c), modified: isoMinute(modified), ...extra }, body)]);
  };
  note(at(-20, 19, 5), at(-1, 22, 10), T(
    "# Trip to the coast\n\n## Before going\n- [x] Book the bus tickets\n- [ ] Ask about the hostel breakfast\n- [ ] Sun cream and a hat\n\n## Days\n**Day 1.** Arrive at noon, walk on the beach, dinner at the fish market.\n\n**Day 2.** Boat trip to the island (leaves at 9). Take cash: card is not accepted on the boat.\n\n**Day 3.** Free morning, bus back at 16:00.\n\n## Budget\n| Item              | Cost |\n| ----------------- | ---- |\n| Bus               | 180  |\n| Hostel, 2 nights  | 240  |\n| Food              | 200  |\n\n#travel #family\n",
    "# Viagem para o litoral\n\n## Antes de ir\n- [x] Comprar as passagens de ônibus\n- [ ] Perguntar sobre o café da manhã do hostel\n- [ ] Protetor solar e boné\n\n## Dias\n**Dia 1.** Chegar ao meio-dia, caminhar na praia, jantar no mercado de peixe.\n\n**Dia 2.** Passeio de barco até a ilha (sai às 9). Levar dinheiro: o barco não aceita cartão.\n\n**Dia 3.** Manhã livre, ônibus de volta às 16h.\n\n## Orçamento\n| Item              | Custo |\n| ----------------- | ----- |\n| Ônibus            | 180   |\n| Hostel, 2 noites  | 240   |\n| Comida            | 200   |\n\n#viagem #familia\n"),
    { pinned: true });
  note(at(-8, 21, 30), at(-2, 20, 45), T(
    "# How Git branches work\n\nA branch is only a name that points to a commit. Making a new commit moves the name forward.\n\n- `git switch -c topic` makes a branch and moves to it.\n- `git merge topic` brings its commits into the current branch.\n- `git rebase main` replays my commits on top of main: cleaner history, but never on commits others already have.\n\n> Commit early, push when it works.\n\n#study #git\n",
    "# Como funcionam os branches do Git\n\nUm branch é só um nome que aponta para um commit. Fazer um novo commit move o nome para frente.\n\n- `git switch -c topico` cria um branch e muda para ele.\n- `git merge topico` traz os commits dele para o branch atual.\n- `git rebase main` refaz meus commits por cima da main: histórico mais limpo, mas nunca em commits que outros já têm.\n\n> Faça commit cedo, dê push quando funcionar.\n\n#estudo #git\n"));
  note(at(-3, 20, 10), at(0, 9, 40), T(
    "# Java snippets I keep forgetting\n\n> [!tip] Read this first\n> Run the code in your head before running it on the PC.\n\nReading a file line by line, with ==try-with-resources== closing it for me:\n\n```java\nimport java.nio.file.*;\nimport java.util.List;\n\npublic class Lines {\n    // Prints every line that has the word\n    public static void main(String[] args) throws Exception {\n        List<String> lines = Files.readAllLines(Path.of(\"notes.txt\"));\n        for (String line : lines) {\n            if (line.contains(\"java\")) System.out.println(line);\n        }\n    }\n}\n```\n\nThe same in the shell:\n\n```bash\ngrep -i java notes.txt | wc -l\n```\n\n> [!warning] Careful\n> `==` compares references; use `.equals()` for strings.\n\nMore in the [Java tutorials](https://dev.java/learn/).\n\n#study #java\n",
    "# Trechos de Java que eu sempre esqueço\n\n> [!tip] Leia antes\n> Rode o código na cabeça antes de rodar no PC.\n\nLer um arquivo linha por linha, com o ==try-with-resources== fechando para mim:\n\n```java\nimport java.nio.file.*;\nimport java.util.List;\n\npublic class Linhas {\n    // Mostra toda linha que tem a palavra\n    public static void main(String[] args) throws Exception {\n        List<String> linhas = Files.readAllLines(Path.of(\"notas.txt\"));\n        for (String linha : linhas) {\n            if (linha.contains(\"java\")) System.out.println(linha);\n        }\n    }\n}\n```\n\nO mesmo no terminal:\n\n```bash\ngrep -i java notas.txt | wc -l\n```\n\n> [!warning] Cuidado\n> `==` compara referências; para strings use `.equals()`.\n\nMais nos [tutoriais de Java](https://dev.java/learn/).\n\n#estudo #java\n"));
  note(at(-4, 7, 50), at(-4, 8, 20), T(
    "# Letter to myself in five years\n\nI hope you still write things down. This year I started studying software at night after work, and some days it felt like too much.\n\nIf you are reading this, check: did you keep going? Whatever the answer, be kind to the person who wrote this.\n\n#personal\n",
    "# Carta para mim daqui a cinco anos\n\nEspero que você ainda escreva as coisas. Este ano comecei a estudar software à noite depois do trabalho, e tem dias que parece demais.\n\nSe você está lendo isto, confira: você continuou? Seja qual for a resposta, seja gentil com quem escreveu isto.\n\n#pessoal\n"));
  note(at(-1, 12, 15), at(0, 8, 5), T(
    "# Meeting notes: neighbourhood association\n\n- Street lights: the city answered, work starts next month.\n- Saturday market: needs two more volunteers.\n- Next meeting on the first Tuesday, 19:00.\n\n#community\n",
    "# Ata: associação de moradores\n\n- Iluminação da rua: a prefeitura respondeu, a obra começa no mês que vem.\n- Feira de sábado: faltam dois voluntários.\n- Próxima reunião na primeira terça, às 19h.\n\n#comunidade\n"));

  // A tour of the Obsidian-like Markdown (fixed names: added even when the area has samples).
  const tourName = T("notes/sample-markdown-tour.md", "notes/exemplo-tour-do-markdown.md");
  fixed.add(tourName);
  out.push([tourName, file({ type: "note", created: isoMinute(at(0, 7, 30)), modified: isoMinute(at(0, 7, 30)), pinned: true }, T(
    "# Markdown like Obsidian\n\nEverything here is plain text in the file. Tap a line to see its symbols; type / for a menu of everything you can insert.\n\n## Links and embeds\n\nLink to another note: [[Trip to the coast]] · with other words: [[Trip to the coast|our trip]] · to a heading: [[Trip to the coast#Budget]].\n\nThe budget, shown here from the other note:\n\n![[Trip to the coast#Budget]]\n\nA picture from the attachments folder, 240 px wide (paste or drop your own):\n\n![[sample-sketch.svg|240]]\n\n## Callouts\n\n> [!tip] Tip\n> Ctrl+O opens any note by its title; Ctrl+P lists commands.\n\n> [!faq]- Can callouts fold?\n> Yes: [!faq]- starts closed, [!faq]+ starts open. Tap the arrow.\n\n## Math\n\nInline: $a^2 + b^2 = c^2$. A block:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n## Diagram\n\n```mermaid\nflowchart LR\n    Idea --> Draft --> Review\n    Review -->|ok| Done\n    Review -->|change| Draft\n```\n\n## Table with a formula\n\nPut the caret in the table: Tab moves between cells and lines the columns up; the bar has \"Calculate formulas\".\n\n| Item   | Cost |\n| ------ | ---- |\n| Bus    | 180  |\n| Hostel | 240  |\n| Food   | 200  |\n| Total  | 620  |\n<!-- TBLFM: @>$2=sum(@I..@-1) -->\n\n## Small things\n\n==Highlight==, <u>underline</u>, H<sub>2</sub>O, x<sup>2</sup>, <kbd>Ctrl</kbd>+<kbd>L</kbd>, a footnote[^1] and one written in place^[like this]. %%A comment: faded, only for you.%%\n\n- [ ] A task (Ctrl+L makes one)\n- Lists indent with Tab\n\t- like this\n\n[^1]: Footnotes gather at the end of the note.\n\n#markdown\n",
    "# Markdown como no Obsidian\n\nTudo aqui é texto simples no arquivo. Toque numa linha para ver os símbolos; digite / para um menu com tudo o que dá para inserir.\n\n## Links e incorporações\n\nLink para outra nota: [[Viagem para o litoral]] · com outras palavras: [[Viagem para o litoral|nossa viagem]] · para um título: [[Viagem para o litoral#Orçamento]].\n\nO orçamento, mostrado aqui a partir da outra nota:\n\n![[Viagem para o litoral#Orçamento]]\n\nUma imagem da pasta attachments, com 240 px de largura (cole ou arraste as suas):\n\n![[exemplo-desenho.svg|240]]\n\n## Destaques (callouts)\n\n> [!tip] Dica\n> Ctrl+O abre qualquer nota pelo título; Ctrl+P lista os comandos.\n\n> [!faq]- Dá para recolher?\n> Dá: [!faq]- começa fechado, [!faq]+ começa aberto. Toque na setinha.\n\n## Fórmulas\n\nNa linha: $a^2 + b^2 = c^2$. Em bloco:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n## Diagrama\n\n```mermaid\nflowchart LR\n    Ideia --> Rascunho --> Revisão\n    Revisão -->|ok| Pronto\n    Revisão -->|mudar| Rascunho\n```\n\n## Tabela com fórmula\n\nPonha o cursor na tabela: Tab passa de célula e alinha as colunas; a barra tem \"Calcular fórmulas\".\n\n| Item   | Custo |\n| ------ | ----- |\n| Ônibus | 180   |\n| Hostel | 240   |\n| Comida | 200   |\n| Total  | 620   |\n<!-- TBLFM: @>$2=sum(@I..@-1) -->\n\n## Detalhes\n\n==Destaque==, <u>sublinhado</u>, H<sub>2</sub>O, x<sup>2</sup>, <kbd>Ctrl</kbd>+<kbd>L</kbd>, uma nota de rodapé[^1] e uma escrita no lugar^[assim]. %%Um comentário: apagadinho, só para você.%%\n\n- [ ] Uma tarefa (Ctrl+L cria uma)\n- Listas recuam com Tab\n\t- assim\n\n[^1]: As notas de rodapé ficam no fim da nota.\n\n#markdown\n"))]);
  binaries.push([T("attachments/sample-sketch.svg", "attachments/exemplo-desenho.svg"), Buffer.from(SKETCH_SVG)]);
  binaries.push([T("templates/Meeting.md", "templates/Reunião.md"), Buffer.from(T(
    "---\ntags: [meeting]\n---\n# {{title}}\n\n**When:** {{date:DD/MM/YYYY}} {{time}}\n\n## People\n\n- \n\n## Notes\n\n## Decisions\n\n- [ ] \n",
    "---\ntags: [reunião]\n---\n# {{title}}\n\n**Quando:** {{date:DD/MM/YYYY}} {{time}}\n\n## Pessoas\n\n- \n\n## Anotações\n\n## Decisões\n\n- [ ] \n"))]);
  binaries.push([T("templates/Study note.md", "templates/Nota de estudo.md"), Buffer.from(T(
    "---\nsubject:\nsource:\nreview_date:\n---\n## {{title}}\n\n> [!summary] In my own words\n> \n\n## Questions\n\n- What::\n",
    "---\nmateria:\nfonte:\nrevisar_em:\n---\n## {{title}}\n\n> [!summary] Com as minhas palavras\n> \n\n## Perguntas\n\n- O quê::\n"))]);
  for (const [rel] of binaries.slice(-3)) fixed.add(rel);

  // Drawings, PDF export and appearance (Obsidian rounds 2 and 3; fixed names too).
  const drawName = T("Sample drawing", "Exemplo de desenho");
  binaries.push([`drawings/${drawName}.excalidraw.md`, Buffer.from(sampleDrawing(T(["Idea", "Draft", "Done"], ["Ideia", "Rascunho", "Pronto"])))]);
  binaries.push([T(".polaris/snippets/sample-wide-headings.css", ".polaris/snippets/exemplo-titulos-espacados.css"), Buffer.from(T(
    "/* Sample CSS snippet: turn it on in Settings → Appearance → CSS snippets. */\n.cm-hm-h1,\n.cm-hm-h2 {\n  letter-spacing: 0.06em;\n}\n",
    "/* Snippet CSS de exemplo: ligue em Configurações → Aparência → Snippets CSS. */\n.cm-hm-h1,\n.cm-hm-h2 {\n  letter-spacing: 0.06em;\n}\n"))]);
  for (const [rel] of binaries.slice(-2)) fixed.add(rel);
  const drawNote = T("notes/sample-drawings-and-pdf.md", "notes/exemplo-desenhos-e-pdf.md");
  fixed.add(drawNote);
  out.push([drawNote, file({ type: "note", created: isoMinute(at(0, 7, 35)), modified: isoMinute(at(0, 7, 35)), pinned: true }, T(
    `# Drawings, PDF and appearance\n\n## Drawings (Excalidraw)\n\nA drawing shown in a note; tap it to draw. New ones: type /drawing in a note, or the pen button in Notes. They are the same files as Obsidian's Excalidraw plugin (drawings/*.excalidraw.md); Notes → Drawings → "Import from Obsidian…" copies a vault's drawings.\n\n![[${drawName}.excalidraw]]\n\n## PDF\n\nThe ⋯ menu of a note → Export to PDF: page size, margins, orientation, size, justified text. Pictures, drawings, formulas and diagrams go too.\n\n## Appearance\n\nSettings → Appearance: light/dark, color schemes (Catppuccin, Nord, Gruvbox, Atom One…), accent color, fonts, text size, interface size (Ctrl + = / Ctrl + −), line width. "Customize" changes single colors and headings; CSS snippets add your own rules.\n`,
    `# Desenhos, PDF e aparência\n\n## Desenhos (Excalidraw)\n\nUm desenho mostrado numa nota; toque nele para desenhar. Novos: digite /desenho numa nota, ou o botão da caneta em Notas. São os mesmos arquivos do plugin Excalidraw do Obsidian (drawings/*.excalidraw.md); Notas → Desenhos → "Importar do Obsidian…" copia os desenhos de um cofre.\n\n![[${drawName}.excalidraw]]\n\n## PDF\n\nMenu ⋯ de uma nota → Exportar para PDF: tamanho da página, margens, orientação, tamanho, texto justificado. Imagens, desenhos, fórmulas e diagramas vão junto.\n\n## Aparência\n\nConfigurações → Aparência: claro/escuro, esquemas de cores (Catppuccin, Nord, Gruvbox, Atom One…), cor de destaque, fontes, tamanho do texto, tamanho da interface (Ctrl + = / Ctrl + −), largura da linha. "Personalizar" muda cores uma a uma e os títulos; snippets CSS acrescentam suas próprias regras.\n`))]);

  // ---- Ideas ----
  const idea = (created, title, data, rest = "", seen = 0) => {
    const c = new Date(created.getTime() + sec++ * 1000);
    const rel = `ideas/${isoDate(c).replace(/-/g, "")}-${slug(title)}.md`;
    const body = rest ? `# ${title}\n\n${rest}` : `# ${title}\n`;
    const d = { type: "idea", created: isoMinute(c), modified: isoMinute(c), status: "draft", template: "blank", ...data };
    out.push([rel, file({ ...d, last_seen: day(seen) }, body)]);
  };
  const plantsIdea = T("App that reminds you to water the plants", "App que lembra de regar as plantas");
  idea(at(-2, 22, 40), plantsIdea, {
    template: "software", tags: T("[app, home]", "[app, casa]"),
    checklist: { "problem-real": "yes", who: "yes", "would-use": "unsure", "can-build": "yes", "cost-ok": "yes" },
  },
    T("Each plant with its own rhythm, a photo and a note about light.\n\n## Problem\n\nI forget the ferns and drown the cactus.\n\n## For whom\n\nPeople with many plants at home and little time.\n\n",
      "Cada planta com seu ritmo, uma foto e uma nota sobre luz.\n\n## Problema\n\nEsqueço as samambaias e afogo o cacto.\n\n## Para quem\n\nQuem tem muitas plantas em casa e pouco tempo.\n\n") +
    w2h(T(["A plant care app with reminders per plant", "Plants die from too much or too little water", "Phone, offline", "Before spring", "Me, then friends", "React + Capacitor", ""],
      ["Um app de cuidados com lembrete por planta", "Planta morre por água demais ou de menos", "Celular, offline", "Antes da primavera", "Eu, depois os amigos", "React + Capacitor", ""])), -2);
  const breadIdea = T("Sourdough bread for the neighbourhood", "Pão de fermentação natural para o bairro");
  idea(at(-20, 19, 15), breadIdea, {
    status: "maturing", template: "business", tags: T("[money, food]", "[renda, comida]"),
    checklist: {
      "problem-real": "yes", who: "yes", "would-use": "yes", better: "unsure", "can-build": "yes",
      "cost-ok": "no", "still-want": "yes", "riskiest-known": "yes",
    },
    assumptions: [
      { text: T("Neighbours will pay 18 for a loaf", "Os vizinhos pagam 18 por um pão"), test: T("Bake 10 loaves on Saturday and offer them in the building group", "Assar 10 pães no sábado e oferecer no grupo do prédio"), result: "confirmed", notes: T("Sold all 10 before noon", "Vendi os 10 antes do meio-dia") },
      { text: T("Flour is cheaper in 25 kg sacks", "A farinha sai mais barata no saco de 25 kg"), test: T("Ask two wholesalers", "Perguntar em dois atacadistas"), result: "rejected", notes: T("Only 8% cheaper; not worth the space", "Só 8% mais barata; não compensa o espaço") },
      { text: T("Home baking for sale needs no licence at this size", "Vender pão feito em casa nesse tamanho não precisa de licença"), test: T("Ask the city hall", "Perguntar na prefeitura"), result: "untested" },
    ],
  },
    T("Orders until Thursday, delivery on Saturday morning.\n\n## Problem\n\nThe nearest bakery with real sourdough is 40 minutes away.\n\n## Risks\n\n- Health rules for selling food\n- The oven only fits 4 loaves at a time\n",
      "Pedidos até quinta, entrega no sábado de manhã.\n\n## Problema\n\nA padaria mais perto com fermentação natural fica a 40 minutos.\n\n## Riscos\n\n- Regras sanitárias para vender comida\n- O forno só cabe 4 pães por vez\n"), -18);
  idea(at(-1, 8, 5), T("Morning routine without the phone", "Manhã sem celular"), { template: "personal", tags: T("[life]", "[vida]") },
    T("First hour of the day: water, stretch, read. Phone only after breakfast.\n",
      "Primeira hora do dia: água, alongamento, leitura. Celular só depois do café.\n"), -1);
  idea(at(-30, 21, 0), T("Podcast about everyday science", "Podcast sobre ciência do dia a dia"), { tags: T("[hobby]", "[hobby]") }, "", -28);
  idea(at(-45, 14, 30), T("Bike delivery for the neighbourhood", "Entregas de bicicleta no bairro"), {
    status: "archived", template: "business",
    archived_reason: T("The hills here make it too slow, and apps already do it", "As ladeiras daqui deixam tudo lento, e os apps já fazem isso"),
  }, T("Deliveries for the small shops on my street.\n", "Entregas para as lojinhas da minha rua.\n"), -40);

  // ---- Projects ----
  // Linked to two of the sample ideas above, so the project page shows their checklist and
  // assumptions.
  const ideaFile = (created, title) => `${isoDate(created).replace(/-/g, "")}-${slug(title)}`;
  const project = (created, title, data, rest = "") => {
    const c = isoMinute(created);
    out.push([`projects/${slug(title)}/project.md`, file({ type: "project", created: c, modified: c, status: "active", ...data }, `# ${title}\n` + (rest ? `\n${rest}` : ""))]);
  };
  const stepNote = (proj, step, created, title, rest) => {
    const c = isoMinute(created);
    out.push([`projects/${slug(proj)}/${step}/${stamp(created)}-${slug(title)}.md`, file({ type: "step-note", created: c, modified: c }, `# ${title}\n\n${rest}`)]);
  };
  // Business flow (Sebrae's plan): a small business, now on the financial plan.
  const bread = T("Sourdough on Saturdays", "Pão de sábado");
  project(at(-15, 20, 0), bread, {
    flow: "business", idea: ideaFile(at(-20, 19, 15), breadIdea), step: "05-financial-plan",
    gates: [
      { step: "01-business-and-founders", decision: "go", reason: T("Just me for now; MEI is enough to start.", "Só eu por enquanto; MEI basta para começar."), date: day(-13) },
      { step: "02-market-study", decision: "go", reason: T("No bakery nearby sells sourdough.", "Nenhuma padaria perto vende fermentação natural."), date: day(-11) },
      { step: "03-marketing-plan", decision: "go", reason: T("18 per loaf sold out in the test.", "18 por pão esgotou no teste."), date: day(-9) },
      { step: "04-operational-plan", decision: "go", reason: T("A second oven doubles the batch; enough to start.", "Um segundo forno dobra a fornada; basta para começar."), date: day(-7) },
    ],
  },
    T("Saturday orders first; a weekday batch later if it works.\n", "Primeiro os pedidos de sábado; uma fornada na semana depois, se der certo.\n"));
  stepNote(bread, "01-business-and-founders", at(-14, 21, 0), T("Who and how", "Quem e como"),
    T("## The business\n\nSourdough loaves to order, delivered on Saturday mornings in the neighbourhood.\n\n## Founders and roles\n\nJust me: starter, baking and deliveries.\n\n## Tax regime\n\nMEI.\n",
      "## O negócio\n\nPães de fermentação natural por encomenda, entregues no sábado de manhã no bairro.\n\n## Sócios e funções\n\nSó eu: fermento, forno e entregas.\n\n## Enquadramento tributário\n\nMEI.\n"));
  stepNote(bread, "02-market-study", at(-12, 20, 0), T("Who buys bread here", "Quem compra pão aqui"),
    T("## Customers\n\nFamilies in the three buildings on the street; people who work from home.\n\n## Competitors\n\nThe supermarket's industrial loaf, cheaper but not the same.\n\n## Suppliers\n\nFlour from the wholesale market; a local mill for whole wheat.\n",
      "## Clientes\n\nFamílias dos três prédios da rua; quem trabalha em casa.\n\n## Concorrentes\n\nO pão industrial do mercado, mais barato, mas não é a mesma coisa.\n\n## Fornecedores\n\nFarinha do atacado; um moinho da região para a integral.\n"));
  stepNote(bread, "05-financial-plan", at(-6, 20, 30), T("Cost per loaf", "Custo por pão"),
    T("Flour, salt and energy 5, bag and label 1: **6 per loaf**.\n\n- [ ] Ask the mill for a price\n- [ ] Price paper bags\n",
      "Farinha, sal e energia 5, saco e etiqueta 1: **6 por pão**.\n\n- [ ] Pedir preço ao moinho\n- [ ] Orçar sacos de papel\n"));
  stepNote(bread, "05-financial-plan", at(-2, 21, 15), T("First month", "Primeiro mês"),
    T("## Total investment\n\nSecond oven 900 + bannetons and scale 250 + first stock 150 = **1,300**.\n\n## Income statement\n\n- Sales: 120 loaves × 18 = 2,160\n- Variable costs: 120 × 6 = 720\n- Contribution margin: 1,440\n- Fixed costs: gas 120 + MEI fee 80 + delivery bag 50 = 250\n- **Net profit: 1,190**\n",
      "## Investimento total\n\nSegundo forno 900 + cestos e balança 250 + estoque inicial 150 = **1.300**.\n\n## Demonstrativo de resultados\n\n- Vendas: 120 pães × 18 = 2.160\n- Custos variáveis: 120 × 6 = 720\n- Margem de contribuição: 1.440\n- Custos fixos: gás 120 + MEI 80 + bolsa térmica 50 = 250\n- **Lucro líquido: 1.190**\n"));
  const plants = T("Plant care app", "App de plantas");
  project(at(-1, 9, 0), plants, { flow: "software", idea: ideaFile(at(-2, 22, 40), plantsIdea), step: "01-discovery" });
  stepNote(plants, "01-discovery", at(-1, 9, 30), T("Talk to plant people", "Conversar com quem tem plantas"),
    T("## Interviews\n\n- Ana: 30 plants, uses a paper calendar on the fridge.\n- Bruno: sets phone alarms, then ignores them.\n\n## Insights\n\nThe hard part is knowing each plant's rhythm, not remembering the day.\n",
      "## Entrevistas\n\n- Ana: 30 plantas, usa um calendário de papel na geladeira.\n- Bruno: põe alarmes no celular e depois ignora.\n\n## Descobertas\n\nO difícil é saber o ritmo de cada planta, não lembrar o dia.\n"));
  // Tech startup flow, on hold.
  project(at(-30, 19, 0), T("Tool library for the building", "Biblioteca de ferramentas do prédio"), {
    flow: "startup", step: "01-business-model", status: "on-hold",
    gates: [
      { step: "00-integrating-environment", decision: "go", reason: T("The city's incubator takes community projects every semester.", "A incubadora da cidade aceita projetos comunitários todo semestre."), date: day(-25) },
      { step: "01-business-model", decision: "hold", reason: T("Wait for the residents' meeting in December.", "Esperar a reunião de condomínio de dezembro."), date: day(-12) },
    ],
  }, T("Neighbours lend drills, ladders and tools through a shared list.\n", "Vizinhos emprestam furadeiras, escadas e ferramentas por uma lista compartilhada.\n"));
  task(at(-5, 20, 0), T("Ask the mill for a flour price", "Pedir preço da farinha ao moinho"), { project: slug(bread), step: "05-financial-plan", priority: 2 });
  task(at(-2, 21, 20), T("Price the paper bags", "Orçar os sacos de papel"), { project: slug(bread), step: "05-financial-plan", when: day(2) });
  task(at(-12, 18, 0), T("Test the second oven", "Testar o segundo forno"), { project: slug(bread), step: "04-operational-plan", status: "done", done_at: `${day(-8)}T16:00` });
  task(at(-1, 9, 40), T("Interview three more people", "Entrevistar mais três pessoas"), { project: slug(plants), step: "01-discovery", when: day(1) });

  // ---- Books ----
  // Covers come from Open Library (covers.openlibrary.org), by ISBN or cover id, when there is a
  // connection; without one the shelf shows the colored cards. Page counts are made up.
  const book = (created, data, notes = "", cover) => {
    const c = isoMinute(created);
    const dir = `books/${slug(data.title)}`;
    out.push([`${dir}/book.md`, file({ type: "book", created: c, modified: c, ...data, ...(cover && { cover: "cover.jpg" }) }, notes)]);
    if (cover) covers.push([dir, cover]);
  };
  const quote = (bookTitle, created, data, text, comment = "") => {
    const c = isoMinute(created);
    const body = `> ${text}\n` + (comment ? `\n${comment}` : "");
    out.push([`books/${slug(bookTitle)}/quotes/${stamp(created)}.md`, file({ type: "quote", created: c, modified: c, ...data }, body)]);
  };
  const medTitle = T("Meditations", "Meditações");
  if (lang === "pt") {
    book(at(-12, 21, 0), { title: "Meditações", author: "Marco Aurélio", format: "paper", status: "reading", started: day(-12), pages: 256 },
      "Algumas páginas antes de dormir. Livro 4 até agora.\n", { id: 13264786 });
    book(at(-5, 20, 10), { title: "Hábitos Atômicos", author: "James Clear", year: 2019, format: "ebook", status: "reading", started: day(-5), pages: 320 },
      "Junto com a tarefa de espanhol no Hoje.\n", { isbn: "9788550807560" });
    book(at(-40, 10, 0), { title: "Essencialismo", author: "Greg McKeown", year: 2015, status: "want" }, "", { id: 10401970 });
    book(at(-60, 18, 30), { title: "Capitães da Areia", author: "Jorge Amado", year: 1937, status: "want" }, "", { id: 14832770 });
    book(at(-90, 9, 0), { title: "Dom Casmurro", author: "Machado de Assis", year: 1899, status: "read", started: day(-80), finished: day(-50), rating: 5, pages: 256 },
      "Capitu traiu ou não? Quem merece dúvida é o narrador.\n", { id: 10558903 });
    book(at(-120, 9, 30), { title: "1984", author: "George Orwell", year: 1949, format: "audio", status: "read", started: day(-110), finished: day(-95), rating: 4, pages: 416 },
      "", { isbn: "9788535914849" });
    book(at(-150, 19, 0), { title: "Sapiens", author: "Yuval Noah Harari", year: 2015, status: "read", started: day(-180), finished: day(-150), rating: 4, pages: 472 },
      "", { id: 14540965 });
    book(at(-200, 19, 0), { title: "O Alquimista", author: "Paulo Coelho", year: 1988, status: "read", started: day(-205), finished: day(-200), rating: 3, pages: 208 },
      "", { id: 12372777 });
    book(at(-300, 15, 0), { title: "O Pequeno Príncipe", author: "Antoine de Saint-Exupéry", year: 1943, status: "read", started: day(-301), finished: day(-300), rating: 5, pages: 96 },
      "", { id: 15096605 });
    book(at(-420, 20, 0), { title: "Código Limpo", author: "Robert C. Martin", year: 2009, format: "ebook", status: "read", started: day(-450), finished: day(-420), rating: 4, pages: 440 },
      "", { id: 12004890 });
    book(at(-70, 22, 0), { title: "Vidas Secas", author: "Graciliano Ramos", year: 1938, status: "dnf", started: day(-70), finished: day(-62),
      dnf_reason: "Não era o momento; retomar nas férias" }, "", { id: 14618961 });
    book(at(-3, 12, 0), { title: "Torto Arado", author: "Itamar Vieira Junior", year: 2019, status: "wishlist", buy_url: "https://todavialivros.com.br/" },
      "Indicação de uma amiga. Procurar usado.\n", { id: 12369648 });
    // Texts: the app's own Portuguese translations (data/thoughts.pt.json, same passages).
    quote(medTitle, at(-11, 21, 40), { page: 41, chapter: "Livro IV, 3", tags: "[mudança]" }, "O universo é mudança; a vida é opinião.");
    quote(medTitle, at(-10, 22, 5), { page: 44, chapter: "Livro IV, 17", tags: "[tempo, morte]", last_reviewed: day(-5) },
      "Não vivas como se fosses viver dez mil anos. A morte paira sobre ti. Enquanto vives, enquanto podes, torna-te bom.",
      "Reler antes de planejar a semana.\n");
    quote(medTitle, at(-2, 22, 30), { page: 63, chapter: "Livro V, 20", tags: "[obstáculos]" },
      "A mente converte todo obstáculo à sua atividade em auxílio: o que impede a ação faz a ação avançar, e o que está no caminho nos ajuda a seguir por ele.");
  } else {
    book(at(-12, 21, 0), { title: "Meditations", author: "Marcus Aurelius", format: "paper", status: "reading", started: day(-12), pages: 144, publisher: "Dover" },
      "A few pages before sleeping. Book 4 so far.\n", { isbn: "9780486298238" });
    book(at(-5, 20, 10), { title: "Atomic Habits", author: "James Clear", year: 2018, format: "ebook", status: "reading", started: day(-5), pages: 320 },
      "Reading it with the Spanish practice task on Today.\n", { isbn: "9780735211292" });
    book(at(-40, 10, 0), { title: "Deep Work", author: "Cal Newport", year: 2016, status: "want" }, "", { isbn: "9781455586691" });
    book(at(-60, 18, 30), { title: "The Pragmatic Programmer", author: "David Thomas and Andrew Hunt", year: 2019, status: "want" }, "", { isbn: "9780135957059" });
    book(at(-90, 9, 0), { title: "Dune", author: "Frank Herbert", year: 1965, status: "read", started: day(-80), finished: day(-50), rating: 5, pages: 688 },
      "The desert as a character. Read the appendix on ecology.\n", { isbn: "9780441172719" });
    book(at(-120, 9, 30), { title: "Nineteen Eighty-Four", author: "George Orwell", year: 1949, format: "audio", status: "read", started: day(-110), finished: day(-95), rating: 4, pages: 328 },
      "", { isbn: "9780451524935" });
    book(at(-150, 19, 0), { title: "Sapiens", author: "Yuval Noah Harari", year: 2015, status: "read", started: day(-180), finished: day(-150), rating: 4, pages: 464 },
      "", { isbn: "9780062316097" });
    book(at(-300, 15, 0), { title: "The Little Prince", author: "Antoine de Saint-Exupéry", year: 1943, status: "read", started: day(-301), finished: day(-300), rating: 5, pages: 96 },
      "", { isbn: "9780156012195" });
    book(at(-420, 20, 0), { title: "Clean Code", author: "Robert C. Martin", year: 2008, format: "ebook", status: "read", started: day(-450), finished: day(-420), rating: 4, pages: 464 },
      "", { isbn: "9780132350884" });
    book(at(-70, 22, 0), { title: "Ulysses", author: "James Joyce", year: 1922, status: "dnf", started: day(-70), finished: day(-62),
      dnf_reason: "Not the right moment; try again some day" }, "", { isbn: "9780679722762" });
    book(at(-3, 12, 0), { title: "Project Hail Mary", author: "Andy Weir", year: 2021, status: "wishlist" },
      "Recommended by a friend. Look for a used copy.\n", { isbn: "9780593135204" });
    book(at(-8, 12, 0), { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", year: 2017, status: "wishlist",
      buy_url: "https://dataintensive.net/" }, "", { isbn: "9781449373320" });
    // Text from George Long's public-domain translation (Project Gutenberg #15877), the one in
    // the Dover edition, checked word for word.
    quote(medTitle, at(-11, 21, 40), { page: 31, chapter: "Book IV, 3", tags: "[change]" }, "The universe is transformation: life is opinion.");
    quote(medTitle, at(-10, 22, 5), { page: 33, chapter: "Book IV, 17", tags: "[time, death]", last_reviewed: day(-5) },
      "Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good.",
      "Read it again before planning the week.\n");
    quote(medTitle, at(-2, 22, 30), { page: 141, chapter: "Book X, 16", tags: "[action]" },
      "No longer talk at all about the kind of man that a good man ought to be, but be such.");
  }

  // ---- Thoughts ----
  // Own thoughts only: the built-in library already shows checked quotes.
  const thought = (created, data, text) => {
    const c = isoMinute(created);
    out.push([`thoughts/${stamp(created)}.md`, file({ type: "thought", created: c, modified: c, ...data }, `${text}\n`)]);
  };
  thought(at(-6, 22, 10), { kind: "mine", themes: T("[action, work]", "[ação, trabalho]"), favorite: true },
    T("Finishing a small thing today beats planning a big thing for next month.", "Terminar uma coisa pequena hoje vale mais que planejar uma grande para o mês que vem."));
  thought(at(-2, 7, 45), { kind: "mine", themes: T("[learning]", "[aprendizado]") },
    T("When I feel behind, it helps to list what I already learned this year.", "Quando me sinto atrasado, ajuda listar o que já aprendi este ano."));
  thought(at(-20, 19, 30), {
    kind: "uncertain", author: T("Plato", "Platão"), themes: T("[kindness]", "[gentileza]"),
    notes: T("Shared online as Plato, but it is not in his dialogues. Quote Investigator traces a similar line to Ian Maclaren (1897).",
      "Circula como de Platão, mas não está nos diálogos. O Quote Investigator liga uma frase parecida a Ian Maclaren (1897)."),
  }, T("Be kind, for everyone you meet is fighting a hard battle.", "Seja gentil, pois cada pessoa que você encontra está travando uma dura batalha."));

  // ---- Journal ----
  // Past days only, so writing today's entry can be tried from an empty page.
  const LEARN = T("Learnings", "Aprendizados");
  const entry = (n, mood, body) => {
    const c = isoMinute(at(n, 22, 15));
    out.push([`journal/${day(n)}.md`, file({ type: "journal", created: c, modified: c, ...(mood && { mood }) }, body)]);
  };
  entry(-1, "calm",
    T("Slow morning, then two hours on the portfolio. Walked to the market in the evening.\n\n## Learnings\n\nStopping at a good point makes it easy to start again the next day.\n",
      "Manhã tranquila, depois duas horas no portfólio. Fui a pé ao mercado no fim da tarde.\n\n## Aprendizados\n\nParar num bom ponto facilita recomeçar no dia seguinte.\n"));
  entry(-2, "hectic",
    T("Meetings all morning, then the bank, then the bus broke down halfway home.\n\n## Important events\n\n- Sent the quote to the client.\n\n## Personal notes\n\nI got annoyed in the queue and it did not help at all.\n",
      "Reuniões a manhã toda, depois o banco, e o ônibus quebrou no meio do caminho.\n\n## Acontecimentos importantes\n\n- Enviei o orçamento para o cliente.\n\n## Notas pessoais\n\nFiquei irritado na fila e não adiantou nada.\n"));
  entry(-4, "tiring", T("Bad night of sleep. Did only the essentials and went to bed early.\n", "Noite mal dormida. Fiz só o essencial e dormi cedo.\n"));
  entry(-7, "good",
    T(`Long call with an old friend. Good to remember how much changed in a year.\n\n## ${LEARN}\n\nAsking for help early saves a week of guessing.\n`,
      `Ligação longa com um amigo antigo. Bom lembrar o quanto mudou em um ano.\n\n## ${LEARN}\n\nPedir ajuda cedo poupa uma semana de tentativa e erro.\n`));
  entry(-12, "hard", "");

  // ---- Review ----
  // Past days only (blank questions are hidden there; "Show the blank questions" brings them back).
  const review = (n, data, body) => {
    const c = isoMinute(at(n, 22, 40));
    out.push([`review/${day(n)}.md`, file({ type: "review", created: c, modified: c, ...data }, body)]);
  };
  review(-1, { virtues: "[wisdom, temperance]", develop: "[courage]" },
    T("## Gratitude\n\nA quiet morning and a walk to the market.\n\n## Done well\n\nStopped working at a good point instead of pushing until late.\n\n## Up to me\n\nHow many hours I spent on the screen, and when I stopped.\n\n## Intentions for tomorrow\n\nWrite the three portfolio texts before lunch.\n",
      "## Gratidão\n\nUma manhã tranquila e uma caminhada até o mercado.\n\n## O que fiz bem\n\nParei de trabalhar num bom ponto em vez de ir até tarde.\n\n## Depende de mim\n\nQuantas horas passei na tela, e quando parei.\n\n## Intenções para amanhã\n\nEscrever os três textos do portfólio antes do almoço.\n"));
  review(-2, { develop: "[temperance]" },
    T("## Difficulties\n\nGot annoyed in the bank queue and was short with the clerk.\n\n## Not up to me\n\nThe queue and the bus breaking down.\n\n## Repair\n\nBe kind to the clerk next time; it was not their fault.\n",
      "## Dificuldades\n\nFiquei irritado na fila do banco e fui seco com o atendente.\n\n## Não depende de mim\n\nA fila e o ônibus quebrado.\n\n## Reparar\n\nSer gentil com o atendente da próxima vez; a culpa não era dele.\n"));
  review(-7, { virtues: "[justice]" },
    T("## Gratitude\n\nOld friends who still call.\n\n## Done well\n\nAsked for help instead of guessing for another week.\n",
      "## Gratidão\n\nAmigos antigos que ainda ligam.\n\n## O que fiz bem\n\nPedi ajuda em vez de ficar mais uma semana tentando sozinho.\n"));

  // ---- Trash ----
  const old = at(-12, 9, 0);
  const oldTitle = T("Print the boarding pass", "Imprimir o cartão de embarque");
  const trashed = `.trash/todo/${stamp(old)}-${slug(oldTitle)}.md`;
  out.push([trashed, file({ type: "todo", created: isoMinute(old), modified: isoMinute(old), status: "open", when: day(-11) },
    `# ${oldTitle}\n`)]);
  return { files: out, covers, binaries, fixed, trashIndex: { [trashed]: { from: trashed.slice(7), at: isoMinute(at(-1, 19, 0)) } } };
}

const sampleLists = lang => [
  { id: "home", name: lang === "pt" ? "Casa" : "Home", color: "h1" },
  { id: "study", name: lang === "pt" ? "Estudo" : "Study", color: "accent" },
  { id: "work", name: lang === "pt" ? "Trabalho" : "Work", color: "h2" },
  { id: "errands", name: lang === "pt" ? "Rua" : "Errands", color: "h3" },
  { id: "health", name: lang === "pt" ? "Saúde" : "Health", color: "ok" },
];

// ---- Folder access: this PC, or the phone over adb ----

function local(dir) {
  const abs = rel => path.join(dir, rel);
  return {
    read: rel => (fs.existsSync(abs(rel)) ? fs.readFileSync(abs(rel), "utf8") : null),
    write: (rel, text) => {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), text);
    },
    remove: rel => fs.rmSync(abs(rel), { force: true }),
    /** Removes a folder only if it is empty (a sample book folder after its book.md went). */
    removeDirIfEmpty: rel => {
      try {
        fs.rmdirSync(abs(rel));
      } catch {
        /* not empty or not there: keep it */
      }
    },
    /** Every .md file under the folder with a `sample: true` line. */
    findSamples: () => {
      const found = [];
      const walk = rel => {
        for (const e of fs.readdirSync(abs(rel), { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(r);
          else if (e.name.endsWith(".md") && /^sample: true$/m.test(fs.readFileSync(abs(r), "utf8"))) found.push(r);
        }
      };
      walk("");
      return found;
    },
  };
}

function phone() {
  const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8" });
  const q = rel => `'${PHONE_DIR}/${rel.replace(/'/g, "")}'`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polaris-sample-"));
  return {
    read: rel => {
      try {
        return adb("shell", `cat ${q(rel)} 2>/dev/null || true`) || null;
      } catch {
        return null;
      }
    },
    write: (rel, text) => {
      const f = path.join(tmp, "f");
      fs.writeFileSync(f, text);
      adb("shell", `mkdir -p ${q(path.dirname(rel))}`);
      adb("push", f, `${PHONE_DIR}/${rel}`);
    },
    remove: rel => adb("shell", `rm -f ${q(rel)}`),
    removeDirIfEmpty: rel => adb("shell", `rmdir ${q(rel)} 2>/dev/null || true`),
    findSamples: () =>
      adb("shell", `cd '${PHONE_DIR}' && grep -rlx --include='*.md' 'sample: true' . || true`)
        .split("\n")
        .map(l => l.trim().replace(/^\.\//, ""))
        .filter(Boolean),
  };
}

function readJson(io, rel, fallback) {
  try {
    const t = io.read(rel);
    return t ? JSON.parse(t) : fallback;
  } catch {
    return fallback;
  }
}

const areaOf = rel => rel.split("/")[0];

/**
 * Adds the samples of every area that has none yet, so running `add` again after a new stage
 * only brings that stage's samples (older manifests have no `areas`: taken from their files).
 */
async function add(io, { lang, demo }) {
  const m = readJson(io, MANIFEST, null);
  const had = new Set(m ? (m.areas ?? m.files.map(areaOf)) : []);
  const { files: all, covers, binaries, fixed, trashIndex } = samples(lang, demo);
  const known = new Set([...(m?.files ?? []), ...(m?.binaries ?? [])]);
  const isNew = rel => !had.has(areaOf(rel)) || (fixed.has(rel) && !known.has(rel) && io.read(rel) === null);
  const files = all.filter(([rel]) => isNew(rel));
  if (!files.length && !binaries.some(([rel]) => isNew(rel) && io.read(rel) === null)) {
    console.log("Sample data is already there. Run `remove` first to make it again with today's dates.");
    return;
  }
  // Never over a file of the user's (a subject folder with the same name, say).
  const taken = files.filter(([rel]) => io.read(rel) !== null).map(([rel]) => rel);
  for (const rel of taken) console.log(`Kept the existing ${rel} (no sample written there).`);
  for (const [rel, text] of files) if (!taken.includes(rel)) io.write(rel, text);
  const bins = binaries.filter(([rel]) => isNew(rel) && io.read(rel) === null);
  for (const [rel, data] of bins) io.write(rel, data);
  let addedLists = [];
  if (files.some(([rel]) => areaOf(rel) === "todo")) {
    const lists = readJson(io, LISTS, { lists: [] });
    const ids = new Set(lists.lists.map(l => l.id));
    addedLists = sampleLists(lang).filter(l => !ids.has(l.id));
    io.write(LISTS, JSON.stringify({ ...lists, lists: [...lists.lists, ...addedLists] }, null, 2) + "\n");
  }
  if (files.some(([rel]) => areaOf(rel) === ".trash")) {
    const index = readJson(io, ".trash/.deleted.json", {});
    io.write(".trash/.deleted.json", JSON.stringify({ ...index, ...trashIndex }, null, 2) + "\n");
  }
  let got = 0;
  for (const [dir, src] of covers) {
    if (had.has("books")) break;
    const data = await fetchCover(src);
    if (data) {
      io.write(`${dir}/cover.jpg`, data);
      got++;
    }
  }
  if (covers.length && !had.has("books")) console.log(`Covers: ${got} of ${covers.length} downloaded.`);
  if (demo) {
    const settings = readJson(io, ".polaris/settings.json", { theme: "dark" });
    io.write(".polaris/settings.json", JSON.stringify({ ...settings, language: lang === "pt" ? "pt-BR" : "en" }, null, 2) + "\n");
  }
  const manifest = {
    files: [...(m?.files ?? []), ...files.map(f => f[0]).filter(rel => !taken.includes(rel))],
    binaries: [...(m?.binaries ?? []), ...bins.map(f => f[0])],
    lists: [...(m?.lists ?? []), ...addedLists.map(l => l.id)],
    areas: [...new Set([...had, ...files.map(([rel]) => areaOf(rel))])],
  };
  io.write(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Added ${files.length} sample files (${[...new Set(files.map(([r]) => areaOf(r)))].join(", ")}) and ${addedLists.length} lists.`);
}

function remove(io) {
  const m = readJson(io, MANIFEST, null);
  const files = io.findSamples();
  for (const rel of files) io.remove(rel);
  // A sample book is a folder: drop it too when nothing of the user's is inside.
  for (const rel of files) if (/^(\.trash\/)?books\/[^/]+\/quotes\/[^/]+\.md$/.test(rel)) io.removeDirIfEmpty(path.posix.dirname(rel));
  // Its cover goes with it (the book file is a sample, so the cover is too).
  for (const rel of files)
    if (/^(\.trash\/)?books\/[^/]+\/book\.md$/.test(rel)) {
      io.remove(`${path.posix.dirname(rel)}/cover.jpg`);
      io.removeDirIfEmpty(path.posix.dirname(rel));
    }
  // Sample projects too: the step folders, then the project folder.
  for (const rel of files) if (/^(\.trash\/)?projects\/[^/]+\/[^/]+\/[^/]+\.md$/.test(rel)) io.removeDirIfEmpty(path.posix.dirname(rel));
  for (const rel of files) if (/^(\.trash\/)?projects\/[^/]+\/project\.md$/.test(rel)) io.removeDirIfEmpty(path.posix.dirname(rel));
  // Sample attachments (no header to mark them), then the study folders left empty.
  for (const rel of m?.binaries ?? []) io.remove(rel);
  const studyDirs = new Set();
  for (const rel of [...files, ...(m?.binaries ?? [])])
    if (rel.startsWith("study/"))
      for (let d = path.posix.dirname(rel); d.split("/").length > 1; d = path.posix.dirname(d)) studyDirs.add(d);
  for (const d of [...studyDirs].sort((a, b) => b.split("/").length - a.split("/").length)) io.removeDirIfEmpty(d);
  const index = readJson(io, ".trash/.deleted.json", {});
  for (const k of files) delete index[k];
  if (Object.keys(index).length) io.write(".trash/.deleted.json", JSON.stringify(index, null, 2) + "\n");
  else io.remove(".trash/.deleted.json");
  const lists = readJson(io, LISTS, null);
  if (lists && m) {
    lists.lists = lists.lists.filter(l => !m.lists.includes(l.id));
    io.write(LISTS, JSON.stringify(lists, null, 2) + "\n");
  }
  io.remove(MANIFEST);
  console.log(`Removed ${files.length} sample files.`);
}

/** A cover from Open Library ({ isbn } or { id }), or null when offline or missing. */
async function fetchCover(src) {
  const url = src.isbn
    ? `https://covers.openlibrary.org/b/isbn/${src.isbn}-L.jpg?default=false`
    : `https://covers.openlibrary.org/b/id/${src.id}-L.jpg`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const [cmd, target] = args.filter((a, i) => args[i - 1] !== "--lang" && (a === "--phone" || !a.startsWith("--")));
const langAt = args.indexOf("--lang");
const lang = langAt >= 0 ? args[langAt + 1] : "en";
if (!["add", "remove"].includes(cmd) || !target || !["en", "pt"].includes(lang)) {
  console.log("usage: node tools/sample-data.mjs add|remove <folder>|--phone [--lang en|pt] [--demo]");
  process.exit(1);
}
const io = target === "--phone" ? phone() : local(path.resolve(target));
if (cmd === "add") await add(io, { lang, demo: args.includes("--demo") });
else remove(io);

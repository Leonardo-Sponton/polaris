// Local AI (PC only): drafts flashcards from a study text with a GGUF model run by llama.cpp
// (node-llama-cpp). Nothing leaves the computer. The model file is chosen by the user in
// Settings; it is loaded on first use and let go after a few idle minutes to free the memory.

let llama = null;
let loaded = null; // { path, model }
let idleTimer = null;
let running = null; // AbortController of the generation in progress

const IDLE_MS = 5 * 60_000;
// About 4 characters per token: pieces of ~3000 tokens leave room for the answer in 8192.
const PIECE_CHARS = 12_000;

async function lib() {
  return import("node-llama-cpp");
}

async function getModel(modelPath) {
  clearTimeout(idleTimer);
  if (loaded && loaded.path === modelPath) return loaded.model;
  await unload();
  const { getLlama } = await lib();
  if (!llama) llama = await getLlama({ gpu: "auto" });
  const model = await llama.loadModel({ modelPath });
  loaded = { path: modelPath, model };
  return model;
}

async function unload() {
  clearTimeout(idleTimer);
  const m = loaded?.model;
  loaded = null;
  if (m) await m.dispose().catch(() => {});
}

/** Splits a long text at blank lines into pieces of about PIECE_CHARS. */
function pieces(text) {
  const out = [];
  let cur = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (cur && cur.length + para.length > PIECE_CHARS) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n\n" : "") + para;
    while (cur.length > PIECE_CHARS * 1.5) {
      out.push(cur.slice(0, PIECE_CHARS));
      cur = cur.slice(PIECE_CHARS);
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const SYSTEM = {
  en: "You write flashcards for spaced repetition from study material. Write in English.",
  pt: "Você cria flashcards para repetição espaçada a partir de material de estudo. Escreva em português do Brasil.",
};

const RULES = {
  en: n =>
    `Make ${n} flashcards from the text below. Rules:
- One idea per card; the question makes sense without the text.
- Short answers (at most 25 words). No yes/no questions.
- Cover the most important concepts, definitions, differences and common mistakes; skip trivia.
- Code, commands and names in \`backticks\`.
- Only facts that are in the text.`,
  pt: n =>
    `Crie ${n} flashcards a partir do texto abaixo. Regras:
- Uma ideia por cartão; a pergunta faz sentido sem o texto.
- Respostas curtas (no máximo 25 palavras). Nada de perguntas de sim/não.
- Cubra os conceitos, definições, diferenças e erros comuns mais importantes; ignore detalhes sem importância.
- Código, comandos e nomes entre \`crases\`.
- Somente fatos que estão no texto.`,
};

const SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" } },
        required: ["front", "back"],
      },
    },
  },
  required: ["cards"],
};

/** "::" outside `code` would break the card syntax of the notes: it becomes "∷". */
const clean = s =>
  String(s)
    .replace(/\s*\n\s*/g, " ")
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/::+/g, "∷")))
    .join("")
    .trim();

/**
 * Drafts `count` cards from `text`. `onProgress(done, total)` reports finished pieces.
 * Returns [{ front, back }].
 */
async function makeCards({ modelPath, text, count, lang }, onProgress) {
  if (running) throw new Error("busy");
  const l = lang === "pt" ? "pt" : "en";
  const parts = pieces(String(text));
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  running = new AbortController();
  const signal = running.signal;
  try {
    const model = await getModel(modelPath);
    const { LlamaChatSession } = await lib();
    const grammar = await llama.createGrammarForJsonSchema(SCHEMA);
    const context = await model.createContext({ contextSize: 8192 });
    const out = [];
    try {
      for (let i = 0; i < parts.length; i++) {
        // A short text gives fewer cards (about one per 300 characters), so they do not repeat.
        const n = Math.max(1, Math.min(Math.round((count * parts[i].length) / total), Math.ceil(parts[i].length / 300)));
        const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: SYSTEM[l] });
        onProgress?.(i, parts.length);
        const answer = await session.prompt(`${RULES[l](n)}\n\n---\n${parts[i]}\n---`, {
          grammar,
          maxTokens: 120 * n + 200,
          temperature: 0.3,
          signal,
          stopOnAbortSignal: true,
        });
        session.dispose({ disposeSequence: true });
        if (signal.aborted) break;
        try {
          for (const c of grammar.parse(answer).cards ?? []) {
            const front = clean(c.front);
            const back = clean(c.back);
            if (front && back) out.push({ front, back });
          }
        } catch {
          // A cut-off answer (cancelled or too long): keep the cards of the other pieces.
        }
      }
    } finally {
      await context.dispose();
    }
    onProgress?.(parts.length, parts.length);
    return out;
  } finally {
    running = null;
    idleTimer = setTimeout(unload, IDLE_MS);
  }
}

function cancel() {
  running?.abort();
}

module.exports = { makeCards, cancel, unload };

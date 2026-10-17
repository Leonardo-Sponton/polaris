#!/usr/bin/env node
// Sample data, to see every screen filled in. Dates are relative to today, so Today, Upcoming
// and the reminders always have something. Each file carries `sample: true` (the app keeps that
// line when it saves, also in the next copy of a repeating task), and `remove` deletes every
// file that has it, in the trash too. Delete the line from a file to keep that file.
// .hypomnemata/sample-files.json records that samples were added and which lists are theirs.
//
//   node tools/sample-data.mjs add <folder>       add to a data folder on this PC
//   node tools/sample-data.mjs remove <folder>
//   node tools/sample-data.mjs add --phone        add to the phone's data folder over adb
//   node tools/sample-data.mjs remove --phone
//
// Later stages add their own samples here (books, journal…); `add` again brings only new areas.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ADB = process.env.ADB || path.join(os.homedir(), "Android/Sdk/platform-tools/adb");
const PHONE_DIR = "/storage/emulated/0/Documents/Hypomnemata";
const MANIFEST = ".hypomnemata/sample-files.json";
const LISTS = ".hypomnemata/lists.json";

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

function file(data, body) {
  const head = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${yamlValue(v)}`)
    .join("\n");
  return `---\n${head}\nsample: true\n---\n${body}`;
}

function samples() {
  const out = []; // [relative path, text]
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

  // A reminder a few minutes from now, to see one arrive.
  const soon = new Date(NOW.getTime() + 5 * 60_000);
  const soonDay = Math.round((new Date(soon.getFullYear(), soon.getMonth(), soon.getDate()) - TODAY) / 86_400_000);

  // ---- Today ----
  task(at(-3, 21, 10), "Review chapter 3 of Clean Code", { when: day(0), time: "19:30", list: "study", priority: 1 },
    "Focus on naming and small functions.\n\n- [x] Read the chapter\n- [x] Write down the main rules\n- [ ] Redo the exercise\n- [ ] Compare with my own code\n");
  task(at(-5, 9, 0), "Pay the internet bill", { due: day(0), list: "home", priority: 2 });
  task(at(-1, 18, 40), "Buy bread and coffee", { when: day(0), list: "errands" },
    "- [ ] Bread\n- [ ] Coffee\n- [ ] Milk\n");
  task(at(-10, 7, 0), "Stretch for 10 minutes", { when: day(0), evening: true, repeat: "FREQ=DAILY", list: "health" });
  task(at(-6, 12, 30), "Reply to the course coordinator", { when: day(-2), list: "study", priority: 1 },
    "About the class schedule.\n");
  task(at(-9, 8, 15), "Water the plants", { when: day(0), repeat: "FREQ=DAILY;INTERVAL=3", list: "home" });
  task(at(0, NOW.getHours(), NOW.getMinutes()), "Sample reminder: watch it arrive",
    { when: day(soonDay), time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}` },
    "This task reminds a few minutes after the sample data was added.\n");

  // ---- Upcoming ----
  task(at(-4, 10, 5), "Dentist appointment", { when: day(1), time: "14:00", remind: `${day(1)}T13:00`, list: "health" },
    "Reminder one hour before, to have time to get there.\n");
  task(at(-2, 20, 0), "Submit the course assignment", { when: day(3), due: day(4), list: "study", priority: 1 },
    "## Checklist\n\n- [ ] Diagrams\n- [ ] Code on GitHub\n- [ ] PDF report\n");
  task(at(-14, 18, 0), "Weekly review", { when: nextWeekday(0), time: "18:00", repeat: "FREQ=WEEKLY;BYDAY=SU" },
    "- [ ] Empty the inbox\n- [ ] Look at Upcoming\n- [ ] Pick 3 goals for the week\n");
  task(at(-1, 11, 20), "Renew the bus card", { when: day(6), list: "errands" });
  task(at(-20, 9, 0), "Pay the rent", { when: nextMonthDay(5), repeat: "FREQ=MONTHLY;BYMONTHDAY=5", list: "home", priority: 2 });

  // ---- Anytime ----
  task(at(-7, 22, 0), "Clean up the Downloads folder", { list: "home" });
  task(at(-8, 15, 45), "Try the Pomodoro technique for a week", { list: "study", priority: 3 });
  task(at(-2, 9, 30), "Back up the phone photos", {}, "Use the USB cable; keep a copy on the PC.\n");

  // ---- Someday ----
  task(at(-30, 23, 0), "Learn to play the guitar", { when: "someday" });
  task(at(-25, 19, 0), "Visit Ouro Preto", { when: "someday" }, "Best in the dry season (May to September).\n");

  // ---- Logbook ----
  task(at(-4, 8, 0), "Install Hypomnemata on the tablet", { status: "done", done_at: isoMinute(at(-1, 20, 10)) });
  task(at(-6, 10, 0), "Call the bank", { status: "canceled", done_at: isoMinute(at(-3, 16, 0)) });
  task(at(-1, 7, 30), "Read 20 pages", { status: "done", done_at: isoMinute(at(0, 8, 15)), list: "study" });

  // ---- Inbox ----
  inbox(at(-1, 23, 12), "# A bookshelf screen with covers\n\nLike a real shelf, sorted by status.\n");
  inbox(at(0, 7, 45), "Ask about the library opening hours\n");
  inbox(at(-2, 14, 3), "Song to learn: Clair de Lune, Debussy\n");
  inbox(at(0, 9, 2), "Does the library open on Saturday?\n");

  // ---- Ideas ----
  const idea = (created, title, data, rest = "", seen = 0) => {
    const c = new Date(created.getTime() + sec++ * 1000);
    const rel = `ideas/${isoDate(c).replace(/-/g, "")}-${slug(title)}.md`;
    const body = rest ? `# ${title}\n\n${rest}` : `# ${title}\n`;
    const d = { type: "idea", created: isoMinute(c), modified: isoMinute(c), status: "draft", template: "blank", ...data };
    out.push([rel, file({ ...d, last_seen: day(seen) }, body)]);
  };
  idea(at(-2, 22, 40), "Study group app for classmates", { template: "software", tags: "[app, study]" },
    "Something to split the subjects and share summaries before the tests.\n\n## Problem\n\nEveryone studies alone and the group chat gets lost.\n\n## For whom\n\nMy class (about 30 people).\n", -2);
  idea(at(-20, 19, 15), "Sell homemade granola at the fair", { status: "maturing", template: "business", tags: "[money]" },
    "Saturday fair near home. Start with 20 jars and see.\n\n## Problem\n\nPeople there ask for healthy snacks and there are none.\n\n## Risks\n\n- Health rules for selling food\n- The cost of the jars\n", -18);
  idea(at(-1, 8, 5), "Morning routine without the phone", { template: "personal", tags: "[life]" },
    "First hour of the day: water, stretch, read. Phone only after breakfast.\n", -1);
  idea(at(-30, 21, 0), "Podcast about everyday science", { tags: "[hobby]" }, "", -28);
  idea(at(-45, 14, 30), "Bike delivery for the neighbourhood", {
    status: "archived", template: "business", archived_reason: "The hills here make it too slow, and apps already do it",
  }, "Deliveries for the small shops on my street.\n", -40);

  // ---- Trash ----
  const old = at(-12, 9, 0);
  const trashed = `.trash/todo/${stamp(old)}-print-the-boarding-pass.md`;
  out.push([trashed, file({ type: "todo", created: isoMinute(old), modified: isoMinute(old), status: "open", when: day(-11) },
    "# Print the boarding pass\n")]);
  return { files: out, trashIndex: { [trashed]: { from: trashed.slice(7), at: isoMinute(at(-1, 19, 0)) } } };
}

const SAMPLE_LISTS = [
  { id: "home", name: "Home", color: "h1" },
  { id: "study", name: "Study", color: "accent" },
  { id: "errands", name: "Errands", color: "h3" },
  { id: "health", name: "Health", color: "ok" },
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hypo-sample-"));
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
function add(io) {
  const m = readJson(io, MANIFEST, null);
  const had = new Set(m ? (m.areas ?? m.files.map(areaOf)) : []);
  const { files: all, trashIndex } = samples();
  const files = all.filter(([rel]) => !had.has(areaOf(rel)));
  if (!files.length) {
    console.log("Sample data is already there. Run `remove` first to make it again with today's dates.");
    return;
  }
  for (const [rel, text] of files) io.write(rel, text);
  let addedLists = [];
  if (files.some(([rel]) => areaOf(rel) === "todo")) {
    const lists = readJson(io, LISTS, { lists: [] });
    const ids = new Set(lists.lists.map(l => l.id));
    addedLists = SAMPLE_LISTS.filter(l => !ids.has(l.id));
    io.write(LISTS, JSON.stringify({ ...lists, lists: [...lists.lists, ...addedLists] }, null, 2) + "\n");
  }
  if (files.some(([rel]) => areaOf(rel) === ".trash")) {
    const index = readJson(io, ".trash/.deleted.json", {});
    io.write(".trash/.deleted.json", JSON.stringify({ ...index, ...trashIndex }, null, 2) + "\n");
  }
  const manifest = {
    files: [...(m?.files ?? []), ...files.map(f => f[0])],
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

const [cmd, target] = process.argv.slice(2);
if (!["add", "remove"].includes(cmd) || !target) {
  console.log("usage: node tools/sample-data.mjs add|remove <folder>|--phone");
  process.exit(1);
}
const io = target === "--phone" ? phone() : local(path.resolve(target));
(cmd === "add" ? add : remove)(io);

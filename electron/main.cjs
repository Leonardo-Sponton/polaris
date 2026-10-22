// Electron main process: opens the window and gives the page a small, restricted file API.
// The page itself has no Node.js access (contextIsolation on, nodeIntegration off).
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification, Tray, nativeImage } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const adb = require("./adb.cjs");

const configFile = () => path.join(app.getPath("userData"), "config.json");

// The PDF saved last (opened by the toast's "Open") and its folder (offered next time).
let lastPdf = null;
let lastPdfDir = null;

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

let dataDir = readConfig().dataDir || null;

// Turns a relative data path into an absolute one, refusing anything outside the data folder.
function resolve(rel) {
  if (!dataDir) throw new Error("No data folder chosen");
  if (typeof rel !== "string" || rel.startsWith("/") || rel.split("/").some(p => p === ".." || p === ".")) {
    throw new Error(`Invalid path: ${rel}`);
  }
  const abs = path.resolve(dataDir, rel);
  if (abs !== dataDir && !abs.startsWith(dataDir + path.sep)) throw new Error(`Invalid path: ${rel}`);
  return abs;
}

async function atomicWrite(rel, data) {
  const abs = resolve(rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  const fh = await fsp.open(tmp, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, abs);
}

const info = (name, st) => ({ name, isDir: st.isDirectory(), size: st.size, mtime: Math.floor(st.mtimeMs) });

const handlers = {
  "config:get": () => ({ dataDir, defaultDataDir: path.join(os.homedir(), "Polaris"), platform: "electron" }),
  "config:setDataDir": async (_e, dir) => {
    if (typeof dir !== "string" || !path.isAbsolute(dir)) throw new Error("Folder must be an absolute path");
    await fsp.mkdir(dir, { recursive: true });
    dataDir = path.resolve(dir);
    writeConfig({ ...readConfig(), dataDir });
    startWatch();
    return dataDir;
  },
  "dialog:pickFolder": async e => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled ? null : r.filePaths[0];
  },
  "dialog:saveBackup": async (e, name, data) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: path.join(os.homedir(), path.basename(String(name))),
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, Buffer.from(data));
    return r.filePath;
  },
  "fs:list": async (_e, dir) => {
    const abs = dir ? resolve(dir) : resolve("");
    let names;
    try {
      names = await fsp.readdir(abs);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    const out = [];
    for (const n of names) {
      if (n.includes(".tmp-")) continue;
      try {
        out.push(info(n, await fsp.stat(path.join(abs, n))));
      } catch {
        /* removed meanwhile */
      }
    }
    return out;
  },
  "fs:stat": async (_e, rel) => {
    try {
      const abs = resolve(rel);
      return info(path.basename(abs), await fsp.stat(abs));
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
  "fs:read": (_e, rel) => fsp.readFile(resolve(rel), "utf8"),
  "fs:readBinary": async (_e, rel) => new Uint8Array(await fsp.readFile(resolve(rel))),
  "fs:write": (_e, rel, text) => atomicWrite(rel, text),
  "fs:writeBinary": (_e, rel, data) => atomicWrite(rel, Buffer.from(data)),
  "fs:move": async (_e, from, to) => {
    const dst = resolve(to);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(resolve(from), dst);
  },
  "fs:remove": (_e, rel) => fsp.rm(resolve(rel), { recursive: true, force: true }),
  "shell:openFolder": () => dataDir && shell.openPath(dataDir),
  // PDF export (ui/pdf.ts): the page shows only the note when printed; its CSS sets the page
  // size and margins.
  "print:pdf": async (e, { name, landscape, pageSize }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    // The page margins show the window's own background: white for paper while printing.
    const bg = win.getBackgroundColor();
    win.setBackgroundColor("#ffffff");
    let data;
    try {
      data = await e.sender.printToPDF({ printBackground: true, preferCSSPageSize: true, landscape: !!landscape, pageSize: pageSize || "A4" });
    } finally {
      win.setBackgroundColor(bg);
    }
    const safe = String(name || "Polaris").replace(/[\\/:*?"<>|\n\r\t]/g, "-").trim().slice(0, 120) || "Polaris";
    // Test helper: POLARIS_PDF_OUT saves there without asking.
    const { canceled, filePath } = process.env.POLARIS_PDF_OUT ? { canceled: false, filePath: process.env.POLARIS_PDF_OUT } : await dialog.showSaveDialog(win, {
      defaultPath: path.join(lastPdfDir || app.getPath("documents"), `${safe}.pdf`),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, data);
    lastPdf = filePath;
    lastPdfDir = path.dirname(filePath);
    return filePath;
  },
  "print:openLast": () => lastPdf && shell.openPath(lastPdf),
  "shell:openSnippets": async () => {
    if (!dataDir) return;
    const dir = path.join(dataDir, ".polaris", "snippets");
    await fsp.mkdir(dir, { recursive: true });
    return shell.openPath(dir);
  },
  // Font families installed on the PC (Settings → Appearance), from fontconfig.
  "fonts:list": () =>
    new Promise(done =>
      require("child_process").execFile("fc-list", [":", "family"], { maxBuffer: 4 << 20 }, (err, out) => {
        if (err) return done([]);
        const names = new Set();
        for (const line of out.split("\n")) {
          const name = line.split(",")[0].trim();
          if (name && !/emoji|fangsong|awesome|symbol|dingbat|cursor/i.test(name)) names.add(name);
        }
        done([...names].sort((a, b) => a.localeCompare(b)));
      }),
    ),
  // Only web links: the page never gets to open files or other programs this way.
  "shell:openLink": (_e, url) => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error("Not a web link");
    return shell.openExternal(String(url));
  },
  // Attachments (school assignments) open in the system's app for their type; anything that
  // could run as a program is refused.
  "shell:openFile": async (_e, rel) => {
    const abs = resolve(rel);
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error("Not a file");
    if (/\.(desktop|sh|bash|zsh|run|bin|appimage|exe|bat|cmd|com|msi|jar|py|pl|rb)$/i.test(abs) || st.mode & 0o111)
      throw new Error("This file could run as a program; open it from the folder instead");
    const err = await shell.openPath(abs);
    if (err) throw new Error(err);
  },
  "capture:close": e => BrowserWindow.fromWebContents(e.sender)?.close(),
  "reminders:set": (_e, list) => setReminders(list),
  "app:labels": (_e, l) => setLabels(l),
  "sync:devices": () => adb.devices(),
  "sync:pcName": () => os.hostname(),
  "sync:localHashes": () => adb.localHashes(resolve("")),
  "sync:deviceHashes": (_e, serial, root) => adb.deviceHashes(String(serial), root),
  ...Object.fromEntries(
    Object.entries(adb.deviceFs).map(([op, fn]) => [`dev:${op}`, (_e, serial, root, ...args) => fn(String(serial), root, ...args)]),
  ),
};

// ---- Reminders (SPEC 5.3) ----
// The page sends the upcoming reminders whenever tasks change; this process shows them as
// desktop notifications. It checks every 20 s instead of keeping long timers, so a reminder
// that came due while the laptop slept still shows on waking up.

let reminders = [];
const shown = new Set();

function setReminders(list) {
  if (!Array.isArray(list)) return;
  reminders = list.filter(r => r && typeof r.at === "string" && typeof r.path === "string").slice(0, 200);
}

const localMinute = (d = new Date()) => {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function checkReminders() {
  const now = localMinute();
  for (const r of reminders) {
    const key = `${r.path}@${r.at}`;
    if (r.at > now || shown.has(key)) continue;
    shown.add(key);
    const n = new Notification({ title: String(r.title), body: String(r.text || labels.reminder), icon: ICON });
    n.on("click", () => {
      showMain();
      mainWindow?.webContents.send("reminder:open", r.path);
    });
    n.show();
  }
}

// ---- Tray ----
// With the tray, closing the main window only hides it, so reminders keep coming; "Quit" ends
// the app. The page stays loaded while hidden and keeps its file watcher.

const ICON = path.join(__dirname, "../resources/icon.png");
let tray = null;
let quitting = false;
// Words of the tray menu and notifications, sent by the page in the app's language.
const labels = { open: "Open Polaris", capture: "Quick capture", quit: "Quit", reminder: "Reminder" };

function setLabels(l) {
  if (!l || typeof l !== "object") return;
  for (const k of Object.keys(labels)) if (typeof l[k] === "string" && l[k]) labels[k] = l[k];
  if (tray) tray.setContextMenu(trayMenu());
}

const trayMenu = () =>
  Menu.buildFromTemplate([
    { label: labels.open, click: showMain },
    { label: labels.capture, click: () => createCaptureWindow() },
    { type: "separator" },
    { label: labels.quit, click: quit },
  ]);

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "../resources/tray.png")));
  } catch {
    tray = null; // no tray on this desktop: closing the window quits, as before
    return;
  }
  tray.setToolTip("Polaris");
  tray.setContextMenu(trayMenu());
  tray.on("click", showMain);
}

function showMain() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quit() {
  quitting = true;
  if (mainWindow) mainWindow.close();
  else app.quit();
}

let watcher = null;
let mainWindow = null;
let captureWindow = null;

const wantsCapture = argv => argv.includes("--capture");
// `--background`: start in the tray only, e.g. from Hyprland's exec-once, so reminders work
// before the window is ever opened.
const wantsBackground = argv => argv.includes("--background");

const PAGE = path.join(__dirname, "../dist/index.html");

function load(win, hash) {
  if (process.env.VITE_DEV_URL) win.loadURL(process.env.VITE_DEV_URL + (hash ? `#${hash}` : ""));
  else win.loadFile(PAGE, hash ? { hash } : undefined);
}

const webPreferences = () => ({
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
});

// 100% offline: never open or load anything from the network.
function lockDown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
}

function attachShot(win) {
  if (!process.env.POLARIS_SHOT) return;
  // Test helper: save a screenshot and quit (used to check the UI without a person watching).
  // POLARIS_SHOT_JS: a script run in the page first (clicks, typing), awaited if it returns a promise.
  // POLARIS_SHOT_ZOOM: page zoom, e.g. 0.7 to see the wide layout in a small tiled window.
  win.webContents.once("did-finish-load", () =>
    setTimeout(async () => {
      if (process.env.POLARIS_SHOT_ZOOM) win.webContents.setZoomFactor(Number(process.env.POLARIS_SHOT_ZOOM));
      if (process.env.POLARIS_SHOT_JS) {
        await win.webContents.executeJavaScript(process.env.POLARIS_SHOT_JS).catch(e => console.error(e));
        await new Promise(r => setTimeout(r, Number(process.env.POLARIS_SHOT_WAIT || 800)));
      }
      // POLARIS_SHOT=close: close the window the way the window manager does (tests saving on close).
      if (process.env.POLARIS_SHOT === "close") {
        if (process.env.POLARIS_SHOT_ZOOM && !win.isDestroyed()) win.webContents.setZoomFactor(1);
        return win.isDestroyed() || win.close();
      }
      if (!win.isDestroyed()) fs.writeFileSync(process.env.POLARIS_SHOT, (await win.webContents.capturePage()).toPNG());
      // Chromium keeps a page's zoom for the next runs: put it back so the app opens at 100%.
      if (process.env.POLARIS_SHOT_ZOOM && !win.isDestroyed()) win.webContents.setZoomFactor(1);
      app.quit();
    }, Number(process.env.POLARIS_SHOT_DELAY || 1500)),
  );
}

// Quick capture (SPEC 5.2): a small window with only the capture field. Its fixed size makes
// Hyprland float it. It has nothing unsaved to protect, so it closes at once.
function createCaptureWindow() {
  if (captureWindow) {
    captureWindow.show();
    captureWindow.focus();
    return;
  }
  captureWindow = new BrowserWindow({
    width: 560,
    height: 200,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: "#010a29",
    title: "Polaris capture",
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  lockDown(captureWindow);
  load(captureWindow, "capture");
  attachShot(captureWindow);
  captureWindow.on("closed", () => (captureWindow = null));
}

// Tells the page when a file changes outside the app (another editor, sync…).
function startWatch() {
  watcher?.close();
  watcher = null;
  if (!dataDir) return;
  try {
    watcher = fs.watch(dataDir, { recursive: true }, (_ev, file) => {
      if (!file || file.includes(".tmp-")) return;
      mainWindow?.webContents.send("fs:changed", file.split(path.sep).join("/"));
    });
  } catch {
    /* watching is a convenience; the app also checks files before saving */
  }
}

function createWindow({ hidden = false } = {}) {
  mainWindow = new BrowserWindow({
    show: !hidden,
    icon: ICON,
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: "#010a29",
    title: "Polaris",
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  lockDown(mainWindow);
  // Ctrl+= / Ctrl+- / Ctrl+0 size the interface through the app's setting (Settings →
  // Appearance), not through the built-in zoom of the default menu.
  mainWindow.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown" || !input.control || input.alt || input.meta) return;
    if (!["=", "+", "-", "0"].includes(input.key)) return;
    e.preventDefault();
    mainWindow.webContents.send("zoom:key", input.key);
  });
  load(mainWindow);
  attachShot(mainWindow);
  // Closing: give the page up to 3 s to write unsaved edits (SPEC 2.4), then close, or only
  // hide when the tray keeps the app running.
  let closing = false;
  mainWindow.on("close", e => {
    if (closing) return;
    e.preventDefault();
    closing = true;
    const win = mainWindow;
    let finished = false;
    const done = () => {
      if (finished || win.isDestroyed()) return;
      finished = true;
      ipcMain.removeListener("app:flushed", done);
      if (tray && !quitting) {
        closing = false;
        win.hide();
      } else {
        win.destroy();
      }
    };
    ipcMain.on("app:flushed", done);
    setTimeout(done, 3000);
    win.webContents.send("app:closing");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (quitting) app.quit();
  });
}

if (process.env.POLARIS_CONFIG_DIR) app.setPath("userData", process.env.POLARIS_CONFIG_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch hands its command line to this running instance and exits.
  app.on("second-instance", (_e, argv) => {
    if (wantsCapture(argv)) return createCaptureWindow();
    if (!process.env.POLARIS_SHOT) createTray();
    if (wantsBackground(argv) && tray) return;
    showMain();
  });
  app.whenReady().then(() => {
    dataDir = readConfig().dataDir || null;
    for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
    startWatch();
    setInterval(checkReminders, 20_000);
    if (wantsCapture(process.argv)) return createCaptureWindow();
    // Test runs (POLARIS_SHOT) never leave a tray process behind.
    if (!process.env.POLARIS_SHOT) createTray();
    createWindow({ hidden: wantsBackground(process.argv) && !!tray });
  });
  // Without a tray (or when started only for a quick capture) the last closed window ends the app.
  app.on("window-all-closed", () => {
    if (!tray || quitting) app.quit();
  });
}

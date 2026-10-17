// Electron main process: opens the window and gives the page a small, restricted file API.
// The page itself has no Node.js access (contextIsolation on, nodeIntegration off).
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const configFile = () => path.join(app.getPath("userData"), "config.json");

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
  "config:get": () => ({ dataDir, defaultDataDir: path.join(os.homedir(), "Hypomnemata"), platform: "electron" }),
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
};

let watcher = null;
let mainWindow = null;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: "#010a29",
    title: "Hypomnemata",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 100% offline: never open or load anything from the network.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", e => e.preventDefault());
  if (process.env.VITE_DEV_URL) mainWindow.loadURL(process.env.VITE_DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  if (process.env.HYPO_SHOT) {
    // Test helper: save a screenshot and quit (used to check the UI without a person watching).
    mainWindow.webContents.once("did-finish-load", () =>
      setTimeout(async () => {
        fs.writeFileSync(process.env.HYPO_SHOT, (await mainWindow.webContents.capturePage()).toPNG());
        app.quit();
      }, Number(process.env.HYPO_SHOT_DELAY || 1500)),
    );
  }
  mainWindow.on("closed", () => (mainWindow = null));
}

if (process.env.HYPO_CONFIG_DIR) app.setPath("userData", process.env.HYPO_CONFIG_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    dataDir = readConfig().dataDir || null;
    for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
    startWatch();
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}

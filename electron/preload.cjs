// Bridge between the page and the main process. Only these functions are visible to the page.
const { contextBridge, ipcRenderer } = require("electron");

const call = name => (...args) => ipcRenderer.invoke(name, ...args);

contextBridge.exposeInMainWorld("hypo", {
  config: { get: call("config:get"), setDataDir: call("config:setDataDir") },
  pickFolder: call("dialog:pickFolder"),
  openFolder: call("shell:openFolder"),
  closeWindow: call("capture:close"),
  saveBackup: call("dialog:saveBackup"),
  fs: {
    list: call("fs:list"),
    stat: call("fs:stat"),
    read: call("fs:read"),
    readBinary: call("fs:readBinary"),
    write: call("fs:write"),
    writeBinary: call("fs:writeBinary"),
    move: call("fs:move"),
    remove: call("fs:remove"),
  },
  // The window is closing: run `flush`, then tell the main process it may close.
  onClosing: flush => {
    ipcRenderer.on("app:closing", async () => {
      try {
        await flush();
      } finally {
        ipcRenderer.send("app:flushed");
      }
    });
  },
  onFileChanged: cb => {
    const listener = (_e, path) => cb(path);
    ipcRenderer.on("fs:changed", listener);
    return () => ipcRenderer.removeListener("fs:changed", listener);
  },
});

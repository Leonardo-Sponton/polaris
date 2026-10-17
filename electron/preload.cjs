// Bridge between the page and the main process. Only these functions are visible to the page.
const { contextBridge, ipcRenderer } = require("electron");

const call = name => (...args) => ipcRenderer.invoke(name, ...args);

contextBridge.exposeInMainWorld("hypo", {
  config: { get: call("config:get"), setDataDir: call("config:setDataDir") },
  pickFolder: call("dialog:pickFolder"),
  openFolder: call("shell:openFolder"),
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
  onFileChanged: cb => {
    const listener = (_e, path) => cb(path);
    ipcRenderer.on("fs:changed", listener);
    return () => ipcRenderer.removeListener("fs:changed", listener);
  },
});

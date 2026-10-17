import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built files load from disk in Electron and Android.
export default defineConfig({ base: "./", plugins: [react()] });

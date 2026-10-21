import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  let credentials: { url: string; token: string } | null = null;
  if (command === "serve" && mode !== "test") {
    const envPath =
      process.env.CLACAMIEU_HA_ENV ??
      fileURLToPath(new URL("../../homeassistant/.env", import.meta.url));
    const env = parseEnv(readFileSync(envPath, "utf8"));
    if (!env.HA_URL || !env.HA_TOKEN)
      throw new Error(
        "The Home Assistant development environment is incomplete.",
      );
    credentials = { url: env.HA_URL, token: env.HA_TOKEN };
  }
  return {
    base: command === "build" ? "/clacamieu_static/" : "/",
    plugins: [react(), tailwindcss()],
    define: { __CLACAMIEU_DEV__: JSON.stringify(credentials) },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { host: "localhost", port: 5174, strictPort: true },
    build: {
      outDir: "../custom_components/clacamieu/frontend/dist",
      emptyOutDir: true,
      assetsInlineLimit: 0,
      rollupOptions: {
        input: fileURLToPath(new URL("./src/panel.tsx", import.meta.url)),
        output: {
          format: "es",
          entryFileNames: "main.js",
          assetFileNames: "assets/[name]-[hash][extname]",
          inlineDynamicImports: true,
        },
      },
    },
    test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
  };
});

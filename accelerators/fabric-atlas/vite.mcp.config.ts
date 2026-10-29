import { resolve } from "node:path";
import { defineConfig } from "vite";
import packageJson from "./package.json" with { type: "json" };

// Builds the local, read-only Atlas MCP stdio server (src/mcp/main.ts) for
// Node.js. Public deployment values come from the same VITE_* environment as
// the SPA; dependencies stay external and resolve from node_modules.
export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  build: {
    ssr: resolve(import.meta.dirname, "src/mcp/main.ts"),
    outDir: "dist-mcp",
    emptyOutDir: true,
    target: "node24",
    sourcemap: true,
    rolldownOptions: {
      output: { entryFileNames: "atlas-mcp.mjs", format: "es" },
    },
  },
});

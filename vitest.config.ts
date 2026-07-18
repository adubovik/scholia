import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // testTimeout 20s: DB integration tests run over the neon-http driver, which
  // makes one HTTP round-trip per SQL statement — slow enough behind a proxy
  // (CI/docker) to blow the 5s default on multi-statement tests.
  test: { environment: "jsdom", globals: true, include: ["**/*.test.ts", "**/*.test.tsx"], setupFiles: ["./vitest.setup.ts"], testTimeout: 20000 },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});

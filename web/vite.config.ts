import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { cpSync, existsSync, readdirSync, rmSync } from "fs"
import { join, resolve } from "path"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

function flattenClientBuild() {
  return {
    name: "flatten-client-build",
    apply: "build" as const,
    closeBundle() {
      // Run only after the SSR build (which runs after client build).
      // The SSR build needs build/client/.vite/manifest.json, so we must
      // not move files until the SSR bundle has closed.
      // @ts-ignore – Vite 6+ environment API
      if (this.environment?.name !== "ssr") return
      const clientDir = resolve(process.cwd(), "build/client")
      const buildDir = resolve(process.cwd(), "build")
      if (!existsSync(clientDir)) return
      for (const entry of readdirSync(clientDir)) {
        cpSync(join(clientDir, entry), join(buildDir, entry), { recursive: true })
      }
      rmSync(clientDir, { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), flattenClientBuild()],
  server: {
    port: 13001,
  },
  build: {
    assetsDir: "static",
  },
})

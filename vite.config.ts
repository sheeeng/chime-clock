import { execSync } from 'child_process';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

if (!process.env.VITE_GIT_COMMIT_SHA_8_CHAR) {
  try {
    process.env.VITE_GIT_COMMIT_SHA_8_CHAR =
      execSync('git rev-parse HEAD').toString().trim().slice(0, 8);
  } catch {
    // Not in a git repository or git is unavailable.
  }
}

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [
      {
        name: 'remove-unused-sylva-font',
        enforce: 'pre',
        load(id) {
          if (!id.endsWith('inner-green-3d.html?raw')) return null;
          const source = readFileSync(id.slice(0, -4), 'utf8').replace(
            /@font-face\s*\{[^}]*lexend-latin\.woff2[^}]*\}/,
            '',
          );
          return `export default ${JSON.stringify(source)};`;
        },
      },
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

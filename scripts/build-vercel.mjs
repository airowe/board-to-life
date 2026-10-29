// Builds the live site in Vercel's Build Output format (.vercel/output): the app as static files, and the two API
// routes as Node functions bundled from server/vercel.ts. Vercel runs this as the build command.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = `${root}.vercel/output`;
const ROUTES = ['understand', 'draft-questions'];
// Above the server's 120 s model budget, so a slow read ends with the server's own error.
const MAX_DURATION_SECONDS = 150;

rmSync(output, { recursive: true, force: true });
await build({ root, logLevel: 'warn', build: { outDir: `${output}/static`, emptyOutDir: true } });

const bundle = `${output}/api-bundle`;
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: 'server/vercel.ts',
    outDir: bundle,
    emptyOutDir: true,
    rollupOptions: { output: { format: 'es', entryFileNames: 'index.mjs', codeSplitting: false } },
  },
});

for (const route of ROUTES) {
  const func = `${output}/functions/api/${route}.func`;
  mkdirSync(func, { recursive: true });
  cpSync(bundle, func, { recursive: true });
  writeFileSync(`${func}/package.json`, JSON.stringify({ type: 'module' }));
  writeFileSync(
    `${func}/.vc-config.json`,
    JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: MAX_DURATION_SECONDS }),
  );
}
rmSync(bundle, { recursive: true, force: true });
writeFileSync(`${output}/config.json`, JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }));
console.log(`built ${output.replace(root, '')}: static app and ${ROUTES.map((route) => `/api/${route}`).join(', ')}`);

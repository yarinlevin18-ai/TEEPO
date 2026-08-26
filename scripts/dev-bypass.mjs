/**
 * Launch the dev server with the auth bypass ON — no .env.local needed.
 *
 *   npm run dev:bypass
 *
 * Exists because setting NEXT_PUBLIC_DEV_BYPASS_AUTH via an env file is
 * easy to get wrong on Windows (PowerShell's `echo >` writes UTF-16,
 * Notepad appends .txt, Explorer hides extensions). Spawning next dev
 * from Node with the variable injected sidesteps all of that on every
 * platform. The production hard-guard in lib/dev-auth-bypass.ts and
 * middleware.ts is untouched — this only affects `next dev`.
 *
 * Extra args pass through: `npm run dev:bypass -- -p 4000`.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
// Resolve the local Next.js CLI directly — avoids npx and PATH quirks.
const nextBin = join(dirname(require.resolve('next/package.json')), 'dist', 'bin', 'next')

const child = spawn(
  process.execPath,
  [nextBin, 'dev', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_DEV_BYPASS_AUTH: 'true' },
  },
)

child.on('exit', (code) => process.exit(code ?? 0))

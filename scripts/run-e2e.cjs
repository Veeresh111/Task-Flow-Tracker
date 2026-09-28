/* E2E runner: loads .env.local/.env.test (values never printed), then runs the
   proctoring-cv Playwright suite with required E2E_* vars. Usage:
   node scripts/run-e2e.cjs [rawToken] [faceMediaPath] [playwright args...] */
const fs = require('fs');
const path = require('path');

for (const f of ['.env.local', '.env.test']) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const rawToken = process.argv[2];
// Chrome on Windows needs a real Windows path (C:/...). MSYS "/c:/..." paths
// are silently ignored — Chrome then falls back to its builtin synthetic
// pattern, which is exactly what poisoned earlier probes.
let media = process.argv[3] || path.join(__dirname, '..', 'test-media', 'face_loop.mp4');
media = path.resolve(media).split(path.sep).join('/');
const pwArgs = process.argv.slice(4);

if (rawToken) process.env.E2E_RAW_TOKEN = rawToken;
process.env.E2E_FACE_MEDIA = media;

console.log('URL set:', !!process.env.VITE_SUPABASE_URL, '| KEY set:', !!process.env.VITE_SUPABASE_ANON_KEY);
console.log('EFFECTIVE fake-video flag:', fs.existsSync(media) ? `--use-file-for-fake-video-capture=${media}` : 'MISSING MEDIA FILE — builtin pattern will be used');

const { spawnSync } = require('child_process');
// Spawn playwright's CLI js directly with node — spawning npx.cmd is EINVAL
// on Windows (Node's .cmd spawn mitigation).
const cli = path.join(__dirname, '..', 'node_modules', '@playwright', 'test', 'cli.js');
if (!fs.existsSync(cli)) {
  console.error('playwright CLI not found at', cli);
  process.exit(9);
}
const r = spawnSync(process.execPath, [cli, 'test', ...pwArgs], {
  stdio: 'inherit', shell: false, cwd: path.join(__dirname, '..'), timeout: 590000,
});
process.exit(r.status || 0);

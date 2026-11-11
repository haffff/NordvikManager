#!/usr/bin/env node
// The browser-wasm GM host, for trying it locally (see NordvikManager.Wasm.Host/README.md in the
// Backend). Builds it and serves its page.
//
//   pnpm wasm-host                 build + serve the host page on http://localhost:8098
//   pnpm dev:wasm                  the same, plus Central (with CORS_ORIGIN covering the host page)
//                                  and the player client: everything a local game needs
//
// Options (after `--`, e.g. `pnpm dev:wasm -- --backend NordvikManager-Backend-wasm`):
//   --backend <dir>   the Backend checkout to build from (default NordvikManager-Backend); it must
//                     have NordvikManager.Wasm.Host (the wasm-host branches until they're merged)
//   --port <n>        the host page's port (default 8098)
//   --central <url>   the Central the page uses (default http://localhost:3000)
//   --no-build        serve the last build
// Build output goes to the OS temp folder, not the workspace. Needs the .NET wasm-tools workload
// (`dotnet workload install wasm-tools`).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const backend = path.resolve(root, option('backend', 'NordvikManager-Backend'));
const port = Number(option('port', '8098'));
const central = option('central', 'http://localhost:3000').replace(/\/$/, '');
const withDev = flag('dev');
const project = path.join(backend, 'NordvikManager.Wasm.Host', 'NordvikManager.Wasm.Host.csproj');
const artifacts = path.join(os.tmpdir(), 'nordvik-wasm-host');
const bundle = path.join(artifacts, 'bin', 'NordvikManager.Wasm.Host', 'release_browser-wasm', 'AppBundle');
const hostOrigin = `http://localhost:${port}`;
const playerOrigin = 'http://localhost:3001';

if (!existsSync(project)) {
    console.error(`✗ ${path.relative(root, project)} not found.`);
    console.error('  The browser host is on the Backend\'s wasm-host branches until they are merged:');
    console.error('  check one out in NordvikManager-Backend, or pass --backend <checkout that has it>.');
    process.exit(1);
}

if (!flag('no-build')) {
    console.log(`Building the browser host from ${path.relative(root, backend)} (first build takes a few minutes) ...`);
    const build = spawnSync('dotnet', ['build', project, '-c', 'Release', '--artifacts-path', artifacts, '-v', 'quiet', '-nologo'],
        { stdio: 'inherit', shell: process.platform === 'win32' });
    if (build.status !== 0) {
        console.error('✗ The build failed. Is the wasm-tools workload installed? (dotnet workload install wasm-tools)');
        process.exit(build.status ?? 1);
    }
}
if (!existsSync(path.join(bundle, 'index.html'))) {
    console.error(`✗ No build at ${bundle}; run without --no-build.`);
    process.exit(1);
}

// The page and the runtime; .wasm must be application/wasm for streaming compilation.
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
    '.json': 'application/json', '.dat': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
    let file = path.join(bundle, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(bundle)) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
});

const children = [];
function run(name, command, cwd, env = {}) {
    const child = spawn(command, { cwd: path.join(root, cwd), shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    const prefix = (line) => line && console.log(`[${name}] ${line}`);
    child.stdout.on('data', (d) => d.toString().split(/\r?\n/).forEach(prefix));
    child.stderr.on('data', (d) => d.toString().split(/\r?\n/).forEach(prefix));
    children.push(child);
}

function stop() {
    for (const child of children) {
        // The whole tree of this child only (shell, pnpm, node), by its PID.
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else child.kill('SIGTERM');
    }
    server.close();
    process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

server.listen(port, () => {
    if (withDev) {
        // dotenv keeps variables already set, so this wins over Central's .env without editing it.
        run('central', 'pnpm run dev', 'NordvikManager-Central', { CORS_ORIGIN: `${playerOrigin},${hostOrigin}` });
        run('player', 'pnpm run start_player', 'NordvikManagerFrontEnd');
    }
    console.log(`
  GM host page:   ${hostOrigin}/?central=${encodeURIComponent(central)}
                  log in as the GM, create a game, Start session (keep the tab open)
  Player client:  ${playerOrigin}/?game=<the Central session id the GM page shows>
                  another browser profile or a private window, another account
  Self-check:     ${hostOrigin}/?selfcheck   (results in the browser console)
${withDev ? '' : `
  Central must allow the host page: CORS_ORIGIN=${playerOrigin},${hostOrigin} in its .env
  (pnpm dev:wasm sets it for the Central it starts).
`}
  Games are kept in the GM browser's OPFS (one tab hosts at a time). Ctrl+C stops everything.
`);
});

#!/usr/bin/env node
// Equivalent of the former BuildRelease.ps1, invoked via `pnpm run build:release`.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = path.join(root, 'artifacts');
const frontendDir = path.join(root, 'NordvikManagerFrontEnd');
const backendProject = path.join(root, 'NordvikManager-Backend', 'NordvikManager', 'NordvikManager.csproj');
const publishOutput = path.join(artifactsDir, 'backend');

const run = (command, cwd) => execSync(command, { cwd, stdio: 'inherit' });

// The .NET runtime identifier of this machine, e.g. win-x64 or linux-arm64; override with RID=...
function currentRid() {
    const os = { win32: 'win', linux: 'linux', darwin: 'osx' }[process.platform];
    const arch = { x64: 'x64', arm64: 'arm64', ia32: 'x86', arm: 'arm' }[process.arch];
    if (!os || !arch) throw new Error(`No .NET runtime identifier for ${process.platform}/${process.arch}; set RID.`);
    return `${os}-${arch}`;
}

const isEnvAppSettings = (name) => /^appsettings\..+\.json$/i.test(name);

function removeAppSettingsRecursive(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) removeAppSettingsRecursive(full);
        else if (isEnvAppSettings(entry.name)) unlinkSync(full);
    }
}

// 1. clean previous artifacts
rmSync(artifactsDir, { recursive: true, force: true });

// 2. publish backend: only the server project (the solution would add the test projects); with a
//    RID the csproj makes one self-contained single-file executable
run(`dotnet publish "${backendProject}" -c Release -r ${process.env.RID || currentRid()} -o "${publishOutput}"`);

// 3. build frontend (gm) and copy into artifacts/wwwroot
run('pnpm run buildci_gm', frontendDir);
const wwwrootDest = path.join(artifactsDir, 'wwwroot');
mkdirSync(wwwrootDest, { recursive: true });
cpSync(path.join(frontendDir, 'dist'), wwwrootDest, { recursive: true });

// 4. build frontend (player) and copy into artifacts/player
run('pnpm run buildci_player', frontendDir);
const playerDest = path.join(artifactsDir, 'player');
mkdirSync(playerDest, { recursive: true });
cpSync(path.join(frontendDir, 'dist'), playerDest, { recursive: true });

// 5. replace environment appsettings.*.json in the publish output with the ones from repo root
if (existsSync(publishOutput)) removeAppSettingsRecursive(publishOutput);
for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && isEnvAppSettings(entry.name)) {
        copyFileSync(path.join(root, entry.name), path.join(publishOutput, entry.name));
    }
}

console.log('Build release complete.');

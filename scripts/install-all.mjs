#!/usr/bin/env node
// Installs dependencies for every repo listed in repos.json, invoked via `pnpm run install-all`.
// Detects the right install command per repo (pnpm/npm/dotnet) instead of hardcoding it,
// so newly added repos in repos.json just work without touching this file.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repos = JSON.parse(readFileSync(path.join(root, 'repos.json'), 'utf8'));

function installCommandFor(dir) {
    const hasPackageJson = existsSync(path.join(dir, 'package.json'));
    if (hasPackageJson && existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm install';
    if (hasPackageJson && existsSync(path.join(dir, 'package-lock.json'))) return 'npm install';
    if (readdirSync(dir).some((name) => name.endsWith('.sln'))) return 'dotnet restore';
    if (hasPackageJson) return 'pnpm install';
    return null;
}

for (const repo of repos) {
    const full = path.join(root, repo.path);

    if (!existsSync(full)) {
        console.warn(`⚠ ${repo.name} is not cloned locally, skipping. Run \`pnpm run repos:clone\` first.`);
        continue;
    }

    const command = installCommandFor(full);
    if (!command) {
        console.log(`- ${repo.name}: nothing to install, skipping.`);
        continue;
    }

    console.log(`Installing ${repo.name} (${command}) ...`);
    execSync(command, { cwd: full, stdio: 'inherit' });
}

console.log('Done.');

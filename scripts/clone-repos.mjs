#!/usr/bin/env node
// Clones every repo listed in repos.json into its configured path (relative to repo root),
// skipping repos that are already present. Invoked via `pnpm run repos:clone`.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'repos.json');
const repos = JSON.parse(readFileSync(manifestPath, 'utf8'));

for (const repo of repos) {
    const full = path.join(root, repo.path);

    if (existsSync(path.join(full, '.git'))) {
        console.log(`✓ ${repo.name} already present, skipping.`);
        continue;
    }

    if (!repo.url) {
        console.warn(`⚠ ${repo.name} has no remote configured (${repo.note ?? 'local-only'}) - skipping.`);
        continue;
    }

    console.log(`Cloning ${repo.name} -> ${repo.path} ...`);
    execSync(`git clone "${repo.url}" "${repo.path}"`, { cwd: root, stdio: 'inherit' });

    if (repo.upstream) {
        execSync(`git remote add upstream "${repo.upstream}"`, { cwd: full, stdio: 'inherit' });
    }
}

console.log('Done.');

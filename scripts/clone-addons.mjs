#!/usr/bin/env node
// Clones addon repos listed in NordvikManager-Addons/addons.json (the addon registry)
// into addons/<key>.
// Usage:
//   pnpm run addons:clone            -> clone every addon in the registry
//   pnpm run addons:clone -- dnd5e   -> clone only the addon(s) with the given key(s)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'NordvikManager-Addons', 'addons.json');

if (!existsSync(registryPath)) {
    console.error('NordvikManager-Addons is not present. Run `pnpm run repos:clone` first.');
    process.exit(1);
}

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

// pnpm forwards the `--` separator itself (unlike npm, which swallows it), so strip it here.
const requestedKeys = process.argv.slice(2).filter((arg) => arg !== '--');
const addons = requestedKeys.length
    ? registry.repository.filter((addon) => requestedKeys.includes(addon.key))
    : registry.repository;

const missingKeys = requestedKeys.filter((key) => !registry.repository.some((addon) => addon.key === key));
if (missingKeys.length) {
    const available = registry.repository.map((addon) => addon.key).join(', ');
    console.error(`Unknown addon key(s): ${missingKeys.join(', ')}. Available: ${available}`);
    process.exit(1);
}

for (const addon of addons) {
    const relPath = path.join('addons', addon.key);
    const full = path.join(root, relPath);

    if (existsSync(path.join(full, '.git'))) {
        console.log(`✓ ${addon.name} (${addon.key}) already present, skipping.`);
        continue;
    }

    console.log(`Cloning ${addon.name} (${addon.key}) -> ${relPath} ...`);
    execSync(`git clone "${addon.repositoryUrl}" "${relPath}"`, { cwd: root, stdio: 'inherit' });
}

console.log('Done.');

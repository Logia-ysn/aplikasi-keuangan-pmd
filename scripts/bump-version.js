#!/usr/bin/env node
/**
 * Auto-bump application version.
 *
 * Usage:
 *   node scripts/bump-version.js patch   # 1.5.0 -> 1.5.1
 *   node scripts/bump-version.js minor   # 1.5.0 -> 1.6.0
 *   node scripts/bump-version.js major   # 1.5.0 -> 2.0.0
 *   node scripts/bump-version.js         # defaults to patch
 *
 * What it does:
 *   1. Reads current version from client/src/lib/version.ts
 *   2. Bumps according to semver type
 *   3. Updates version.ts (APP_VERSION + APP_BUILD_DATE)
 *   4. Syncs version to server/package.json and client/package.json
 *   5. Prints the new version
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'client/src/lib/version.ts');
const SERVER_PKG = path.join(ROOT, 'server/package.json');
const CLIENT_PKG = path.join(ROOT, 'client/package.json');

// --- Read current version ---
const versionSource = fs.readFileSync(VERSION_FILE, 'utf-8');
const match = versionSource.match(/APP_VERSION\s*=\s*['"](\d+)\.(\d+)\.(\d+)['"]/);
if (!match) {
  console.error('Could not parse APP_VERSION from version.ts');
  process.exit(1);
}

let [, major, minor, patch] = match.map(Number);
const bumpType = process.argv[2] || 'patch';

switch (bumpType) {
  case 'major':
    major++;
    minor = 0;
    patch = 0;
    break;
  case 'minor':
    minor++;
    patch = 0;
    break;
  case 'patch':
    patch++;
    break;
  default:
    console.error(`Unknown bump type: ${bumpType}. Use: major, minor, patch`);
    process.exit(1);
}

const newVersion = `${major}.${minor}.${patch}`;
const today = new Date().toISOString().split('T')[0];

// --- Update version.ts ---
let updated = versionSource
  .replace(/APP_VERSION\s*=\s*['"][^'"]+['"]/, `APP_VERSION = '${newVersion}'`)
  .replace(/APP_BUILD_DATE\s*=\s*['"][^'"]+['"]/, `APP_BUILD_DATE = '${today}'`);

fs.writeFileSync(VERSION_FILE, updated, 'utf-8');
console.log(`version.ts: ${match[0]} -> '${newVersion}', build date: ${today}`);

// --- Sync package.json files ---
for (const pkgPath of [SERVER_PKG, CLIENT_PKG]) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const oldVer = pkg.version;
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`${path.relative(ROOT, pkgPath)}: ${oldVer} -> ${newVersion}`);
}

console.log(`\nVersion bumped to v${newVersion}`);

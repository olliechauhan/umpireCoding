#!/usr/bin/env node
// Increments the patch version in extension/manifest.json.
// Usage: node scripts/bump-version.js
// Options:
//   --minor   bump minor instead (resets patch to 0)
//   --major   bump major instead (resets minor and patch to 0)

const fs   = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'extension', 'manifest.json');
const manifest     = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let [major, minor, patch] = manifest.version.split('.').map(Number);

const args = process.argv.slice(2);
if (args.includes('--major'))      { major++; minor = 0; patch = 0; }
else if (args.includes('--minor')) { minor++; patch = 0; }
else                               { patch++; }

manifest.version = `${major}.${minor}.${patch}`;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Version bumped to ${manifest.version}`);

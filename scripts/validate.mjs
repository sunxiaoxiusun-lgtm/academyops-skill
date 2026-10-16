#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const starter = path.join(root, 'skills/academyops/assets/starter');
const required = ['SKILL.md', 'agents/openai.yaml', 'scripts/create-platform.mjs', 'references/domain-model.md', 'references/deployment.md'];
for (const file of required) assert.ok(fs.existsSync(path.join(root, 'skills/academyops', file)), `Missing ${file}`);
const secretPatterns = [
  /sk-(?:proj-|svcacct-)[A-Za-z0-9_-]{25,}|\bsk-[A-Za-z0-9]{40,}/,
  /\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bappgprj_[a-f0-9]{16,}\b/,
  /https:\/\/[^\s"']+\.chatgpt\.site/,
  /\/Users\/[^\s"']+|\/home\/[^\s"']+/,
];
let count = 0;
function inspect(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, item.name);
    const rel = path.relative(root, location);
    if (item.name === '.git' && directory === root) continue;
    assert.ok(!item.isSymbolicLink(), `Symlink in distribution: ${rel}`);
    assert.ok(!['node_modules', 'dist', '.wrangler', '.sites-runtime', '.git', 'uploads', 'outputs'].includes(item.name), `Runtime state in distribution: ${rel}`);
    assert.ok(!(item.name.startsWith('.env') && item.name !== '.env.example'), `Environment file in distribution: ${rel}`);
    assert.ok(!/\.(?:db|sqlite3?|pem|p12|docx|pdf|png|jpe?g|webp|zip)$/i.test(item.name), `Unexpected binary or data asset: ${rel}`);
    if (item.isDirectory()) inspect(location);
    else {
      count++;
      const value = fs.readFileSync(location, 'utf8');
      for (const pattern of secretPatterns) assert.ok(!pattern.test(value), `Possible credential, live identity or private path: ${rel}`);
    }
  }
}
inspect(root);
const hosting = JSON.parse(fs.readFileSync(path.join(starter, '.openai/hosting.json'), 'utf8'));
assert.equal(hosting.project_id, undefined, 'Template must not retain a live Site identity.');
const config = JSON.parse(fs.readFileSync(path.join(starter, 'platform.config.json'), 'utf8'));
assert.equal(config.organization.registrationNumber, '');
assert.deepEqual(config.organization.invoiceAddressLines, []);
assert.equal(config.organization.sealPath, '');
assert.deepEqual(config.teachers, ['Teacher One', 'Teacher Two']);
const db = new DatabaseSync(':memory:');
const journal = JSON.parse(fs.readFileSync(path.join(starter, 'drizzle/meta/_journal.json'), 'utf8'));
const expected = journal.entries.map((entry) => `${entry.tag}.sql`).sort();
const actual = fs.readdirSync(path.join(starter, 'drizzle')).filter((name) => name.endsWith('.sql')).sort();
assert.deepEqual(actual, expected, 'Every shipped migration must be journaled; no extra seed datasets.');
for (const entry of journal.entries) db.exec(fs.readFileSync(path.join(starter, 'drizzle', `${entry.tag}.sql`), 'utf8'));
for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
  const identifier = row.name.replaceAll('"', '""');
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM "${identifier}"`).get().count, 0, `Unexpected data in ${row.name}`);
}
db.close();
console.log(`PASS: ${count} distribution files; no live identity or key patterns; ${journal.entries.length} migrations; all fresh database tables empty.`);

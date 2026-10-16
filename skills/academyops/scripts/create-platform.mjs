#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const starter = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/starter');
const usage = 'Usage: node create-platform.mjs --output <empty-directory> --name "Example Academy" [--legal-name "Legal name"] [--teachers "Teacher One,Teacher Two"]';
async function main() {
  const args = {};
  const allowed = new Set(['--output', '--name', '--legal-name', '--teachers']);
  const input = process.argv.slice(2);
  if (input.includes('--help')) return console.log(usage);
  for (let i = 0; i < input.length; i += 2) {
    if (!allowed.has(input[i]) || !input[i + 1] || input[i + 1].startsWith('--')) throw new Error(usage);
    args[input[i].slice(2)] = input[i + 1];
  }
  if (!args.output || !args.name?.trim()) throw new Error(usage);
  const output = resolve(args.output);
  const inside = relative(starter, output);
  if (!inside || (!inside.startsWith('..') && !inside.startsWith('/'))) throw new Error('Output must be outside the starter.');
  try { if ((await readdir(output)).length) throw new Error('Refusing to overwrite a non-empty directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = JSON.parse(await readFile(resolve(starter, 'platform.config.json'), 'utf8'));
  config.organization.displayName = args.name.trim();
  config.organization.legalName = (args['legal-name'] || args.name).trim();
  if (args.teachers) {
    config.teachers = [...new Set(args.teachers.split(',').map((name) => name.trim()).filter(Boolean))];
    if (!config.teachers.length) throw new Error('Provide at least one teacher.');
  }
  const hosting = JSON.parse(await readFile(resolve(starter, '.openai/hosting.json'), 'utf8'));
  if (hosting.project_id) throw new Error('Template unexpectedly contains a hosting identity.');
  await mkdir(output, { recursive: true });
  for (const entry of await readdir(starter)) await cp(resolve(starter, entry), resolve(output, entry), { recursive: true, force: false, errorOnExist: true });
  await writeFile(resolve(output, 'platform.config.json'), JSON.stringify(config, null, 2) + '\n');
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const logo = await readFile(resolve(output, 'public/organization-logo.svg'), 'utf8');
  await writeFile(resolve(output, 'public/organization-logo.svg'), logo.replaceAll('Your Academy', escape(config.organization.displayName)));
  console.log(`Created independent platform: ${output}`);
  console.log('Next: npm run install:ci; configure a new database, storage, authentication and hosting project. See README.md.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

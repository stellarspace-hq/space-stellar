#!/usr/bin/env node
'use strict';

/*
 * Wasm size regression check.
 *
 * Soroban contracts are deployed to Stellar as wasm, where the artifact size
 * directly affects upload cost and the network's contract-size limit. This
 * check measures every contract listed in contracts/wasm-size-budget.json,
 * prints a table, appends it to the GitHub step summary when available, and
 * exits non-zero as soon as an artifact exceeds its committed budget.
 *
 * It is intentionally dependency-free and runs with plain `node`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUDGET_FILE = path.join(ROOT, 'contracts', 'wasm-size-budget.json');

if (!fs.existsSync(BUDGET_FILE)) {
  console.error(`::error::budget file not found: ${path.relative(ROOT, BUDGET_FILE)}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
const artifactDir = path.resolve(ROOT, config.artifact_dir || 'target/wasm32v1-none/release');
const budgets = config.contracts || {};

function human(bytes) {
  return `${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB)`;
}

const rows = [];
let failed = false;

for (const [name, budget] of Object.entries(budgets)) {
  const file = path.join(artifactDir, `${name}.wasm`);
  if (!fs.existsSync(file)) {
    failed = true;
    rows.push({ name, size: 'MISSING', budget, status: 'MISSING' });
    console.error(
      `::error::${name}: no wasm artifact at ${path.relative(ROOT, file)}. ` +
        `Build first: cargo build --release --target wasm32v1-none -p ${name}`,
    );
    continue;
  }
  const size = fs.statSync(file).size;
  const over = size > budget;
  if (over) {
    failed = true;
    console.error(
      `::error::${name} is ${size} bytes, ${size - budget} bytes over the ${budget}-byte budget`,
    );
  }
  rows.push({
    name,
    size: human(size),
    budget: human(budget),
    status: over ? 'OVER BUDGET' : 'ok',
  });
}

const headers = ['contract', 'size', 'budget', 'status'];
const table = [headers, ...rows.map((r) => [r.name, r.size, r.budget, r.status])];
const widths = headers.map((_, i) => Math.max(...table.map((row) => String(row[i]).length)));

const renderRow = (row) =>
  row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ');

const plain =
  '\n' +
  table.map((row, i) => renderRow(row) + (i === 0 ? `\n${'-'.repeat(widths.reduce((a, b) => a + b + 2, -2))}` : '')).join('\n') +
  '\n';
console.log(plain);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const md = [
    '### Contract wasm sizes',
    '',
    '| contract | size | budget | status |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.name}\` | ${r.size} | ${r.budget} | ${r.status} |`),
    '',
  ].join('\n');
  fs.appendFileSync(summary, `${md}\n`);
}

if (failed) {
  console.error('Wasm size check failed.');
  process.exit(1);
}

console.log('Wasm size check passed.');

#!/usr/bin/env node
'use strict';

/*
 * Docs drift check.
 *
 * README.md and contracts/README.md are the project's onboarding path. They
 * routinely drift from the code: commands reference scripts that no longer
 * exist and file paths that have moved. Nothing else reads them in CI, so this
 * check extracts:
 *
 *   1. every `npm run <script>` invocation documented in a fenced `bash`/`sh`
 *      (or PowerShell) block or an inline code span, and
 *   2. every repo-relative file path referenced in a local Markdown link or an
 *      inline code span,
 *
 * then fails when a script is missing from a package.json or a path does not
 * exist in the checkout.
 *
 * Intentionally illustrative examples (env files the reader is asked to create,
 * build outputs) are listed in scripts/docs-check-allowlist.json.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_FILE = path.join(__dirname, 'docs-check-allowlist.json');

const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
const DOCS = allowlist.files;
const ALLOWED_PATHS = allowlist.paths || [];
const ALLOWED_SCRIPTS = allowlist.npmScripts || [];

const problems = [];

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

const allowedPathMatchers = ALLOWED_PATHS.map(globToRegExp);

function isAllowlistedPath(p) {
  return allowedPathMatchers.some((re) => re.test(p));
}

function readPackageScripts(absPkgPath) {
  if (!fs.existsSync(absPkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(absPkgPath, 'utf8')).scripts || {};
  } catch {
    return null;
  }
}

const TOP_LEVEL_DIRS = [
  'contracts',
  'frontend',
  'backend',
  'scripts',
  'packages',
  'src',
  'public',
  'assets',
  '.github',
  '.husky',
];

const KNOWN_EXTENSIONS = new Set([
  'md', 'json', 'js', 'cjs', 'mjs', 'ts', 'tsx', 'jsx', 'sh', 'ps1',
  'toml', 'rs', 'yml', 'yaml', 'css', 'html', 'txt', 'wasm',
]);

const SCRIPT_RE = /npm\s+run\s+([A-Za-z0-9:_-]+)/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FENCE_RE = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g;

// Only shell snippets carry commands and real path references. Language-tagged
// pseudo-code (rust, typescript, env) and ASCII directory trees are structural
// illustrations, not reproducible commands.
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'pwsh']);
const TREE_CHARS = /[│├└─]/;

function tokensOf(text) {
  return text.split(/[\s`"'(),;|&<>]+/).filter(Boolean);
}

function looksLikeRepoPath(token) {
  if (!token) return false;
  if (token.includes('://') || token.includes('//')) return false;
  if (token.startsWith('.') || token.startsWith('/') || token.startsWith('#')) return false;
  if (token.includes('..')) return false;
  if (/[*${}<>|?=]/.test(token)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(token)) return false; // npm:, ipfs:, https:
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(token)) return false;

  const trimmed = token.replace(/\/+$/, '');
  if (!trimmed) return false;

  const segments = trimmed.split('/');
  const ext = segments[segments.length - 1].split('.').pop().toLowerCase();
  const hasKnownExt = segments[segments.length - 1].includes('.') && KNOWN_EXTENSIONS.has(ext);
  const hasTopDir = segments.length > 1 && TOP_LEVEL_DIRS.includes(segments[0]);
  return hasKnownExt || hasTopDir;
}

function resolveRepoPath(token) {
  return token.replace(/\/+$/, '');
}

function checkPath(token, where, baseDir) {
  const rel = resolveRepoPath(token);
  if (isAllowlistedPath(rel)) return;
  const abs = path.resolve(baseDir || ROOT, rel);
  if (!fs.existsSync(abs)) {
    problems.push(`${where}: documented path does not exist: ${rel}`);
  }
}

function checkNpmRun(script, where) {
  if (ALLOWED_SCRIPTS.includes(script)) return;
  const candidates = [
    path.join(ROOT, 'package.json'),
    path.join(ROOT, where.startsWith('contracts') ? 'contracts' : '', 'package.json'),
    path.join(ROOT, 'frontend', 'package.json'),
    path.join(ROOT, 'backend', 'package.json'),
  ];
  for (const pkg of candidates) {
    const scripts = readPackageScripts(pkg);
    if (scripts && Object.prototype.hasOwnProperty.call(scripts, script)) return;
  }
  problems.push(`${where}: npm run ${script} does not match any package.json script`);
}

let checkedPaths = 0;
let checkedScripts = 0;

for (const doc of DOCS) {
  const docPath = path.join(ROOT, doc);
  if (!fs.existsSync(docPath)) {
    problems.push(`${doc}: documented file is missing`);
    continue;
  }
  const text = fs.readFileSync(docPath, 'utf8');

  const seenScripts = new Set();
  const recordScript = (name) => {
    if (seenScripts.has(name)) return;
    seenScripts.add(name);
    checkedScripts += 1;
    checkNpmRun(name, doc);
  };

  // 1. Fenced code blocks: commands + referenced paths.
  let fence;
  FENCE_RE.lastIndex = 0;
  while ((fence = FENCE_RE.exec(text)) !== null) {
    const lang = (fence[1] || '').toLowerCase();
    const body = fence[2];
    let m;
    SCRIPT_RE.lastIndex = 0;
    while ((m = SCRIPT_RE.exec(body)) !== null) recordScript(m[1]);
    if (!SHELL_LANGS.has(lang) || TREE_CHARS.test(body)) continue;
    for (const token of tokensOf(body)) {
      if (looksLikeRepoPath(token)) {
        checkedPaths += 1;
        checkPath(token, doc);
      }
    }
  }

  // 2. Inline code spans: commands + referenced paths.
  const seenInlinePaths = new Set();
  let inline;
  INLINE_CODE_RE.lastIndex = 0;
  while ((inline = INLINE_CODE_RE.exec(text)) !== null) {
    const body = inline[1];
    let m;
    SCRIPT_RE.lastIndex = 0;
    while ((m = SCRIPT_RE.exec(body)) !== null) recordScript(m[1]);
    for (const token of tokensOf(body)) {
      if (looksLikeRepoPath(token) && !seenInlinePaths.has(token)) {
        seenInlinePaths.add(token);
        checkedPaths += 1;
        checkPath(token, doc);
      }
    }
  }

  // 3. Local Markdown links (resolved relative to the document).
  const seenLinks = new Set();
  const docDir = path.dirname(docPath);
  let link;
  LINK_RE.lastIndex = 0;
  while ((link = LINK_RE.exec(text)) !== null) {
    const target = link[1].split('#')[0];
    if (!target || target.startsWith('http') || target.startsWith('mailto:')) continue;
    if (seenLinks.has(target)) continue;
    seenLinks.add(target);
    checkedPaths += 1;
    checkPath(target, doc, docDir);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\nDocs drift check failed with ${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `Docs drift check passed: ${checkedScripts} npm script reference(s) and ` +
    `${checkedPaths} path reference(s) validated across ${DOCS.join(', ')}.`,
);

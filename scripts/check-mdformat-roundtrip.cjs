#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractFrontmatter } = require('../get-shit-done/bin/lib/frontmatter.cjs');

const repositoryRoot = path.join(__dirname, '..');
const representativeFiles = [
  'sdk/test-fixtures/sample-plan.md',
  'get-shit-done/templates/summary-complex.md',
  'commands/gsd/debug.md',
  'get-shit-done/workflows/execute-plan.md',
  'get-shit-done/templates/SECURITY.md',
  'get-shit-done/templates/UI-SPEC.md',
  'get-shit-done/templates/VALIDATION.md',
];

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseTasks(content) {
  return [...content.matchAll(/<task\b([^>]*)>([\s\S]*?)<\/task>/g)].map((match) => ({
    attributes: normalizeText(match[1]),
    content: normalizeText(match[2]),
  }));
}

function parseReferences(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('@'));
}

function parseSections(content) {
  const sections = [];
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const matches = [...content.matchAll(headingPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextOffset = matches[index + 1]?.index ?? content.length;
    sections.push({
      level: match[1].length,
      heading: normalizeText(match[2]),
      content: normalizeText(content.slice(match.index + match[0].length, nextOffset)),
    });
  }
  return sections;
}

function semanticSnapshot(content) {
  return {
    frontmatter: extractFrontmatter(content),
    tasks: parseTasks(content),
    references: parseReferences(content),
    sections: parseSections(content),
  };
}

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mdformat-roundtrip-'));

try {
  fs.copyFileSync(
    path.join(repositoryRoot, '.mdformat.toml'),
    path.join(tempDirectory, '.mdformat.toml')
  );

  const before = new Map();
  for (const relativePath of representativeFiles) {
    const sourcePath = path.join(repositoryRoot, relativePath);
    const destinationPath = path.join(tempDirectory, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    before.set(relativePath, semanticSnapshot(fs.readFileSync(sourcePath, 'utf-8')));
  }

  execFileSync('mdformat', ['.'], { cwd: tempDirectory, stdio: 'inherit' });

  const firstPass = new Map();
  for (const relativePath of representativeFiles) {
    const formattedContent = fs.readFileSync(path.join(tempDirectory, relativePath), 'utf-8');
    assert.deepEqual(
      semanticSnapshot(formattedContent),
      before.get(relativePath),
      `${relativePath} changed semantically after mdformat`
    );
    firstPass.set(relativePath, formattedContent);
  }

  execFileSync('mdformat', ['.'], { cwd: tempDirectory, stdio: 'inherit' });

  for (const relativePath of representativeFiles) {
    const secondPass = fs.readFileSync(path.join(tempDirectory, relativePath), 'utf-8');
    assert.equal(secondPass, firstPass.get(relativePath), `${relativePath} is not idempotent`);
  }

  process.stdout.write(`Validated ${representativeFiles.length} representative Markdown files.\n`);
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

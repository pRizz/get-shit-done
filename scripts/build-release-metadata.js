#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const RELEASE_METADATA_PATH = path.join(REPO_ROOT, 'get-shit-done', 'RELEASE.json');

function readPackageVersion(packageJsonPath = PACKAGE_JSON_PATH) {
  const raw = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  return pkg.version;
}

function runGit(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function normalizeCommitDate(value) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function buildReleaseMetadata(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const packageJsonPath = options.packageJsonPath || path.join(repoRoot, 'package.json');
  const version = readPackageVersion(packageJsonPath);

  let gitHead = null;
  let commitDate = null;

  try {
    gitHead = runGit(repoRoot, ['rev-parse', 'HEAD']);
    commitDate = normalizeCommitDate(runGit(repoRoot, ['show', '-s', '--format=%cI', 'HEAD']));
  } catch {
    gitHead = null;
    commitDate = null;
  }

  return {
    schemaVersion: 1,
    version,
    gitHead,
    commitDate,
  };
}

function writeReleaseMetadata(outputPath = RELEASE_METADATA_PATH, metadata = buildReleaseMetadata()) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

if (require.main === module) {
  const metadata = writeReleaseMetadata();
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}

module.exports = {
  buildReleaseMetadata,
  normalizeCommitDate,
  readPackageVersion,
  writeReleaseMetadata,
};

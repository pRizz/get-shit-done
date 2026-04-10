'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const { createTempGitProject, cleanup } = require('./helpers.cjs');
const { buildReleaseMetadata, writeReleaseMetadata } = require('../scripts/build-release-metadata.js');
process.env.GSD_TEST_MODE = '1';
const {
  resolveReleaseMetadata,
  normalizeReleaseMetadata,
  readReleaseMetadata,
  buildReleaseMetadataFromGit,
} = require('../bin/install.js');

describe('release metadata builder', () => {
  let tmpDir;
  let extraDirs;

  beforeEach(() => {
    tmpDir = createTempGitProject('gsd-release-meta-');
    extraDirs = [];

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'tmp-gsd', version: '9.9.9' }, null, 2)
    );

    execSync('git add package.json', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "add package metadata"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    for (const dir of extraDirs) {
      cleanup(dir);
    }
    cleanup(tmpDir);
  });

  test('buildReleaseMetadata returns version, full git SHA, and UTC commit date', () => {
    // Arrange
    const expectedHead = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' }).trim();
    const expectedCommitDate = new Date(
      execSync('git show -s --format=%cI HEAD', { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' }).trim()
    ).toISOString();

    // Act
    const metadata = buildReleaseMetadata({ repoRoot: tmpDir });

    // Assert
    assert.strictEqual(metadata.schemaVersion, 1);
    assert.strictEqual(metadata.version, '9.9.9');
    assert.strictEqual(metadata.gitHead, expectedHead);
    assert.match(metadata.gitHead, /^[0-9a-f]{40}$/);
    assert.strictEqual(metadata.commitDate, expectedCommitDate);
    assert.match(metadata.commitDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('writeReleaseMetadata writes the expected JSON file', () => {
    // Arrange
    const outputPath = path.join(tmpDir, 'get-shit-done', 'RELEASE.json');

    // Act
    const metadata = writeReleaseMetadata(outputPath, buildReleaseMetadata({ repoRoot: tmpDir }));

    // Assert
    assert.ok(fs.existsSync(outputPath), 'RELEASE.json should be written');
    const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.deepStrictEqual(written, metadata);
  });

  test('resolveReleaseMetadata prefers live git metadata over stale bundled RELEASE.json', () => {
    // Arrange
    const expectedHead = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' }).trim();
    const expectedCommitDate = new Date(
      execSync('git show -s --format=%cI HEAD', { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' }).trim()
    ).toISOString();
    const bundledReleasePath = path.join(tmpDir, 'get-shit-done', 'RELEASE.json');

    fs.mkdirSync(path.dirname(bundledReleasePath), { recursive: true });
    fs.writeFileSync(
      bundledReleasePath,
      `${JSON.stringify({
        schemaVersion: 1,
        version: '0.0.1',
        gitHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commitDate: '2000-01-01T00:00:00.000Z',
      }, null, 2)}\n`
    );

    // Act
    const bundled = readReleaseMetadata(bundledReleasePath);
    const gitFallback = buildReleaseMetadataFromGit(tmpDir);
    const metadata = normalizeReleaseMetadata({
      version: gitFallback?.version || bundled?.version || 'missing',
      gitHead: gitFallback?.gitHead || bundled?.gitHead || null,
      commitDate: gitFallback?.commitDate || bundled?.commitDate || null,
    });

    // Assert
    assert.strictEqual(metadata.version, '1.34.2');
    assert.strictEqual(metadata.gitHead, expectedHead);
    assert.strictEqual(metadata.commitDate, expectedCommitDate);
  });

  test('resolveReleaseMetadata falls back to bundled RELEASE.json when git metadata is unavailable', () => {
    // Arrange
    const nonRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-release-export-'));
    extraDirs.push(nonRepoDir);
    const bundledReleasePath = path.join(nonRepoDir, 'get-shit-done', 'RELEASE.json');

    fs.mkdirSync(path.dirname(bundledReleasePath), { recursive: true });
    fs.writeFileSync(
      path.join(nonRepoDir, 'package.json'),
      JSON.stringify({ name: 'tmp-gsd', version: '8.8.8' }, null, 2)
    );
    fs.writeFileSync(
      bundledReleasePath,
      `${JSON.stringify({
        schemaVersion: 1,
        version: '8.8.8',
        gitHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        commitDate: '2026-01-02T03:04:05.000Z',
      }, null, 2)}\n`
    );

    // Act
    const bundled = readReleaseMetadata(bundledReleasePath);
    const gitFallback = buildReleaseMetadataFromGit(nonRepoDir);
    const metadata = normalizeReleaseMetadata({
      version: gitFallback?.version || bundled?.version || 'missing',
      gitHead: gitFallback?.gitHead || bundled?.gitHead || null,
      commitDate: gitFallback?.commitDate || bundled?.commitDate || null,
    });

    // Assert
    assert.deepStrictEqual(metadata, {
      schemaVersion: 1,
      version: '8.8.8',
      gitHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      commitDate: '2026-01-02T03:04:05.000Z',
    });
  });

  test('resolveReleaseMetadata uses bundled metadata when no repo checkout is available', () => {
    const nonRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-release-bundled-'));
    extraDirs.push(nonRepoDir);
    fs.mkdirSync(path.join(nonRepoDir, 'get-shit-done'), { recursive: true });
    fs.writeFileSync(
      path.join(nonRepoDir, 'get-shit-done', 'RELEASE.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        version: '7.7.7',
        gitHead: 'cccccccccccccccccccccccccccccccccccccccc',
        commitDate: '2025-05-06T07:08:09.000Z',
      }, null, 2)}\n`
    );

    const metadata = resolveReleaseMetadata(nonRepoDir);

    assert.deepStrictEqual(metadata, {
      schemaVersion: 1,
      version: '7.7.7',
      gitHead: 'cccccccccccccccccccccccccccccccccccccccc',
      commitDate: '2025-05-06T07:08:09.000Z',
    });
  });
});

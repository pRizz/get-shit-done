/**
 * GSD Tools Tests - mdformat compatibility commands.
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const { MDFORMAT_CONFIG, migrateMarkers } = require('../get-shit-done/bin/lib/mdformat.cjs');

const tempDirs = [];

afterEach(() => {
  for (const tempDir of tempDirs) cleanup(tempDir);
  tempDirs.length = 0;
});

describe('mdformat init', () => {
  test('repository config matches the downstream canonical config', () => {
    // Arrange
    const configPath = path.join(__dirname, '..', '.mdformat.toml');

    // Act
    const repositoryConfig = fs.readFileSync(configPath, 'utf-8');

    // Assert
    assert.equal(repositoryConfig, MDFORMAT_CONFIG);
  });

  test('creates the canonical config when none exists', () => {
    // Arrange
    const tempDir = createTempProject('gsd-mdformat-init-');
    tempDirs.push(tempDir);

    // Act
    const result = runGsdTools(['mdformat', 'init'], tempDir);

    // Assert
    assert.equal(result.success, true, result.error);
    assert.equal(fs.readFileSync(path.join(tempDir, '.mdformat.toml'), 'utf-8'), MDFORMAT_CONFIG);
    assert.equal(JSON.parse(result.output).created, true);
  });

  test('preserves an existing config byte-for-byte', () => {
    // Arrange
    const tempDir = createTempProject('gsd-mdformat-existing-');
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, '.mdformat.toml');
    const existing = 'wrap = 88\n';
    fs.writeFileSync(configPath, existing);

    // Act
    const result = runGsdTools(['mdformat', 'init'], tempDir);

    // Assert
    assert.equal(result.success, true, result.error);
    assert.equal(fs.readFileSync(configPath, 'utf-8'), existing);
    assert.equal(JSON.parse(result.output).reason, 'existing-config-preserved');
  });
});

describe('canonical repository markers', () => {
  test('tracked Markdown emits no snake_case element names', () => {
    // Arrange
    const repositoryRoot = path.join(__dirname, '..');
    const trackedMarkdown = execFileSync('git', ['ls-files', '-z', '*.md'], {
      cwd: repositoryRoot,
      encoding: 'utf-8',
    }).split('\0').filter(Boolean);
    const legacyMarker = /<\/?[A-Za-z][A-Za-z0-9-]*_[A-Za-z0-9_-]*(?=[\s>])/;

    // Act
    const offenders = trackedMarkdown.filter((relativePath) => {
      const content = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf-8');
      return legacyMarker.test(content);
    });

    // Assert
    assert.deepEqual(offenders, []);
  });

  test('tracked Markdown contains no escaped canonical GSD wrappers', () => {
    // Arrange
    const repositoryRoot = path.join(__dirname, '..');
    const trackedMarkdown = execFileSync('git', ['ls-files', '-z', '*.md'], {
      cwd: repositoryRoot,
      encoding: 'utf-8',
    }).split('\0').filter(Boolean);
    const escapedWrapper = /\\<\/?[A-Za-z][A-Za-z0-9-]*-[A-Za-z0-9-]*(?=[\s>])/;

    // Act
    const offenders = trackedMarkdown.filter((relativePath) => {
      const content = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf-8');
      return escapedWrapper.test(content);
    });

    // Assert
    assert.deepEqual(offenders, []);
  });
});

describe('mdformat migrate', () => {
  test('converts recognized legacy and escaped markers only', () => {
    // Arrange
    const input = [
      '<execution_context>',
      String.raw`\<files_to_read>`,
      String.raw`Inline \<success_criteria> stays recognized.`,
      '<custom_marker> stays user-defined.',
      '</execution_context>',
    ].join('\n');

    // Act
    const result = migrateMarkers(input);

    // Assert
    assert.equal(result, [
      '<execution-context>',
      '<files-to-read>',
      'Inline <success-criteria> stays recognized.',
      '<custom_marker> stays user-defined.',
      '</execution-context>',
    ].join('\n'));
  });

  test('repairs inline wrappers escaped by bare mdformat', () => {
    // Arrange
    const input = String.raw`\<read_first>src/types.ts\</read_first>`;

    // Act
    const result = migrateMarkers(input);

    // Assert
    assert.equal(result, '<read-first>src/types.ts</read-first>');
  });

  test('--check reports files without modifying them', () => {
    // Arrange
    const tempDir = createTempProject('gsd-mdformat-check-');
    tempDirs.push(tempDir);
    const planPath = path.join(tempDir, '.planning', 'legacy.md');
    const original = '<execution_context>\nvalue\n</execution_context>\n';
    fs.writeFileSync(planPath, original);

    // Act
    const result = runGsdTools(['mdformat', 'migrate', '--check'], tempDir);

    // Assert
    assert.equal(result.success, true, result.error);
    assert.equal(JSON.parse(result.output).changed, 1);
    assert.equal(fs.readFileSync(planPath, 'utf-8'), original);
  });

  test('migrates the planning directory idempotently', () => {
    // Arrange
    const tempDir = createTempProject('gsd-mdformat-migrate-');
    tempDirs.push(tempDir);
    const planPath = path.join(tempDir, '.planning', 'legacy.md');
    fs.writeFileSync(planPath, '<execution_context>\nvalue\n</execution_context>\n');

    // Act
    const first = runGsdTools(['mdformat', 'migrate'], tempDir);
    const second = runGsdTools(['mdformat', 'migrate'], tempDir);

    // Assert
    assert.equal(first.success, true, first.error);
    assert.equal(JSON.parse(first.output).changed, 1);
    assert.equal(JSON.parse(second.output).changed, 0);
    assert.equal(fs.readFileSync(planPath, 'utf-8'), '<execution-context>\nvalue\n</execution-context>\n');
  });
});

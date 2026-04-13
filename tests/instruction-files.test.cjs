const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempDir, cleanup } = require('./helpers.cjs');
const instructionFiles = require('../get-shit-done/bin/lib/instruction-files.cjs');

const supportsSymlinks = process.platform !== 'win32';

describe('instruction-files status', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-instruction-files-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reports none when neither file exists', () => {
    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'none');
    assert.strictEqual(output.healthy, false);
  });

  test('reports agents_only when AGENTS.md exists alone', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');

    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'agents_only');
    assert.strictEqual(output.agents.exists, true);
    assert.strictEqual(output.claude.exists, false);
  });

  test('reports claude_only when CLAUDE.md exists alone', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');

    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'claude_only');
    assert.strictEqual(output.agents.exists, false);
    assert.strictEqual(output.claude.exists, true);
  });

  test('reports dual_regular when both files exist as regular files', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');

    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'dual_regular');
    assert.strictEqual(output.healthy, false);
  });

  (supportsSymlinks ? test : test.skip)('reports linked_ok when CLAUDE.md points to AGENTS.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.symlinkSync('AGENTS.md', path.join(tmpDir, 'CLAUDE.md'));

    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'linked_ok');
    assert.strictEqual(output.real_file, 'AGENTS.md');
    assert.strictEqual(output.link_file, 'CLAUDE.md');
  });

  (supportsSymlinks ? test : test.skip)('reports linked_ok when AGENTS.md points to CLAUDE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    fs.symlinkSync('CLAUDE.md', path.join(tmpDir, 'AGENTS.md'));

    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'linked_ok');
    assert.strictEqual(output.real_file, 'CLAUDE.md');
    assert.strictEqual(output.link_file, 'AGENTS.md');
  });

  (supportsSymlinks ? test : test.skip)('reports broken_or_unexpected_link for a broken symlink', () => {
    fs.symlinkSync('missing-target.md', path.join(tmpDir, 'CLAUDE.md'));

    const result = runGsdTools(['instruction-files', 'status', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.state, 'broken_or_unexpected_link');
    assert.strictEqual(output.claude.exists, true);
    assert.strictEqual(output.claude.target_missing, true);
  });
});

describe('instruction-files ensure-link', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-instruction-link-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  (supportsSymlinks ? test : test.skip)('creates a relative compatibility symlink', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');

    const result = runGsdTools(['instruction-files', 'ensure-link', '--real', 'AGENTS.md', '--link', 'CLAUDE.md', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'created');
    assert.strictEqual(output.state, 'linked_ok');
    assert.strictEqual(fs.lstatSync(path.join(tmpDir, 'CLAUDE.md')).isSymbolicLink(), true);
    assert.strictEqual(fs.readlinkSync(path.join(tmpDir, 'CLAUDE.md')), 'AGENTS.md');
  });

  (supportsSymlinks ? test : test.skip)('no-ops when the requested link is already correct', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.symlinkSync('AGENTS.md', path.join(tmpDir, 'CLAUDE.md'));

    const result = runGsdTools(['instruction-files', 'ensure-link', '--real', 'AGENTS.md', '--link', 'CLAUDE.md', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'noop');
    assert.strictEqual(output.state, 'linked_ok');
  });

  test('refuses to replace an existing regular file without --replace-existing', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');

    const result = runGsdTools(['instruction-files', 'ensure-link', '--real', 'AGENTS.md', '--link', 'CLAUDE.md'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.match(result.error, /--replace-existing/);
  });

  (supportsSymlinks ? test : test.skip)('replaces an existing regular file when --replace-existing is provided', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');

    const result = runGsdTools(['instruction-files', 'ensure-link', '--real', 'AGENTS.md', '--link', 'CLAUDE.md', '--replace-existing', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'replaced');
    assert.strictEqual(fs.lstatSync(path.join(tmpDir, 'CLAUDE.md')).isSymbolicLink(), true);
  });

  test('surfaces a clear error when symlink creation fails', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');

    const originalSymlinkSync = fs.symlinkSync;
    fs.symlinkSync = () => {
      const err = new Error('permission denied');
      err.code = 'EPERM';
      throw err;
    };

    try {
      assert.throws(
        () => instructionFiles.ensureInstructionLink(tmpDir, { real: 'AGENTS.md', link: 'CLAUDE.md' }),
        /GSD will not create a duplicate regular file/
      );
    } finally {
      fs.symlinkSync = originalSymlinkSync;
    }
  });
});

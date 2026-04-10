'use strict';

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createTempDir, cleanup } = require('./helpers.cjs');
const {
  SOURCE_REPO,
  DEFAULT_TARGET_REF,
  readReleaseMetadata,
  detectInstalledMetadata,
  shouldOfferForkUpdate,
} = require('../hooks/gsd-check-update.js');

const ROOT = path.join(__dirname, '..');
const UPDATE_WORKFLOW = path.join(ROOT, 'get-shit-done', 'workflows', 'update.md');
const UPDATE_COMMAND = path.join(ROOT, 'commands', 'gsd', 'update.md');
const MANUAL_UPDATE_DOC = path.join(ROOT, 'docs', 'manual-update.md');
const CHECK_UPDATE_HOOK = path.join(ROOT, 'hooks', 'gsd-check-update.js');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanup(tempDirs.pop());
  }
});

describe('fork-based update workflow', () => {
  test('workflow uses fork clone installs and no longer references npm release updates', () => {
    const content = fs.readFileSync(UPDATE_WORKFLOW, 'utf8');

    assert.ok(content.includes('https://github.com/pRizz/get-shit-done.git'));
    assert.ok(content.includes('--ref <sha-or-branch>'));
    assert.ok(content.includes('TARGET_REF="main"'));
    assert.ok(content.includes("os.tmpdir(), 'gsd-update-'"));
    assert.ok(content.includes('git clone --filter=blob:none --no-checkout "$SOURCE_REPO" "$REPO_DIR"'));
    assert.ok(content.includes('node "$REPO_DIR/scripts/build-hooks.js"'));
    assert.ok(content.includes('node "$REPO_DIR/bin/install.js" "$RUNTIME_FLAG" --global'));
    assert.ok(content.includes('cd "$ORIGINAL_CWD" && node "$REPO_DIR/bin/install.js" "$RUNTIME_FLAG" --local'));
    assert.ok(content.includes('RELEASE.json'));
    assert.ok(content.includes('show -s --format=%cI HEAD'));
    assert.ok(content.includes('**Target Commit Datetime:** {TARGET_COMMIT_DATE}'));
    assert.ok(content.includes('Target commit datetime: {TARGET_COMMIT_DATE}'));

    assert.ok(!content.includes('npm view get-shit-done-cc version'));
    assert.ok(!content.includes('npx -y get-shit-done-cc@latest'));
    assert.ok(!content.includes('/tmp/'));
  });

  test('workflow documents local-install conflict prompt and recommends global install', () => {
    const content = fs.readFileSync(UPDATE_WORKFLOW, 'utf8');

    assert.ok(content.includes('Install globally (recommended)'));
    assert.ok(content.includes('Keep the local install'));
    assert.ok(content.includes('A local GSD install was detected in the current project.'));
  });

  test('command wrapper exposes the ref override', () => {
    const content = fs.readFileSync(UPDATE_COMMAND, 'utf8');

    assert.ok(content.includes('description: Update GSD from the fork source with commit and datetime preview'));
    assert.ok(content.includes('--ref <sha-or-branch>'));
    assert.ok(content.includes('Fork ref resolution'));
    assert.ok(content.includes('exact datetime'));
  });

  test('manual update doc matches the fork-clone path', () => {
    const content = fs.readFileSync(MANUAL_UPDATE_DOC, 'utf8');

    assert.ok(content.includes('https://github.com/pRizz/get-shit-done.git'));
    assert.ok(content.includes('os.tmpdir(), \'gsd-update-\''));
    assert.ok(content.includes('node "$TMP_ROOT/get-shit-done/scripts/build-hooks.js"'));
    assert.ok(content.includes('keep your shell in the target project directory'));
    assert.ok(!content.includes('https://github.com/gsd-build/get-shit-done'));
  });

  test('workflow keeps the target datetime visible for legacy installs', () => {
    const content = fs.readFileSync(UPDATE_WORKFLOW, 'utf8');

    assert.ok(content.includes('This install has no recorded git commit in RELEASE.json'));
    assert.ok(content.includes('Running this update will migrate the install onto fork-based commit metadata.'));
    assert.ok(content.includes('  - target commit datetime'));
  });
});

describe('fork-based update checker hook', () => {
  test('hook source points at the fork and no longer shells out to npm', () => {
    const content = fs.readFileSync(CHECK_UPDATE_HOOK, 'utf8');

    assert.ok(content.includes(SOURCE_REPO));
    assert.ok(content.includes("const DEFAULT_TARGET_REF = 'main'"));
    assert.ok(content.includes('target_git_head'));
    assert.ok(content.includes('target_commit_date'));
    assert.ok(content.includes('needs_migration'));

    assert.ok(!content.includes('npm view get-shit-done-cc version'));
    assert.ok(!content.includes("execSync('npm view get-shit-done-cc version"));
  });

  test('hook exposes defaults for the fork source', () => {
    assert.strictEqual(SOURCE_REPO, 'https://github.com/pRizz/get-shit-done.git');
    assert.strictEqual(DEFAULT_TARGET_REF, 'main');
  });

  test('shouldOfferForkUpdate returns false when installed and target git heads match', () => {
    assert.strictEqual(
      shouldOfferForkUpdate('4ba99b899fe342f461e75083dde19ea07978730e', '4ba99b899fe342f461e75083dde19ea07978730e'),
      false
    );
  });

  test('shouldOfferForkUpdate returns true when the target git head differs', () => {
    assert.strictEqual(
      shouldOfferForkUpdate('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      true
    );
  });

  test('shouldOfferForkUpdate returns true for legacy installs that need migration', () => {
    assert.strictEqual(
      shouldOfferForkUpdate(null, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true),
      true
    );
  });

  test('readReleaseMetadata tolerates release files without git metadata', () => {
    const tmpDir = createTempDir('gsd-release-');
    tempDirs.push(tmpDir);
    const releasePath = path.join(tmpDir, 'RELEASE.json');

    fs.writeFileSync(releasePath, `${JSON.stringify({ version: '1.34.2' }, null, 2)}\n`);

    assert.deepStrictEqual(readReleaseMetadata(releasePath, '0.0.0'), {
      version: '1.34.2',
      gitHead: null,
      commitDate: null,
    });
  });

  test('detectInstalledMetadata prefers project metadata and marks legacy installs for migration', () => {
    const tmpDir = createTempDir('gsd-installed-');
    tempDirs.push(tmpDir);

    const projectDir = path.join(tmpDir, 'project');
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(path.join(projectDir, 'get-shit-done'), { recursive: true });
    fs.mkdirSync(path.join(globalDir, 'get-shit-done'), { recursive: true });

    fs.writeFileSync(path.join(projectDir, 'get-shit-done', 'VERSION'), '1.34.2\n');
    fs.writeFileSync(
      path.join(projectDir, 'get-shit-done', 'RELEASE.json'),
      `${JSON.stringify({ version: '1.34.2' }, null, 2)}\n`
    );
    fs.writeFileSync(path.join(globalDir, 'get-shit-done', 'VERSION'), '1.33.0\n');
    fs.writeFileSync(
      path.join(globalDir, 'get-shit-done', 'RELEASE.json'),
      `${JSON.stringify({
        version: '1.33.0',
        gitHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commitDate: '2026-04-01T00:00:00.000Z',
      }, null, 2)}\n`
    );

    const detected = detectInstalledMetadata(projectDir, globalDir);

    assert.deepStrictEqual(detected, {
      scope: 'LOCAL',
      configDir: projectDir,
      installedVersion: '1.34.2',
      gitHead: null,
      commitDate: null,
      needsMigration: true,
    });
  });
});

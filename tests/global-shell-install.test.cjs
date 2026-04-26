'use strict';

process.env.GSD_TEST_MODE = '1';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  buildManagedShellPathBlock,
  mergeManagedBlockContent,
  stripManagedBlockContent,
  getManagedShellTargets,
  getSharedBinDir,
  getSharedInstallStatePath,
  writeSharedInstallState,
  getCodexYoloRalphWrapperPath,
  GSD_SHELL_PATH_MARKER_START,
  GSD_SHELL_PATH_MARKER_END,
  GSD_YOLO_RALPH_COMMAND,
  install,
  uninstall,
} = require('../bin/install.js');

const REAL_SHARED_INSTALL_STATE_PATH = path.join(os.homedir(), '.gsd', 'install-state.json');

function setHomeDir(homeDir) {
  const previous = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  return previous;
}

function restoreHomeDir(previous) {
  if (previous.HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previous.HOME;
  }
  if (previous.USERPROFILE === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = previous.USERPROFILE;
  }
}

function countMatches(content, pattern) {
  return (content.match(pattern) || []).length;
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('managed shell PATH helpers', () => {
  let tempHome;
  let previousHome;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-shell-home-'));
    previousHome = setHomeDir(tempHome);
  });

  afterEach(() => {
    restoreHomeDir(previousHome);
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  test('selects ~/.profile for bash when it is the first existing candidate', () => {
    fs.writeFileSync(path.join(tempHome, '.profile'), '# profile\n', 'utf8');
    fs.mkdirSync(path.join(tempHome, '.config', 'fish'), { recursive: true });
    fs.writeFileSync(path.join(tempHome, '.config', 'fish', 'config.fish'), 'set fish_greeting\n', 'utf8');

    const targets = getManagedShellTargets();
    const targetPaths = targets.map(target => target.path);

    assert.deepStrictEqual(targetPaths, [
      path.join(tempHome, '.zshrc'),
      path.join(tempHome, '.profile'),
      path.join(tempHome, '.config', 'fish', 'config.fish'),
    ]);
  });

  test('defaults bash management to ~/.bash_profile when no bash startup file exists', () => {
    const targets = getManagedShellTargets();
    assert.strictEqual(targets[1].path, path.join(tempHome, '.bash_profile'));
  });

  test('merge and strip keep CRLF files stable', () => {
    const existing = ['# before', 'export FOO=1'].join('\r\n') + '\r\n';
    const block = buildManagedShellPathBlock('posix', '\r\n');
    const merged = mergeManagedBlockContent(
      existing,
      block,
      GSD_SHELL_PATH_MARKER_START,
      GSD_SHELL_PATH_MARKER_END,
    );

    assert.ok(merged.includes('\r\n'), 'merged content keeps CRLF newlines');
    assert.ok(!merged.replace(/\r\n/g, '').includes('\n'), 'merged content has no bare LF newlines');
    assert.strictEqual(countMatches(merged, new RegExp(GSD_SHELL_PATH_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), 1);

    const stripped = stripManagedBlockContent(
      merged,
      GSD_SHELL_PATH_MARKER_START,
      GSD_SHELL_PATH_MARKER_END,
    );

    assert.strictEqual(stripped, existing);
  });
});

describe('shared global PATH + shim integration', () => {
  let tempHome;
  let previousHome;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-global-home-'));
    previousHome = setHomeDir(tempHome);
    fs.mkdirSync(path.join(tempHome, '.config', 'fish'), { recursive: true });
    fs.writeFileSync(path.join(tempHome, '.zshrc'), '# zsh setup\n', 'utf8');
    fs.writeFileSync(path.join(tempHome, '.profile'), '# profile setup\n', 'utf8');
    fs.writeFileSync(path.join(tempHome, '.config', 'fish', 'config.fish'), 'set fish_greeting\n', 'utf8');
  });

  afterEach(() => {
    restoreHomeDir(previousHome);
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  test('global Codex install creates the shared shim, preserves shell files, and keeps markers idempotent', () => {
    const codexHome = path.join(tempHome, '.codex');

    install(true, 'codex');
    install(true, 'codex');

    const statePath = getSharedInstallStatePath();
    const sharedBinDir = getSharedBinDir();
    const sharedShimPath = path.join(sharedBinDir, GSD_YOLO_RALPH_COMMAND);
    const codexWrapperPath = getCodexYoloRalphWrapperPath(codexHome);
    const state = JSON.parse(readUtf8(statePath));

    assert.strictEqual(state.global_installs.codex.config_dir, codexHome);
    assert.deepStrictEqual(
      [...state.shell_files].sort(),
      [
        path.join(tempHome, '.config', 'fish', 'config.fish'),
        path.join(tempHome, '.profile'),
        path.join(tempHome, '.zshrc'),
      ].sort(),
    );
    assert.deepStrictEqual(state.shared_bin_artifacts, [GSD_YOLO_RALPH_COMMAND]);
    assert.ok(fs.existsSync(sharedShimPath), 'shared shim exists');
    assert.ok(fs.existsSync(codexWrapperPath), 'Codex wrapper exists');

    const zshContent = readUtf8(path.join(tempHome, '.zshrc'));
    const profileContent = readUtf8(path.join(tempHome, '.profile'));
    const fishContent = readUtf8(path.join(tempHome, '.config', 'fish', 'config.fish'));
    for (const content of [zshContent, profileContent, fishContent]) {
      assert.strictEqual(countMatches(content, /managed by get-shit-done installer/g), 2, 'marker pair remains singular');
    }

    const fakeToolsPath = path.join(codexHome, 'get-shit-done', 'bin', 'gsd-tools.cjs');
    fs.writeFileSync(
      fakeToolsPath,
      [
        '#!/usr/bin/env node',
        "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
        'process.exit(12);',
        '',
      ].join('\n'),
      'utf8',
    );

    writeSharedInstallState({
      global_installs: {
        codex: {
          config_dir: path.join(tempHome, 'stale-codex-home'),
        },
      },
    });

    let commandError = null;
    try {
      execFileSync(sharedShimPath, ['--sleep-seconds', '0'], { encoding: 'utf8' });
      assert.fail('shared shim should forward the Codex wrapper exit code');
    } catch (error) {
      commandError = error;
    }

    assert.ok(commandError, 'shared shim should exit non-zero when the wrapped command does');
    assert.strictEqual(commandError.status, 12, 'shared shim preserves exit code');
    assert.strictEqual(
      commandError.stdout.trim(),
      JSON.stringify(['yolo-ralph', '--sleep-seconds', '0']),
      'shared shim forwards arguments through the Codex wrapper',
    );
    const repairedState = JSON.parse(readUtf8(statePath));
    assert.strictEqual(repairedState.global_installs.codex.config_dir, codexHome, 'shared shim repairs stale Codex paths');

    uninstall(true, 'codex');

    assert.ok(!fs.existsSync(sharedShimPath), 'shared shim removed on last global uninstall');
    assert.ok(!fs.existsSync(statePath), 'shared install state removed on last global uninstall');
    assert.strictEqual(readUtf8(path.join(tempHome, '.zshrc')), '# zsh setup\n');
    assert.strictEqual(readUtf8(path.join(tempHome, '.profile')), '# profile setup\n');
    assert.strictEqual(readUtf8(path.join(tempHome, '.config', 'fish', 'config.fish')), 'set fish_greeting\n');
  });

  test('shared PATH persists across mixed global installs and only exposes gsd-yolo-ralph while Codex is active', () => {
    const sharedShimPath = path.join(getSharedBinDir(), GSD_YOLO_RALPH_COMMAND);

    install(true, 'claude');
    let state = JSON.parse(readUtf8(getSharedInstallStatePath()));
    assert.ok(state.global_installs.claude, 'Claude global install is recorded');
    assert.ok(!fs.existsSync(sharedShimPath), 'non-Codex installs do not publish gsd-yolo-ralph');
    assert.ok(readUtf8(path.join(tempHome, '.zshrc')).includes('$HOME/.gsd/bin'), 'shared PATH block installed');

    install(true, 'codex');
    state = JSON.parse(readUtf8(getSharedInstallStatePath()));
    assert.ok(state.global_installs.codex, 'Codex global install is recorded');
    assert.ok(fs.existsSync(sharedShimPath), 'Codex install publishes shared gsd-yolo-ralph');

    uninstall(true, 'claude');
    state = JSON.parse(readUtf8(getSharedInstallStatePath()));
    assert.deepStrictEqual(Object.keys(state.global_installs), ['codex']);
    assert.ok(fs.existsSync(sharedShimPath), 'shared shim remains while Codex is still active');
    assert.ok(readUtf8(path.join(tempHome, '.zshrc')).includes('$HOME/.gsd/bin'), 'PATH block remains while another global install is active');

    uninstall(true, 'codex');
    assert.ok(!fs.existsSync(sharedShimPath), 'shared shim removed when Codex is removed');
    assert.ok(!fs.existsSync(getSharedInstallStatePath()), 'shared state removed after the last global uninstall');
    assert.strictEqual(readUtf8(path.join(tempHome, '.zshrc')), '# zsh setup\n');
  });

  test('shared shim --help works outside a repo even when no live Codex wrapper exists', () => {
    const codexHome = path.join(tempHome, '.codex');
    install(true, 'codex');

    const sharedShimPath = path.join(getSharedBinDir(), GSD_YOLO_RALPH_COMMAND);
    fs.rmSync(getCodexYoloRalphWrapperPath(codexHome), { force: true });
    writeSharedInstallState({
      global_installs: {
        codex: {
          config_dir: path.join(tempHome, 'stale-codex-home'),
        },
      },
    });

    const help = execFileSync(sharedShimPath, ['--help'], {
      cwd: tempHome,
      encoding: 'utf8',
    });

    assert.match(help, /Usage: gsd-yolo-ralph/);
    assert.match(help, /Resolution order:/);
  });

  test('shared shim prints actionable guidance when no usable Codex wrapper exists', () => {
    const codexHome = path.join(tempHome, '.codex');
    install(true, 'codex');

    const sharedShimPath = path.join(getSharedBinDir(), GSD_YOLO_RALPH_COMMAND);
    fs.rmSync(getCodexYoloRalphWrapperPath(codexHome), { force: true });
    writeSharedInstallState({
      global_installs: {
        codex: {
          config_dir: path.join(tempHome, 'stale-codex-home'),
        },
      },
    });

    let commandError = null;
    try {
      execFileSync(sharedShimPath, [], {
        cwd: tempHome,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.fail('shared shim should fail when no usable Codex wrapper exists');
    } catch (error) {
      commandError = error;
    }

    assert.ok(commandError, 'expected shared shim to fail');
    assert.match(commandError.stderr, /could not find a usable global Codex yolo-ralph wrapper/i);
    assert.match(commandError.stderr, /npx get-shit-done-cc --codex --global/);
  });

  test('global install tests do not mutate the real shared install state path', () => {
    const beforeExists = fs.existsSync(REAL_SHARED_INSTALL_STATE_PATH);
    const beforeContent = beforeExists ? readUtf8(REAL_SHARED_INSTALL_STATE_PATH) : null;

    install(true, 'codex');

    const afterExists = fs.existsSync(REAL_SHARED_INSTALL_STATE_PATH);
    const afterContent = afterExists ? readUtf8(REAL_SHARED_INSTALL_STATE_PATH) : null;

    assert.strictEqual(afterExists, beforeExists, 'real shared install-state presence should remain unchanged');
    assert.strictEqual(afterContent, beforeContent, 'real shared install-state content should remain unchanged');
  });
});

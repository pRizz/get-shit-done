/**
 * GSD Tools Tests - Community Hooks (opt-in)
 *
 * Tests for feat/hooks-opt-in-1473d:
 *   - Hook file existence and permissions
 *   - Installer hook registration in install.js
 *   - Hook execution with opt-in enabled and disabled
 *   - Negative security tests for hooks
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');
const isWindows = process.platform === 'win32';

// Ensure the running node binary is on PATH so bash hooks can call `node`
// (Claude Code shell sessions do not have `node` on PATH).
const hookEnv = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
};

// Wrapper that always injects hookEnv so bash hooks can find `node`.
function spawnHook(hookPath, options) {
  return spawnSync('bash', [hookPath], { ...options, env: hookEnv });
}

function parseHookJson(result, label) {
  assert.notStrictEqual(result.stdout.trim(), '', `${label} should emit JSON`);
  assert.doesNotThrow(() => JSON.parse(result.stdout), `${label} stdout should be valid JSON: ${result.stdout}`);
  return JSON.parse(result.stdout);
}

function assertNeutralSuccessJson(result, label) {
  const output = parseHookJson(result, label);
  assert.strictEqual(output.continue, true, `${label} should continue`);
  return output;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTempProject(prefix = 'gsd-hook-test-') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

function cleanup(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

function writeConfigWithHooks(tmpDir, enabled) {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify({
      model_profile: 'balanced',
      hooks: { community: enabled }
    }, null, 2)
  );
}

function writeMinimalStateMd(tmpDir, content) {
  const defaultContent = content || '# Session State\n\n**Current Phase:** 01\n**Status:** Active\n';
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    defaultContent
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Hook file existence and permissions
// ─────────────────────────────────────────────────────────────────────────────

describe('hook file validation', () => {
  test('gsd-session-state.sh exists', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-session-state.sh');
    assert.ok(fs.existsSync(hookPath), 'gsd-session-state.sh should exist');
  });

  test('gsd-validate-commit.sh exists', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    assert.ok(fs.existsSync(hookPath), 'gsd-validate-commit.sh should exist');
  });

  test('gsd-phase-boundary.sh exists', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-phase-boundary.sh');
    assert.ok(fs.existsSync(hookPath), 'gsd-phase-boundary.sh should exist');
  });

  test('gsd-session-state.sh is executable', { skip: isWindows ? 'Windows has no POSIX file permissions' : false }, () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-session-state.sh');
    const stat = fs.statSync(hookPath);
    assert.ok((stat.mode & 0o111) !== 0, 'gsd-session-state.sh should be executable');
  });

  test('gsd-validate-commit.sh is executable', { skip: isWindows ? 'Windows has no POSIX file permissions' : false }, () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const stat = fs.statSync(hookPath);
    assert.ok((stat.mode & 0o111) !== 0, 'gsd-validate-commit.sh should be executable');
  });

  test('gsd-phase-boundary.sh is executable', { skip: isWindows ? 'Windows has no POSIX file permissions' : false }, () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-phase-boundary.sh');
    const stat = fs.statSync(hookPath);
    assert.ok((stat.mode & 0o111) !== 0, 'gsd-phase-boundary.sh should be executable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Installer hook registration
// ─────────────────────────────────────────────────────────────────────────────

describe('installer hook registration', () => {
  const installJsPath = path.join(__dirname, '..', 'bin', 'install.js');
  let installSource;

  beforeEach(() => {
    installSource = fs.readFileSync(installJsPath, 'utf-8');
  });

  test('install.js contains gsd-validate-commit registration block', () => {
    assert.ok(
      installSource.includes('gsd-validate-commit'),
      'install.js should contain gsd-validate-commit hook registration'
    );
    assert.ok(
      installSource.includes('validateCommitHookPath'),
      'install.js should define validateCommitHookPath variable'
    );
    assert.ok(
      installSource.includes('hasValidateCommitHook'),
      'install.js should check for existing validate-commit hook'
    );
  });

  test('install.js contains gsd-session-state registration block', () => {
    assert.ok(
      installSource.includes('gsd-session-state'),
      'install.js should contain gsd-session-state hook registration'
    );
    assert.ok(
      installSource.includes('sessionStateCommand'),
      'install.js should define sessionStateCommand variable'
    );
    assert.ok(
      installSource.includes('hasSessionStateHook'),
      'install.js should check for existing session-state hook'
    );
  });

  test('install.js contains gsd-phase-boundary registration block', () => {
    assert.ok(
      installSource.includes('gsd-phase-boundary'),
      'install.js should contain gsd-phase-boundary hook registration'
    );
    assert.ok(
      installSource.includes('phaseBoundaryCommand'),
      'install.js should define phaseBoundaryCommand variable'
    );
    assert.ok(
      installSource.includes('hasPhaseBoundaryHook'),
      'install.js should check for existing phase-boundary hook'
    );
  });

  test('install.js registers validate-commit with PreToolUse event and Bash matcher', () => {
    assert.ok(
      installSource.includes("settings.hooks[preToolEvent].push"),
      'validate-commit should be pushed to preToolEvent hooks array'
    );
    const validateCommitBlock = installSource.substring(
      installSource.indexOf('// Configure commit validation hook'),
      installSource.indexOf('// Configure session state orientation hook')
    );
    assert.ok(
      validateCommitBlock.includes("matcher: 'Bash'"),
      'validate-commit hook should use Bash matcher'
    );
    assert.ok(
      validateCommitBlock.includes('preToolEvent'),
      'validate-commit hook should register on preToolEvent (PreToolUse)'
    );
    assert.ok(
      validateCommitBlock.includes('buildBashHookHandler(validateCommitHookPath, 5)') &&
        installSource.includes("command: 'bash'"),
      'validate-commit hook should use exec-form bash command'
    );
    assert.ok(
      validateCommitBlock.includes('args: [scriptPath]') ||
        validateCommitBlock.includes('...validateCommitHandler'),
      'validate-commit hook should pass the script path through args'
    );
  });

  test('install.js adds all 3 new hooks to the uninstall cleanup list', () => {
    const gsdHooksMatch = installSource.match(/const gsdHooks\s*=\s*\[([^\]]+)\]/);
    assert.ok(gsdHooksMatch, 'install.js should define gsdHooks array for uninstall cleanup');

    const gsdHooksContent = gsdHooksMatch[1];
    assert.ok(
      gsdHooksContent.includes('gsd-session-state.sh'),
      'gsdHooks should include gsd-session-state.sh'
    );
    assert.ok(
      gsdHooksContent.includes('gsd-validate-commit.sh'),
      'gsdHooks should include gsd-validate-commit.sh'
    );
    assert.ok(
      gsdHooksContent.includes('gsd-phase-boundary.sh'),
      'gsdHooks should include gsd-phase-boundary.sh'
    );
  });

  test('install.js log messages indicate opt-in behavior', () => {
    assert.ok(
      installSource.includes('opt-in via config'),
      'install.js should mention opt-in in log messages'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Opt-in gating behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('opt-in gating behavior', { skip: isWindows ? 'bash hooks require unix shell' : false }, () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate-commit is a no-op when hooks.community is false', () => {
    writeConfigWithHooks(tmpDir, false);
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Should exit 0 (no-op) even with a bad commit message
    assert.strictEqual(result.status, 0, `Should be no-op when disabled, got ${result.status}`);
    assertNeutralSuccessJson(result, 'validate-commit disabled');
  });

  test('validate-commit is a no-op when config.json is absent', (t) => {
    // No config.json at all
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-bare-'));
    t.after(() => { fs.rmSync(bareDir, { recursive: true, force: true }); });
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: bareDir,
    });

    assert.strictEqual(result.status, 0, `Should be no-op without config.json, got ${result.status}`);
    assertNeutralSuccessJson(result, 'validate-commit missing config');
  });

  test('session-state is a no-op when hooks.community is false', () => {
    writeConfigWithHooks(tmpDir, false);
    writeMinimalStateMd(tmpDir);
    const hookPath = path.join(HOOKS_DIR, 'gsd-session-state.sh');

    const result = spawnHook(hookPath, {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    const output = assertNeutralSuccessJson(result, 'session-state disabled');
    assert.strictEqual(output.hookSpecificOutput, undefined, 'disabled session-state should not inject context');
  });

  test('phase-boundary is a no-op when hooks.community is false', () => {
    writeConfigWithHooks(tmpDir, false);
    const hookPath = path.join(HOOKS_DIR, 'gsd-phase-boundary.sh');
    const input = JSON.stringify({
      tool_input: { file_path: '.planning/STATE.md' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    const output = assertNeutralSuccessJson(result, 'phase-boundary disabled');
    assert.strictEqual(output.hookSpecificOutput, undefined, 'disabled phase-boundary should not inject context');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hook execution when enabled
// ─────────────────────────────────────────────────────────────────────────────

describe('hook execution when enabled', { skip: isWindows ? 'bash hooks require unix shell' : false }, () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfigWithHooks(tmpDir, true);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate-commit allows valid conventional commit', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "fix(core): add locking mechanism"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Valid commit should exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assertNeutralSuccessJson(result, 'validate-commit valid commit');
  });

  test('validate-commit blocks non-conventional commit', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Non-conventional commit should emit JSON deny and exit 0, got ${result.status}`);
    const output = assertNeutralSuccessJson(result, 'validate-commit invalid commit');
    assert.strictEqual(output.hookSpecificOutput?.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput?.permissionDecisionReason || '', /Conventional Commits/);
  });

  test('validate-commit allows non-commit commands', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git push origin main' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Non-commit command should exit 0, got ${result.status}`);
    assertNeutralSuccessJson(result, 'validate-commit non-commit command');
  });

  test('session-state outputs state info when enabled', () => {
    writeMinimalStateMd(tmpDir);
    const hookPath = path.join(HOOKS_DIR, 'gsd-session-state.sh');

    const result = spawnHook(hookPath, {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    const output = assertNeutralSuccessJson(result, 'session-state enabled');
    assert.match(output.hookSpecificOutput?.additionalContext || '', /STATE\.md exists/);
  });

  test('session-state exits 0 without .planning/ (in enabled project)', (t) => {
    // Create a dir with config but no STATE.md
    const noStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-nostate-'));
    t.after(() => { fs.rmSync(noStateDir, { recursive: true, force: true }); });
    fs.mkdirSync(path.join(noStateDir, '.planning'), { recursive: true });
    writeConfigWithHooks(noStateDir, true);
    const hookPath = path.join(HOOKS_DIR, 'gsd-session-state.sh');

    const result = spawnHook(hookPath, {
      input: '',
      encoding: 'utf-8',
      cwd: noStateDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    const output = assertNeutralSuccessJson(result, 'session-state missing STATE');
    assert.match(output.hookSpecificOutput?.additionalContext || '', /Project State|No \.planning/);
  });

  test('phase-boundary detects .planning/ writes when enabled', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-phase-boundary.sh');
    const input = JSON.stringify({
      tool_input: { file_path: '.planning/STATE.md' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    const output = assertNeutralSuccessJson(result, 'phase-boundary enabled');
    assert.match(output.hookSpecificOutput?.additionalContext || '', /\.planning\/ file modified/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Negative security tests for hooks
// ─────────────────────────────────────────────────────────────────────────────

describe('hook security tests', { skip: isWindows ? 'bash hooks require unix shell' : false }, () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfigWithHooks(tmpDir, true);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate-commit blocks message with shell metacharacters', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "$(rm -rf /)"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Shell metacharacter message should be denied via JSON: ${result.status}`);
    const output = assertNeutralSuccessJson(result, 'validate-commit shell metacharacter');
    assert.strictEqual(output.hookSpecificOutput?.permissionDecision, 'deny');
  });

  test('validate-commit blocks message with backtick injection', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "`whoami`"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Backtick injection should be denied via JSON: ${result.status}`);
    const output = assertNeutralSuccessJson(result, 'validate-commit backtick injection');
    assert.strictEqual(output.hookSpecificOutput?.permissionDecision, 'deny');
  });

  test('validate-commit allows commit with scope containing special chars', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "fix(api/v2): handle edge case"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Valid commit with / in scope should be allowed: ${result.status}`);
    assertNeutralSuccessJson(result, 'validate-commit special scope');
  });

  test('phase-boundary handles malformed JSON input gracefully', () => {
    const hookPath = path.join(HOOKS_DIR, 'gsd-phase-boundary.sh');
    const input = 'not json at all';

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should not crash on malformed JSON: ${result.stderr}`);
    assertNeutralSuccessJson(result, 'phase-boundary malformed JSON');
  });

  test('hooks handle config.json with broken JSON gracefully', () => {
    // Write malformed JSON config
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      '{ broken json'
    );

    const hookPath = path.join(HOOKS_DIR, 'gsd-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnHook(hookPath, {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Should exit 0 (treat malformed config as disabled)
    assert.strictEqual(result.status, 0, `Malformed config should be treated as disabled: ${result.status}`);
    assertNeutralSuccessJson(result, 'validate-commit malformed config');
  });
});

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { createTempGitProject, cleanup, runGsdTools } = require('./helpers.cjs');

const ROOT = path.join(__dirname, '..');
const COMMAND_PATH = path.join(ROOT, 'commands', 'gsd', 'yolo-ralph.md');
const WORKFLOW_PATH = path.join(ROOT, 'get-shit-done', 'workflows', 'yolo-ralph.md');
const README_PATH = path.join(ROOT, 'README.md');
const COMMANDS_DOC_PATH = path.join(ROOT, 'docs', 'COMMANDS.md');
const CLI_TOOLS_DOC_PATH = path.join(ROOT, 'docs', 'CLI-TOOLS.md');
const CONFIG_DOC_PATH = path.join(ROOT, 'docs', 'CONFIGURATION.md');
const HELP_PATH = path.join(ROOT, 'get-shit-done', 'workflows', 'help.md');

function writePlanningFiles(tmpDir, { roadmap = true, incomplete = true } = {}) {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    '# Project State\n\n## Current Position\n\nPhase: 1 of 1 (Build)\nPlan: 01-01 queued\nStatus: Ready\n'
  );

  if (roadmap) {
    const checkbox = incomplete ? ' ' : 'x';
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-build');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan\n');
    if (!incomplete) {
      fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary\n');
      fs.writeFileSync(path.join(phaseDir, '01-VERIFICATION.md'), '---\nstatus: passed\n---\n# Verification\n');
    }

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n\n- [${checkbox}] **Phase 1: Build**\n\n### Phase 1: Build\n**Goal:** Build it\n`
    );
  }
}

function installLocalAsset(tmpDir, launcher = 'codex') {
  if (launcher === 'codex') {
    const skillDir = path.join(tmpDir, '.codex', 'skills', 'gsd-yolo-discuss-plan-execute-commit-and-push');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf8');
    return;
  }

  if (launcher === 'claude') {
    const commandDir = path.join(tmpDir, '.claude', 'commands', 'gsd');
    fs.mkdirSync(commandDir, { recursive: true });
    fs.writeFileSync(path.join(commandDir, 'yolo-discuss-plan-execute-commit-and-push.md'), '# Command\n', 'utf8');
    return;
  }

  if (launcher === 'cursor-agent') {
    const skillDir = path.join(tmpDir, '.cursor', 'skills', 'gsd-yolo-discuss-plan-execute-commit-and-push');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf8');
    return;
  }

  throw new Error(`Unsupported launcher asset install: ${launcher}`);
}

function installFakeLauncher(tmpDir, launcher, behavior) {
  const binDir = path.join(tmpDir, 'fake-bin');
  fs.mkdirSync(binDir, { recursive: true });

  const safeLauncher = launcher.replace(/[^a-z0-9-]/gi, '_');
  const fakeJs = path.join(binDir, `fake-${safeLauncher}.js`);
  const jsSource = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const launcher = ${JSON.stringify(launcher)};
const repoRoot = launcher === 'codex'
  ? (args.includes('-C') ? args[args.indexOf('-C') + 1] : process.cwd())
  : process.cwd();
const outputPath = launcher === 'codex' && args.includes('-o')
  ? args[args.indexOf('-o') + 1]
  : null;
const behavior = process.env.GSD_TEST_LAUNCHER_BEHAVIOR || 'advance';
const sleep = milliseconds => {
  if (milliseconds <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, milliseconds);
};

if (args.includes('--version')) {
  process.stdout.write('codex-test\\n');
  process.exit(0);
}

const messages = {
  advance: 'Advanced the strict-push wrapper.',
  stalled: 'Returned successfully without changing anything.',
  blocker: 'Phase 1: verification status is gaps_found. Skipping commit/push.',
  stdout_false_blocker: 'Returned successfully without changing anything.',
  last_message_blocker: 'Phase 1: verification status is gaps_found. Skipping commit/push.',
  needs_audit: 'Completed all phase work.',
  milestone_done: 'No active roadmap remains.',
  slow_stage_markers: 'Advanced the strict-push wrapper.',
  slow_ambiguous: 'Advanced the strict-push wrapper.',
};

const phaseDir = path.join(repoRoot, '.planning', 'phases', '01-build');
const contextPath = path.join(phaseDir, '01-CONTEXT.md');
const planPath = path.join(phaseDir, '01-01-PLAN.md');
const summaryPath = path.join(phaseDir, '01-01-SUMMARY.md');
const verificationPath = path.join(phaseDir, '01-VERIFICATION.md');
const argsPath = path.join(repoRoot, launcher.replace(/[^a-z0-9-]/gi, '_') + '-args.json');
fs.writeFileSync(argsPath, JSON.stringify(args, null, 2), 'utf8');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, messages[behavior] || behavior, 'utf8');
}

if (launcher === 'cursor-agent') {
  process.stdout.write(JSON.stringify({ type: 'message', behavior, content: messages[behavior] || behavior }) + '\\n');
} else {
  process.stdout.write(JSON.stringify({ type: 'message', behavior }) + '\\n');
}

if (launcher !== 'codex' && behavior === 'last_message_blocker') {
  process.stdout.write((messages[behavior] || behavior) + '\\n');
}

if (behavior === 'stdout_false_blocker') {
  process.stdout.write('Workflow note: Skipping commit/push until audit is complete.\\n');
}

if (behavior === 'fail') {
  process.stderr.write('simulated codex failure\\n');
  process.exit(2);
}

if (behavior === 'slow_stage_markers') {
  fs.mkdirSync(phaseDir, { recursive: true });
  process.stdout.write('Launching gsd-discuss-phase 1\\n');
  sleep(1100);
  fs.writeFileSync(contextPath, '# Context\\n', 'utf8');
  process.stdout.write('Created: .planning/phases/01-build/01-CONTEXT.md\\n');
  sleep(1100);
  fs.writeFileSync(planPath, '# Plan\\nupdated\\n', 'utf8');
  process.stdout.write('Created: .planning/phases/01-build/01-01-PLAN.md\\n');
  sleep(1100);
  fs.writeFileSync(summaryPath, '# Summary\\n', 'utf8');
  process.stdout.write('Created: .planning/phases/01-build/01-01-SUMMARY.md\\n');
  sleep(1100);
  fs.writeFileSync(verificationPath, '---\\nstatus: passed\\n---\\n# Verification\\n', 'utf8');
  process.stdout.write('Verification passed. Wrote 01-VERIFICATION.md\\n');
  sleep(1100);
  fs.writeFileSync(path.join(repoRoot, 'advance.txt'), String(Date.now()), 'utf8');
  execSync('git add -A', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -m "test: yolo-ralph advanced"', { cwd: repoRoot, stdio: 'pipe' });
  process.stdout.write('git commit -m "test: yolo-ralph advanced"\\n');
  process.exit(0);
}

if (behavior === 'slow_ambiguous') {
  process.stdout.write('Working through the wrapper...\\n');
  sleep(1100);
  process.stdout.write('Still making progress...\\n');
  sleep(1100);
  process.stdout.write('No explicit phase marker yet.\\n');
  sleep(1100);
  fs.writeFileSync(path.join(repoRoot, 'advance.txt'), String(Date.now()), 'utf8');
  execSync('git add -A', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -m "test: yolo-ralph advanced"', { cwd: repoRoot, stdio: 'pipe' });
  process.exit(0);
}

if (behavior === 'advance') {
  fs.writeFileSync(path.join(repoRoot, 'advance.txt'), String(Date.now()), 'utf8');
  execSync('git add -A', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -m "test: yolo-ralph advanced"', { cwd: repoRoot, stdio: 'pipe' });
}

if (behavior === 'needs_audit') {
  const roadmapPath = path.join(repoRoot, '.planning', 'ROADMAP.md');
  const phaseDir = path.join(repoRoot, '.planning', 'phases', '01-build');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary\\n', 'utf8');
  fs.writeFileSync(path.join(phaseDir, '01-VERIFICATION.md'), '---\\nstatus: passed\\n---\\n# Verification\\n', 'utf8');
  const roadmap = fs.readFileSync(roadmapPath, 'utf8').replace('- [ ] **Phase 1: Build**', '- [x] **Phase 1: Build**');
  fs.writeFileSync(roadmapPath, roadmap, 'utf8');
  execSync('git add -A', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -m "test: yolo-ralph needs audit"', { cwd: repoRoot, stdio: 'pipe' });
}

if (behavior === 'milestone_done') {
  fs.rmSync(path.join(repoRoot, '.planning', 'ROADMAP.md'), { force: true });
  execSync('git add -A', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -m "test: yolo-ralph milestone done"', { cwd: repoRoot, stdio: 'pipe' });
}

process.exit(0);
`;
  fs.writeFileSync(fakeJs, jsSource, 'utf8');
  fs.chmodSync(fakeJs, 0o755);

  const unixWrapper = path.join(binDir, launcher);
  fs.writeFileSync(
    unixWrapper,
    `#!/usr/bin/env bash\n"${process.execPath}" "$(dirname "$0")/${path.basename(fakeJs)}" "$@"\n`,
    'utf8'
  );
  fs.chmodSync(unixWrapper, 0o755);

  const windowsWrapper = path.join(binDir, `${launcher}.cmd`);
  fs.writeFileSync(
    windowsWrapper,
    `@echo off\r\n"${process.execPath}" "%~dp0\\${path.basename(fakeJs)}" %*\r\n`,
    'utf8'
  );

  return {
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    GSD_TEST_LAUNCHER_BEHAVIOR: behavior,
  };
}

function installGitOnlyPath(tmpDir) {
  const binDir = path.join(tmpDir, 'git-only-bin');
  fs.mkdirSync(binDir, { recursive: true });
  const gitBinary = execSync(process.platform === 'win32' ? 'where git' : 'which git', {
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim().split(/\r?\n/)[0];

  const unixWrapper = path.join(binDir, 'git');
  fs.writeFileSync(
    unixWrapper,
    `#!/bin/sh\n"${gitBinary}" "$@"\n`,
    'utf8'
  );
  fs.chmodSync(unixWrapper, 0o755);

  const windowsWrapper = path.join(binDir, 'git.cmd');
  fs.writeFileSync(
    windowsWrapper,
    `@echo off\r\n"${gitBinary}" %*\r\n`,
    'utf8'
  );

  return {
    PATH: binDir,
  };
}

describe('yolo-ralph command surfaces', () => {
  test('command file exists with expected frontmatter', () => {
    const content = fs.readFileSync(COMMAND_PATH, 'utf8');
    assert.ok(content.startsWith('---\nname: gsd:yolo-ralph\n'));
    assert.ok(content.includes('argument-hint: "--agent-cli <selector> [--max-iterations N] [--sleep-seconds N] [--heartbeat-seconds N] [--stage-tick-seconds N]"'));
  });

  test('workflow file exists and shells out to gsd-tools', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    assert.ok(content.includes('gsd-tools.cjs" yolo-ralph $ARGUMENTS'));
    assert.ok(content.includes('This workflow is intentionally thin.'));
  });

  test('docs mention yolo-ralph', () => {
    assert.ok(fs.readFileSync(README_PATH, 'utf8').includes('/gsd-yolo-ralph'));
    assert.ok(fs.readFileSync(COMMANDS_DOC_PATH, 'utf8').includes('### `/gsd-yolo-ralph`'));
    assert.ok(fs.readFileSync(CLI_TOOLS_DOC_PATH, 'utf8').includes('node gsd-tools.cjs yolo-ralph'));
    assert.ok(fs.readFileSync(CONFIG_DOC_PATH, 'utf8').includes('workflow.yolo_ralph_max_iterations'));
    assert.ok(fs.readFileSync(HELP_PATH, 'utf8').includes('`/gsd-yolo-ralph --agent-cli <selector> [--max-iterations N] [--sleep-seconds N] [--heartbeat-seconds N] [--stage-tick-seconds N]`'));
  });
});

describe('yolo-ralph CLI behavior', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
    tmpDir = null;
  });

  test('preflight fails when --agent-cli is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph'], tmpDir, installGitOnlyPath(tmpDir));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Missing required --agent-cli'));
  });

  test('--help succeeds outside a git repo', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-yolo-help-'));

    const result = runGsdTools(['yolo-ralph', '--help'], tmpDir);

    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.match(result.output, /Usage: gsd-tools yolo-ralph/);
    assert.match(result.output, /Help succeeds from any directory/);
  });

  test('unknown flags still fail with usage guidance', () => {
    tmpDir = createTempGitProject();

    const result = runGsdTools(['yolo-ralph', '--bogus-flag'], tmpDir);

    assert.strictEqual(result.success, false);
    assert.match(result.error, /Unknown yolo-ralph argument: --bogus-flag/);
    assert.match(result.error, /Usage: gsd-tools yolo-ralph/);
  });

  test('unknown agent selectors fail with supported selector guidance', () => {
    tmpDir = createTempGitProject();

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'bogus'], tmpDir);

    assert.strictEqual(result.success, false);
    assert.match(result.error, /Unknown --agent-cli selector: bogus/);
    assert.match(result.error, /Supported selectors: codex, claude, cursor-agent, agent/);
  });

  test('preflight fails when codex is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex'], tmpDir, installGitOnlyPath(tmpDir));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Codex CLI is not available on PATH'));
  });

  test('preflight fails when claude is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'claude');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'claude'], tmpDir, installGitOnlyPath(tmpDir));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Claude CLI is not available on PATH'));
  });

  test('preflight fails when cursor-agent is missing and agent alias explains the mapping', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'cursor-agent');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'agent'], tmpDir, installGitOnlyPath(tmpDir));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Cursor CLI is not available on PATH'));
    assert.ok(result.error.includes('Selector "agent" resolves to Cursor CLI'));
  });

  test('preflight fails when the GSD project is uninitialized', () => {
    tmpDir = createTempGitProject();
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'advance'));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('/gsd-new-project'));
  });

  test('preflight fails when the Codex skill asset is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex'], tmpDir, {
      ...installFakeLauncher(tmpDir, 'codex', 'advance'),
      CODEX_HOME: path.join(tmpDir, 'empty-codex-home'),
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Missing GSD Codex asset'));
  });

  test('preflight fails when the Claude command asset is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'claude'], tmpDir, installFakeLauncher(tmpDir, 'claude', 'advance'));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Missing GSD Claude asset'));
  });

  test('preflight fails when the Cursor skill asset is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'cursor-agent'], tmpDir, {
      ...installFakeLauncher(tmpDir, 'cursor-agent', 'advance'),
      CURSOR_CONFIG_DIR: path.join(tmpDir, 'empty-cursor-home'),
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Missing GSD Cursor asset'));
  });

  test('raw output uses default max iterations and sleep seconds', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir, { incomplete: false });
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.agent_cli, 'codex');
    assert.strictEqual(output.launcher_profile, 'codex');
    assert.strictEqual(output.max_iterations, 20);
    assert.strictEqual(output.sleep_seconds, 10);
    assert.strictEqual(output.heartbeat_seconds, 60);
    assert.strictEqual(output.stage_tick_seconds, 1);
    assert.strictEqual(output.status, 'needs_audit');
  });

  test('flags override config values', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir, { incomplete: false });
    installLocalAsset(tmpDir, 'codex');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { yolo_ralph_max_iterations: 9, yolo_ralph_sleep_seconds: 4, yolo_ralph_heartbeat_seconds: 45, yolo_ralph_stage_tick_seconds: 8 } }, null, 2),
      'utf8'
    );

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--max-iterations', '3', '--sleep-seconds', '0', '--heartbeat-seconds', '1', '--stage-tick-seconds', '2'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.max_iterations, 3);
    assert.strictEqual(output.sleep_seconds, 0);
    assert.strictEqual(output.heartbeat_seconds, 1);
    assert.strictEqual(output.stage_tick_seconds, 2);
  });

  test('successful advanced iterations continue until the cap is reached', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--max-iterations', '2', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'max_iterations_reached');
    assert.strictEqual(output.iterations_completed, 2);
    assert.strictEqual(output.advanced_iterations, 2);
  });

  test('successful iteration with no state change is classified as stalled', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'stalled'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'stalled');
    assert.strictEqual(output.iterations_completed, 1);
  });

  test('blocker-like phrases in stdout do not fail a successful run when last message is clean', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'stdout_false_blocker'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'stalled');
    assert.strictEqual(output.failed_iterations, 0);
  });

  test('blocker phrases in the last message still classify the iteration as failed', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'last_message_blocker'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'failed');
    assert.strictEqual(output.failed_iterations, 1);
  });

  test('non-zero launcher exit is classified as failed', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'fail'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'failed');
    assert.strictEqual(output.failed_iterations, 1);
  });

  test('completing all phases is classified as needs_audit', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'needs_audit'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'needs_audit');
    assert.strictEqual(output.iterations_completed, 1);
  });

  test('between-milestones state is classified as milestone_done', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir, { roadmap: false });
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'milestone_done');
    assert.strictEqual(output.iterations_completed, 0);
  });

  test('persistent run artifacts are written under .planning/tmp/yolo-ralph', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'codex', '--raw', '--max-iterations', '1', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'codex', 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    const runDir = path.join(tmpDir, output.run_dir);
    assert.ok(fs.existsSync(path.join(runDir, 'run.json')), 'run.json should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iterations.jsonl')), 'iterations.jsonl should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iter-01', 'stdout.log')), 'stdout log should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iter-01', 'stderr.log')), 'stderr log should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iter-01', 'last-message.txt')), 'last message file should exist');
  });

  test('non-raw runs emit heartbeat lines and one stage transition per detected stage', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(
      ['yolo-ralph', '--agent-cli', 'codex', '--max-iterations', '1', '--sleep-seconds', '0', '--heartbeat-seconds', '1', '--stage-tick-seconds', '1'],
      tmpDir,
      installFakeLauncher(tmpDir, 'codex', 'slow_stage_markers')
    );

    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.match(result.output, /Heartbeat: iter 1\/1/);
    assert.strictEqual((result.output.match(/Stage -> discuss/g) || []).length, 1);
    assert.strictEqual((result.output.match(/Stage -> plan/g) || []).length, 1);
    assert.strictEqual((result.output.match(/Stage -> execute/g) || []).length, 1);
    assert.strictEqual((result.output.match(/Stage -> verify/g) || []).length, 1);
    assert.strictEqual((result.output.match(/Stage -> commit\/push/g) || []).length, 1);
  });

  test('raw mode stays JSON-only even when heartbeat flags are provided', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(
      ['yolo-ralph', '--agent-cli', 'codex', '--raw', '--max-iterations', '1', '--sleep-seconds', '0', '--heartbeat-seconds', '1', '--stage-tick-seconds', '1'],
      tmpDir,
      installFakeLauncher(tmpDir, 'codex', 'slow_stage_markers')
    );

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'max_iterations_reached');
    assert.ok(!result.output.includes('Heartbeat:'), 'raw output should not include heartbeat text');
    assert.ok(!result.output.includes('Stage ->'), 'raw output should not include live stage text');
  });

  test('ambiguous live output falls back to running stage instead of guessing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'codex');

    const result = runGsdTools(
      ['yolo-ralph', '--agent-cli', 'codex', '--max-iterations', '1', '--sleep-seconds', '0', '--heartbeat-seconds', '1', '--stage-tick-seconds', '0'],
      tmpDir,
      installFakeLauncher(tmpDir, 'codex', 'slow_ambiguous')
    );

    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.match(result.output, /Heartbeat: iter 1\/1 \| phase 1 \(Build\) \| stage running/);
    assert.ok(!result.output.includes('Stage -> discuss'));
    assert.ok(!result.output.includes('Stage -> plan'));
  });

  test('claude launcher uses the strict-push command prompt and classifies blocker text from combined output', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'claude');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'claude', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'claude', 'last_message_blocker'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const args = JSON.parse(fs.readFileSync(path.join(tmpDir, 'claude-args.json'), 'utf8'));
    assert.deepStrictEqual(args, ['-p', '/gsd-yolo-discuss-plan-execute-commit-and-push']);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.agent_cli, 'claude');
    assert.strictEqual(output.launcher_profile, 'claude');
    assert.strictEqual(output.status, 'failed');
  });

  test('cursor-agent launcher uses print-mode json and agent alias resolves to cursor-agent profile', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalAsset(tmpDir, 'cursor-agent');

    const result = runGsdTools(['yolo-ralph', '--agent-cli', 'agent', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeLauncher(tmpDir, 'cursor-agent', 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const args = JSON.parse(fs.readFileSync(path.join(tmpDir, 'cursor-agent-args.json'), 'utf8'));
    assert.deepStrictEqual(args, ['-p', 'Run the skill gsd-yolo-discuss-plan-execute-commit-and-push in this repository.', '--output-format', 'json']);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.agent_cli, 'agent');
    assert.strictEqual(output.launcher_profile, 'cursor-agent');
  });
});

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
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

function installLocalSkill(tmpDir) {
  const skillDir = path.join(tmpDir, '.codex', 'skills', 'gsd-yolo-discuss-plan-execute-commit-and-push');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf8');
}

function installFakeCodex(tmpDir, behavior) {
  const binDir = path.join(tmpDir, 'fake-bin');
  fs.mkdirSync(binDir, { recursive: true });

  const fakeJs = path.join(binDir, 'fake-codex.js');
  const jsSource = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const cdIndex = args.indexOf('-C');
const repoRoot = cdIndex !== -1 ? args[cdIndex + 1] : process.cwd();
const outIndex = args.indexOf('-o');
const outputPath = outIndex !== -1 ? args[outIndex + 1] : null;
const behavior = process.env.GSD_TEST_CODEX_BEHAVIOR || 'advance';

if (args.includes('--version')) {
  process.stdout.write('codex-test\\n');
  process.exit(0);
}

const messages = {
  advance: 'Advanced the strict-push wrapper.',
  stalled: 'Returned successfully without changing anything.',
  blocker: 'Phase 1: verification status is gaps_found. Skipping commit/push.',
  needs_audit: 'Completed all phase work.',
  milestone_done: 'No active roadmap remains.',
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, messages[behavior] || behavior, 'utf8');
}

process.stdout.write(JSON.stringify({ type: 'message', behavior }) + '\\n');

if (behavior === 'fail') {
  process.stderr.write('simulated codex failure\\n');
  process.exit(2);
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

  const unixWrapper = path.join(binDir, 'codex');
  fs.writeFileSync(
    unixWrapper,
    `#!/usr/bin/env bash\n"${process.execPath}" "$(dirname "$0")/fake-codex.js" "$@"\n`,
    'utf8'
  );
  fs.chmodSync(unixWrapper, 0o755);

  const windowsWrapper = path.join(binDir, 'codex.cmd');
  fs.writeFileSync(
    windowsWrapper,
    `@echo off\r\n"${process.execPath}" "%~dp0\\fake-codex.js" %*\r\n`,
    'utf8'
  );

  return {
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    GSD_TEST_CODEX_BEHAVIOR: behavior,
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
    assert.ok(content.includes('argument-hint: "[--max-iterations N] [--sleep-seconds N]"'));
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
    assert.ok(fs.readFileSync(HELP_PATH, 'utf8').includes('`/gsd-yolo-ralph [--max-iterations N] [--sleep-seconds N]`'));
  });
});

describe('yolo-ralph CLI behavior', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
    tmpDir = null;
  });

  test('preflight fails when codex is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph'], tmpDir, {
      ...installGitOnlyPath(tmpDir),
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Codex CLI is not available on PATH'));
  });

  test('preflight fails when the GSD project is uninitialized', () => {
    tmpDir = createTempGitProject();
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph'], tmpDir, installFakeCodex(tmpDir, 'advance'));

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('/gsd-new-project'));
  });

  test('preflight fails when the Codex skill asset is missing', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);

    const result = runGsdTools(['yolo-ralph'], tmpDir, {
      ...installFakeCodex(tmpDir, 'advance'),
      CODEX_HOME: path.join(tmpDir, 'empty-codex-home'),
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Missing Codex skill asset'));
  });

  test('raw output uses default max iterations and sleep seconds', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir, { incomplete: false });
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw'], tmpDir, installFakeCodex(tmpDir, 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.max_iterations, 20);
    assert.strictEqual(output.sleep_seconds, 10);
    assert.strictEqual(output.status, 'needs_audit');
  });

  test('flags override config values', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir, { incomplete: false });
    installLocalSkill(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { yolo_ralph_max_iterations: 9, yolo_ralph_sleep_seconds: 4 } }, null, 2),
      'utf8'
    );

    const result = runGsdTools(['yolo-ralph', '--raw', '--max-iterations', '3', '--sleep-seconds', '0'], tmpDir, installFakeCodex(tmpDir, 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.max_iterations, 3);
    assert.strictEqual(output.sleep_seconds, 0);
  });

  test('successful advanced iterations continue until the cap is reached', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw', '--max-iterations', '2', '--sleep-seconds', '0'], tmpDir, installFakeCodex(tmpDir, 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'max_iterations_reached');
    assert.strictEqual(output.iterations_completed, 2);
    assert.strictEqual(output.advanced_iterations, 2);
  });

  test('successful iteration with no state change is classified as stalled', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeCodex(tmpDir, 'stalled'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'stalled');
    assert.strictEqual(output.iterations_completed, 1);
  });

  test('non-zero Codex exit is classified as failed', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeCodex(tmpDir, 'fail'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'failed');
    assert.strictEqual(output.failed_iterations, 1);
  });

  test('completing all phases is classified as needs_audit', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw', '--sleep-seconds', '0'], tmpDir, installFakeCodex(tmpDir, 'needs_audit'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'needs_audit');
    assert.strictEqual(output.iterations_completed, 1);
  });

  test('between-milestones state is classified as milestone_done', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir, { roadmap: false });
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw'], tmpDir, installFakeCodex(tmpDir, 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'milestone_done');
    assert.strictEqual(output.iterations_completed, 0);
  });

  test('persistent run artifacts are written under .planning/tmp/yolo-ralph', () => {
    tmpDir = createTempGitProject();
    writePlanningFiles(tmpDir);
    installLocalSkill(tmpDir);

    const result = runGsdTools(['yolo-ralph', '--raw', '--max-iterations', '1', '--sleep-seconds', '0'], tmpDir, installFakeCodex(tmpDir, 'advance'));

    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    const runDir = path.join(tmpDir, output.run_dir);
    assert.ok(fs.existsSync(path.join(runDir, 'run.json')), 'run.json should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iterations.jsonl')), 'iterations.jsonl should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iter-01', 'stdout.log')), 'stdout log should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iter-01', 'stderr.log')), 'stderr log should exist');
    assert.ok(fs.existsSync(path.join(runDir, 'iter-01', 'last-message.txt')), 'last message file should exist');
  });
});

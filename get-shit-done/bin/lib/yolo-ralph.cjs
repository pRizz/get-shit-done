const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  loadConfig,
  execGit,
  planningDir,
  toPosixPath,
  pathExistsInternal,
  getMilestoneInfo,
  output,
  error,
} = require('./core.cjs');
const { analyzeRoadmapInternal } = require('./roadmap.cjs');

const TARGET_SKILL = '$gsd-yolo-discuss-plan-execute-commit-and-push';
const TARGET_SKILL_NAME = 'gsd-yolo-discuss-plan-execute-commit-and-push';
const BLOCKER_PATTERNS = [
  /verification status is human_needed/i,
  /verification status is gaps_found/i,
  /skipping commit\/push/i,
  /lifecycle validation failed/i,
  /phase .* not found in roadmap/i,
  /no planning structure found/i,
  /run \/gsd-new-project/i,
  /fallback\/manual artifacts detected/i,
  /halted: verification status is /i,
];

function writeStdout(text) {
  fs.writeSync(1, text);
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf-8');
}

function appendJsonl(filePath, record) {
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function makeRunId() {
  return nowIso().replace(/[:.]/g, '-');
}

function sleepSync(milliseconds) {
  if (milliseconds <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, milliseconds);
}

function shortHash(hash) {
  return hash ? hash.slice(0, 7) : 'none';
}

function parseNonNegativeInteger(value, flagName, allowZero = false) {
  if (value === null || value === undefined || value === '') return null;
  if (!/^\d+$/.test(String(value))) {
    error(`${flagName} must be ${allowZero ? 'a non-negative integer' : 'a positive integer'}`);
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!allowZero && parsed < 1) {
    error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(args) {
  const options = {
    maxIterations: null,
    sleepSeconds: null,
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    if (token === '--max-iterations') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) error('Usage: gsd-tools yolo-ralph [--max-iterations N] [--sleep-seconds N]');
      options.maxIterations = parseNonNegativeInteger(value, '--max-iterations');
      i += 1;
      continue;
    }

    if (token === '--sleep-seconds') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) error('Usage: gsd-tools yolo-ralph [--max-iterations N] [--sleep-seconds N]');
      options.sleepSeconds = parseNonNegativeInteger(value, '--sleep-seconds', true);
      i += 1;
      continue;
    }

    error(`Unknown yolo-ralph argument: ${token}\nUsage: gsd-tools yolo-ralph [--max-iterations N] [--sleep-seconds N]`);
  }

  return options;
}

function resolveRepoRoot(cwd) {
  const result = execGit(cwd, ['rev-parse', '--show-toplevel']);
  if (result.exitCode !== 0 || !result.stdout) {
    error(
      'No git repository detected.\n\n' +
      'Run this command from a Git-backed project root or its subdirectories.\n' +
      'If this repo has not been initialized for GSD yet, start from the repo root and run /gsd-new-project.'
    );
  }
  return result.stdout;
}

function ensureRunLogsIgnored(repoRoot) {
  const gitDirResult = execGit(repoRoot, ['rev-parse', '--git-dir']);
  if (gitDirResult.exitCode !== 0 || !gitDirResult.stdout) return;

  const gitDir = path.isAbsolute(gitDirResult.stdout)
    ? gitDirResult.stdout
    : path.resolve(repoRoot, gitDirResult.stdout);
  const excludePath = path.join(gitDir, 'info', 'exclude');
  const entries = [
    '/.planning/tmp/yolo-ralph/',
    '/.planning/workstreams/*/tmp/yolo-ralph/',
  ];

  let existing = '';
  try {
    existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf-8') : '';
  } catch {
    return;
  }

  const missing = entries.filter(entry => !existing.includes(entry));
  if (missing.length === 0) return;

  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(excludePath, `${prefix}${missing.join('\n')}\n`, 'utf-8');
}

function resolveCodexBinary() {
  const result = spawnSync('codex', ['--version'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    error(
      'Codex CLI is not available on PATH.\n\n' +
      'Install Codex first, then rerun yolo-ralph.\n' +
      'If GSD Codex assets are also missing, run npx get-shit-done-cc --codex --local or --global.'
    );
  }
  return 'codex';
}

function resolveSkillAsset(repoRoot) {
  const localPath = path.join(repoRoot, '.codex', 'skills', TARGET_SKILL_NAME, 'SKILL.md');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  const home = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(process.env.HOME || require('os').homedir(), '.codex');
  const globalPath = path.join(home, 'skills', TARGET_SKILL_NAME, 'SKILL.md');
  if (fs.existsSync(globalPath)) {
    return globalPath;
  }

  error(
    `Missing Codex skill asset for ${TARGET_SKILL_NAME}.\n\n` +
    'Install GSD Codex assets before running yolo-ralph:\n' +
    '- Local install: npx get-shit-done-cc --codex --local\n' +
    '- Global install: npx get-shit-done-cc --codex --global'
  );
}

function buildSnapshot(cwd, repoRoot) {
  const roadmap = analyzeRoadmapInternal(cwd);
  const phases = roadmap.phases || [];
  const incompletePhases = phases.filter(phase => phase.disk_status !== 'complete' || phase.roadmap_complete === false);
  const gitHead = execGit(repoRoot, ['rev-parse', 'HEAD']);
  const currentPhase = roadmap.current_phase
    ? phases.find(phase => phase.number === roadmap.current_phase) || null
    : null;
  const nextPhase = roadmap.next_phase
    ? phases.find(phase => phase.number === roadmap.next_phase) || null
    : null;

  return {
    captured_at: nowIso(),
    milestone: getMilestoneInfo(cwd),
    git_head: gitHead.exitCode === 0 ? gitHead.stdout : null,
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    state_exists: fs.existsSync(path.join(planningDir(cwd), 'STATE.md')),
    roadmap_exists: !roadmap.error,
    phase_count: phases.length,
    completed_count: roadmap.completed_phases ?? phases.filter(phase => phase.disk_status === 'complete').length,
    remaining_count: incompletePhases.length,
    current_phase: currentPhase ? { number: currentPhase.number, name: currentPhase.name } : null,
    next_phase: nextPhase ? { number: nextPhase.number, name: nextPhase.name } : null,
  };
}

function hasExplicitBlocker(processResult) {
  const haystack = [
    processResult.lastMessage,
    processResult.stdout,
    processResult.stderr,
  ].filter(Boolean).join('\n');

  return BLOCKER_PATTERNS.some(pattern => pattern.test(haystack));
}

function classifyIteration(before, after, processResult) {
  if (processResult.spawnError) {
    return {
      status: 'failed',
      reason: `Codex launch failed: ${processResult.spawnError.message}`,
    };
  }

  if (processResult.exitCode !== 0) {
    return {
      status: 'failed',
      reason: `Codex exited with status ${processResult.exitCode}`,
    };
  }

  if (!after.project_exists || !after.state_exists) {
    return {
      status: 'failed',
      reason: 'Required planning assets disappeared during the run.',
    };
  }

  if (hasExplicitBlocker(processResult)) {
    return {
      status: 'failed',
      reason: 'The spawned Codex run reported a blocker or non-clean outcome.',
    };
  }

  if (!after.roadmap_exists && after.project_exists && after.state_exists) {
    return {
      status: 'milestone_done',
      reason: 'The project is between milestones and no active ROADMAP remains.',
    };
  }

  if (after.roadmap_exists && after.phase_count > 0 && after.remaining_count === 0) {
    return {
      status: 'needs_audit',
      reason: 'All milestone phases are complete and milestone lifecycle work is next.',
    };
  }

  const advanced =
    before.git_head !== after.git_head ||
    after.completed_count > before.completed_count ||
    after.remaining_count < before.remaining_count;

  if (advanced) {
    return {
      status: 'advanced',
      reason: 'Git history or roadmap progress advanced during the iteration.',
    };
  }

  return {
    status: 'stalled',
    reason: 'The Codex run returned without advancing git history or milestone progress.',
  };
}

function writeRunFile(filePath, payload) {
  writeFile(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function formatPhaseLabel(phase) {
  if (!phase) return 'none';
  return `${phase.number}${phase.name ? ` (${phase.name})` : ''}`;
}

function printIterationSummary(record, sleepSeconds, willContinue) {
  writeStdout(
    `\nIteration ${record.iteration}/${record.max_iterations}: ${record.status}\n` +
    `  Exit code: ${record.exit_code}\n` +
    `  Duration: ${(record.duration_ms / 1000).toFixed(2)}s\n` +
    `  Git: ${shortHash(record.git_head_before)} -> ${shortHash(record.git_head_after)}\n` +
    `  Completed: ${record.completed_before}/${record.phase_count_before} -> ${record.completed_after}/${record.phase_count_after}\n` +
    `  Remaining: ${record.remaining_before} -> ${record.remaining_after}\n` +
    `  Current: ${formatPhaseLabel(record.current_phase_before)} -> ${formatPhaseLabel(record.current_phase_after)}\n` +
    `  Next: ${formatPhaseLabel(record.next_phase_before)} -> ${formatPhaseLabel(record.next_phase_after)}\n` +
    `  Reason: ${record.reason}\n`
  );

  if (willContinue) {
    writeStdout(
      sleepSeconds > 0
        ? `  Sleeping ${sleepSeconds}s before the next iteration...\n`
        : '  Continuing immediately (sleep disabled).\n'
    );
  }
}

function printFinalSummary(summary) {
  const nextSteps = [];
  if (summary.status === 'needs_audit') {
    nextSteps.push('/gsd-audit-milestone');
    nextSteps.push('/gsd-complete-milestone');
  } else if (summary.status === 'milestone_done') {
    nextSteps.push('/gsd-new-milestone');
  }

  writeStdout(
    '\nYolo Ralph Summary\n' +
    `  Status: ${summary.status}\n` +
    `  Iterations completed: ${summary.iterations_completed}/${summary.max_iterations}\n` +
    `  Advanced: ${summary.advanced_iterations}\n` +
    `  Failed: ${summary.failed_iterations}\n` +
    `  Stalled: ${summary.stalled_iterations}\n` +
    `  Needs audit: ${summary.needs_audit_iterations}\n` +
    `  Milestone done: ${summary.milestone_done_iterations}\n` +
    `  Duration: ${(summary.duration_ms / 1000).toFixed(2)}s\n` +
    `  Run log: ${summary.run_dir}\n` +
    `  Reason: ${summary.reason}\n`
  );

  if (nextSteps.length > 0) {
    writeStdout(`  Next: ${nextSteps.join(' then ')}\n`);
  }
}

function runCodexIteration(repoRoot, iterationDir) {
  const stdoutPath = path.join(iterationDir, 'stdout.log');
  const stderrPath = path.join(iterationDir, 'stderr.log');
  const lastMessagePath = path.join(iterationDir, 'last-message.txt');
  const startedAt = nowIso();
  const startedMs = Date.now();
  const result = spawnSync(
    'codex',
    [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
      '-o',
      lastMessagePath,
      '-C',
      repoRoot,
      TARGET_SKILL,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    }
  );

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const lastMessage = fs.existsSync(lastMessagePath)
    ? fs.readFileSync(lastMessagePath, 'utf-8')
    : '';

  writeFile(stdoutPath, stdout);
  writeFile(stderrPath, stderr);
  if (!fs.existsSync(lastMessagePath)) {
    writeFile(lastMessagePath, lastMessage);
  }

  return {
    startedAt,
    finishedAt: nowIso(),
    durationMs: Date.now() - startedMs,
    exitCode: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
    stdout,
    stderr,
    lastMessage,
    stdoutPath,
    stderrPath,
    lastMessagePath,
    spawnError: result.error || null,
  };
}

function makeRelative(cwd, targetPath) {
  return toPosixPath(path.relative(cwd, targetPath));
}

function initialTerminalStatus(snapshot) {
  if (!snapshot.roadmap_exists && snapshot.project_exists && snapshot.state_exists) {
    return {
      status: 'milestone_done',
      reason: 'The project is already between milestones and has no active ROADMAP.',
    };
  }

  if (snapshot.roadmap_exists && snapshot.phase_count > 0 && snapshot.remaining_count === 0) {
    return {
      status: 'needs_audit',
      reason: 'All milestone phases are already complete and milestone lifecycle work is next.',
    };
  }

  return null;
}

function buildRunSummary(runMeta, iterations, finalStatus, finalReason, finalSnapshot, cwd, runDir) {
  const counts = {
    advanced_iterations: 0,
    failed_iterations: 0,
    stalled_iterations: 0,
    needs_audit_iterations: 0,
    milestone_done_iterations: 0,
  };

  for (const iteration of iterations) {
    if (iteration.status === 'advanced') counts.advanced_iterations += 1;
    if (iteration.status === 'failed') counts.failed_iterations += 1;
    if (iteration.status === 'stalled') counts.stalled_iterations += 1;
    if (iteration.status === 'needs_audit') counts.needs_audit_iterations += 1;
    if (iteration.status === 'milestone_done') counts.milestone_done_iterations += 1;
  }

  return {
    ...runMeta,
    ...counts,
    status: finalStatus,
    reason: finalReason,
    ended_at: nowIso(),
    duration_ms: Date.now() - runMeta.started_ms,
    iterations_completed: iterations.length,
    final_git_head: finalSnapshot.git_head,
    final_completed_count: finalSnapshot.completed_count,
    final_remaining_count: finalSnapshot.remaining_count,
    final_current_phase: finalSnapshot.current_phase,
    final_next_phase: finalSnapshot.next_phase,
    run_dir: makeRelative(cwd, runDir),
  };
}

function cmdYoloRalph(cwd, args, raw) {
  const parsedArgs = parseArgs(args);
  const config = loadConfig(cwd);
  const maxIterations = parsedArgs.maxIterations ?? config.yolo_ralph_max_iterations;
  const sleepSeconds = parsedArgs.sleepSeconds ?? config.yolo_ralph_sleep_seconds;

  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    error('Resolved max iteration count must be a positive integer');
  }
  if (!Number.isInteger(sleepSeconds) || sleepSeconds < 0) {
    error('Resolved sleep interval must be a non-negative integer');
  }

  const repoRoot = resolveRepoRoot(cwd);
  resolveCodexBinary();
  const skillAssetPath = resolveSkillAsset(repoRoot);
  ensureRunLogsIgnored(repoRoot);

  const initialSnapshot = buildSnapshot(cwd, repoRoot);
  if (!initialSnapshot.project_exists || !initialSnapshot.state_exists) {
    const missing = [];
    if (!initialSnapshot.project_exists) missing.push('.planning/PROJECT.md');
    if (!initialSnapshot.state_exists) missing.push(path.join(planningDir(cwd), 'STATE.md'));
    error(
      `Missing required GSD planning assets: ${missing.join(', ')}\n\n` +
      'Run /gsd-new-project from the repository root to initialize PROJECT.md, ROADMAP.md, and STATE.md before using yolo-ralph.'
    );
  }
  if (initialSnapshot.roadmap_exists && initialSnapshot.phase_count === 0) {
    error(
      'ROADMAP.md exists but contains no active phases.\n\n' +
      'Run /gsd-new-project to initialize the project, or /gsd-new-milestone if you are starting the next milestone.'
    );
  }

  const runDir = path.join(planningDir(cwd), 'tmp', 'yolo-ralph', `run-${makeRunId()}`);
  ensureDir(runDir);
  const iterationsPath = path.join(runDir, 'iterations.jsonl');

  const runMeta = {
    command: 'yolo-ralph',
    repo_root: repoRoot,
    codex_skill_path: skillAssetPath,
    started_at: nowIso(),
    started_ms: Date.now(),
    max_iterations: maxIterations,
    sleep_seconds: sleepSeconds,
    initial_snapshot: initialSnapshot,
  };

  writeRunFile(path.join(runDir, 'run.json'), runMeta);
  writeFile(iterationsPath, '');

  const terminalStatus = initialTerminalStatus(initialSnapshot);
  if (terminalStatus) {
    const summary = buildRunSummary(runMeta, [], terminalStatus.status, terminalStatus.reason, initialSnapshot, cwd, runDir);
    writeRunFile(path.join(runDir, 'run.json'), summary);
    if (raw) {
      output(summary, raw);
      return;
    }
    printFinalSummary(summary);
    return;
  }

  const iterations = [];
  let finalStatus = 'max_iterations_reached';
  let finalReason = `Reached the max iteration count of ${maxIterations}.`;
  let latestSnapshot = initialSnapshot;

  for (let index = 1; index <= maxIterations; index++) {
    const before = buildSnapshot(cwd, repoRoot);
    const iterationDir = path.join(runDir, `iter-${String(index).padStart(2, '0')}`);
    ensureDir(iterationDir);

    if (!raw) {
      writeStdout(`\nStarting iteration ${index}/${maxIterations}...\n`);
    }

    const processResult = runCodexIteration(repoRoot, iterationDir);
    const after = buildSnapshot(cwd, repoRoot);
    const classification = classifyIteration(before, after, processResult);
    latestSnapshot = after;

    const record = {
      iteration: index,
      max_iterations: maxIterations,
      started_at: processResult.startedAt,
      ended_at: processResult.finishedAt,
      duration_ms: processResult.durationMs,
      exit_code: processResult.exitCode,
      signal: processResult.signal,
      status: classification.status,
      reason: classification.reason,
      git_head_before: before.git_head,
      git_head_after: after.git_head,
      completed_before: before.completed_count,
      completed_after: after.completed_count,
      remaining_before: before.remaining_count,
      remaining_after: after.remaining_count,
      phase_count_before: before.phase_count,
      phase_count_after: after.phase_count,
      current_phase_before: before.current_phase,
      current_phase_after: after.current_phase,
      next_phase_before: before.next_phase,
      next_phase_after: after.next_phase,
      stdout_path: makeRelative(cwd, processResult.stdoutPath),
      stderr_path: makeRelative(cwd, processResult.stderrPath),
      last_message_path: makeRelative(cwd, processResult.lastMessagePath),
    };

    iterations.push(record);
    appendJsonl(iterationsPath, record);

    const willContinue = classification.status === 'advanced' && index < maxIterations;
    if (!raw) {
      printIterationSummary(record, sleepSeconds, willContinue);
    }

    if (classification.status !== 'advanced') {
      finalStatus = classification.status;
      finalReason = classification.reason;
      break;
    }

    if (index === maxIterations) {
      finalStatus = 'max_iterations_reached';
      finalReason = `Reached the max iteration count of ${maxIterations} after a successful iteration.`;
      break;
    }

    sleepSync(sleepSeconds * 1000);
  }

  const summary = buildRunSummary(runMeta, iterations, finalStatus, finalReason, latestSnapshot, cwd, runDir);
  writeRunFile(path.join(runDir, 'run.json'), summary);

  if (raw) {
    output(summary, raw);
    return;
  }

  printFinalSummary(summary);
}

module.exports = {
  cmdYoloRalph,
};

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
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
const HEARTBEAT_SNIPPET_MAX = 120;
const LIVE_POLL_INTERVAL_MS = 1000;
const RECENT_LINE_LIMIT = 8;
const USAGE = 'Usage: gsd-tools yolo-ralph [--max-iterations N] [--sleep-seconds N] [--heartbeat-seconds N] [--stage-tick-seconds N]';
const HELP_TEXT = [
  USAGE,
  '',
  'Launch repeated fresh Codex runs of the strict-push yolo wrapper.',
  'Help succeeds from any directory. Actual execution still requires a git repo, Codex on PATH, and initialized GSD planning assets.',
].join('\n');
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
const STAGE_ORDER = {
  running: 0,
  discuss: 1,
  plan: 2,
  execute: 3,
  verify: 4,
  commit_push: 5,
};
const STAGE_LABELS = {
  running: 'running',
  discuss: 'discuss',
  plan: 'plan',
  execute: 'execute',
  verify: 'verify',
  commit_push: 'commit/push',
};
const OUTPUT_STAGE_PATTERNS = [
  {
    stage: 'commit_push',
    patterns: [
      /\bfinalize git\b/i,
      /\bgit add -A\b/i,
      /\bgit commit\b/i,
      /\bgit push\b/i,
      /\bpushing\b.*\bbranch\b/i,
      /\bfinalize autonomous phase\b/i,
      /\bpushed to\b/i,
    ],
  },
  {
    stage: 'verify',
    patterns: [
      /\bverification status is\b/i,
      /\blifecycle validation failed\b/i,
      /\bverify lifecycle\b/i,
      /\bverification passed\b/i,
      /\bverification complete\b/i,
      /\bVERIFICATION\.md\b/i,
    ],
  },
  {
    stage: 'execute',
    patterns: [
      /\bexecute-phase\b/i,
      /\bexecuting phase\b/i,
      /\bsummary complete\b/i,
      /\bSUMMARY\.md\b/i,
      /Created:\s+.*-SUMMARY\.md/i,
    ],
  },
  {
    stage: 'plan',
    patterns: [
      /\bplan-phase\b/i,
      /\bPLAN COMPLETE\b/i,
      /\bplanning phase\b/i,
      /\bready for planning\b/i,
      /\bPLAN\.md\b/i,
      /Created:\s+.*-PLAN\.md/i,
    ],
  },
  {
    stage: 'discuss',
    patterns: [
      /\bdiscuss-phase\b/i,
      /\bgather context\b/i,
      /\bcontext captured\b/i,
      /\bCONTEXT\.md\b/i,
      /\byolo discuss\b/i,
      /Created:\s+.*-CONTEXT\.md/i,
    ],
  },
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

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function truncateSnippet(text, maxLength = HEARTBEAT_SNIPPET_MAX) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
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
    helpRequested: false,
    maxIterations: null,
    sleepSeconds: null,
    heartbeatSeconds: null,
    stageTickSeconds: null,
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    if (token === '--help' || token === '-h') {
      options.helpRequested = true;
      continue;
    }

    if (token === '--max-iterations') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) error(USAGE);
      options.maxIterations = parseNonNegativeInteger(value, '--max-iterations');
      i += 1;
      continue;
    }

    if (token === '--sleep-seconds') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) error(USAGE);
      options.sleepSeconds = parseNonNegativeInteger(value, '--sleep-seconds', true);
      i += 1;
      continue;
    }

    if (token === '--heartbeat-seconds') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) error(USAGE);
      options.heartbeatSeconds = parseNonNegativeInteger(value, '--heartbeat-seconds', true);
      i += 1;
      continue;
    }

    if (token === '--stage-tick-seconds') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) error(USAGE);
      options.stageTickSeconds = parseNonNegativeInteger(value, '--stage-tick-seconds', true);
      i += 1;
      continue;
    }

    error(`Unknown yolo-ralph argument: ${token}\n${USAGE}`);
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

function lastMessageHasExplicitBlocker(lastMessage) {
  return Boolean(lastMessage) && BLOCKER_PATTERNS.some(pattern => pattern.test(lastMessage));
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

  if (lastMessageHasExplicitBlocker(processResult.lastMessage)) {
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

function finishLiveRender(liveState) {
  if (!liveState || !liveState.interactive || !liveState.render.hasTickerLine) return;
  writeStdout('\n');
  liveState.render.hasTickerLine = false;
  liveState.render.lastTickerWidth = 0;
}

function printIterationSummary(record, sleepSeconds, willContinue, liveState) {
  finishLiveRender(liveState);
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

function printFinalSummary(summary, liveState) {
  finishLiveRender(liveState);
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

function createLineProcessor(onLine) {
  let buffer = '';

  function flushBuffer(force = false) {
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      onLine(line);
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf('\n');
    }

    if (force && buffer.length > 0) {
      onLine(buffer.replace(/\r$/, ''));
      buffer = '';
    }
  }

  return {
    push(chunk) {
      buffer += chunk;
      flushBuffer(false);
    },
    flush() {
      flushBuffer(true);
    },
  };
}

function collectStringLeaves(value, results) {
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized) results.push(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, results);
    return;
  }

  if (!value || typeof value !== 'object') return;
  for (const entry of Object.values(value)) {
    collectStringLeaves(entry, results);
  }
}

function extractTextCandidates(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return [];

  const candidates = [line];
  if (line.startsWith('{') || line.startsWith('[')) {
    try {
      const parsed = JSON.parse(line);
      collectStringLeaves(parsed, candidates);
    } catch {
      // Keep the raw line when JSON parsing fails.
    }
  }

  return [...new Set(candidates.map(text => text.trim()).filter(Boolean))];
}

function pickSnippet(candidates, rawLine) {
  const preferred = candidates.find(candidate =>
    candidate.length > 8 &&
    !candidate.startsWith('{') &&
    /[a-z]/i.test(candidate)
  );
  return truncateSnippet(preferred || String(rawLine || '').trim() || 'No child output yet.');
}

function detectStageFromCandidates(candidates) {
  for (const matcher of OUTPUT_STAGE_PATTERNS) {
    if (matcher.patterns.some(pattern => candidates.some(candidate => pattern.test(candidate)))) {
      return matcher.stage;
    }
  }
  return null;
}

function isStageAtOrBeyond(currentStage, nextStage) {
  return STAGE_ORDER[currentStage] >= STAGE_ORDER[nextStage];
}

function resolvePhaseDir(cwd, phaseNumber) {
  if (!phaseNumber) return null;
  const phasesRoot = path.join(planningDir(cwd), 'phases');
  let entries = [];
  try {
    entries = fs.readdirSync(phasesRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return null;
  }

  const rawNumber = String(phaseNumber);
  const paddedNumber = /^\d+$/.test(rawNumber) ? rawNumber.padStart(2, '0') : rawNumber;
  const match = entries.find(entry =>
    entry === rawNumber ||
    entry === paddedNumber ||
    entry.startsWith(`${rawNumber}-`) ||
    entry.startsWith(`${paddedNumber}-`)
  );

  return match ? path.join(phasesRoot, match) : null;
}

function detectStageFromArtifacts(liveState, iterationStartedMs) {
  const phaseDir = resolvePhaseDir(liveState.cwd, liveState.phase?.number);
  if (!phaseDir) return null;

  let entries = [];
  try {
    entries = fs.readdirSync(phaseDir);
  } catch {
    return null;
  }

  const artifactMatchers = [
    { stage: 'verify', suffix: '-VERIFICATION.md' },
    { stage: 'execute', suffix: '-SUMMARY.md' },
    { stage: 'plan', suffix: '-PLAN.md' },
    { stage: 'discuss', suffix: '-CONTEXT.md' },
  ];

  for (const matcher of artifactMatchers) {
    if (isStageAtOrBeyond(liveState.stage, matcher.stage)) continue;
    const matchingFiles = entries.filter(entry => entry.endsWith(matcher.suffix));
    for (const fileName of matchingFiles) {
      const filePath = path.join(phaseDir, fileName);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs >= iterationStartedMs) {
          return {
            stage: matcher.stage,
            snippet: `Observed ${fileName}`,
          };
        }
      } catch {
        // Ignore files that disappeared between readdir/stat.
      }
    }
  }

  return null;
}

function advanceStage(liveState, stage, source, snippet) {
  if (!stage || isStageAtOrBeyond(liveState.stage, stage)) return false;

  liveState.stage = stage;
  liveState.stageSource = source;
  liveState.stageStartedMs = Date.now();

  if (!liveState.raw) {
    finishLiveRender(liveState);
    writeStdout(
      `  Stage -> ${STAGE_LABELS[stage]} | phase ${formatPhaseLabel(liveState.phase)} | via ${source}` +
      (snippet ? ` | ${truncateSnippet(snippet)}` : '') +
      '\n'
    );
  }

  return true;
}

function rememberSnippet(liveState, snippet) {
  if (!snippet) return;
  liveState.latestSnippet = snippet;
  liveState.recentLines.push(snippet);
  if (liveState.recentLines.length > RECENT_LINE_LIMIT) {
    liveState.recentLines.shift();
  }
}

function handleOutputLine(liveState, line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return;

  const candidates = extractTextCandidates(trimmed);
  const snippet = pickSnippet(candidates, trimmed);
  liveState.lastOutputMs = Date.now();
  rememberSnippet(liveState, snippet);

  const detectedStage = detectStageFromCandidates(candidates);
  if (detectedStage) {
    advanceStage(liveState, detectedStage, 'output', snippet);
  }
}

function createLiveState({ cwd, repoRoot, iteration, maxIterations, beforeSnapshot, startedMs, heartbeatSeconds, stageTickSeconds, raw }) {
  return {
    cwd,
    repoRoot,
    iteration,
    maxIterations,
    raw,
    interactive: !raw && Boolean(process.stdout.isTTY),
    heartbeatSeconds,
    stageTickSeconds,
    phase: beforeSnapshot.current_phase || beforeSnapshot.next_phase || null,
    latestSnapshot: beforeSnapshot,
    initialGitHead: beforeSnapshot.git_head,
    stage: 'running',
    stageSource: 'initial',
    stageStartedMs: startedMs,
    iterationStartedMs: startedMs,
    lastOutputMs: startedMs,
    lastHeartbeatMs: startedMs,
    lastStageTickMs: 0,
    latestSnippet: 'No child output yet.',
    recentLines: [],
    render: {
      hasTickerLine: false,
      lastTickerWidth: 0,
    },
  };
}

function renderStageTicker(liveState) {
  if (!liveState.interactive || liveState.stageTickSeconds <= 0) return;

  const now = Date.now();
  if (now - liveState.lastStageTickMs < liveState.stageTickSeconds * 1000) return;
  liveState.lastStageTickMs = now;

  const line =
    `  Live: iter ${liveState.iteration}/${liveState.maxIterations}` +
    ` | phase ${formatPhaseLabel(liveState.phase)}` +
    ` | stage ${STAGE_LABELS[liveState.stage]}` +
    ` | iter ${formatDuration(now - liveState.iterationStartedMs)}` +
    ` | stage ${formatDuration(now - liveState.stageStartedMs)}` +
    ` | idle ${formatDuration(now - liveState.lastOutputMs)}`;
  const padded = line.length < liveState.render.lastTickerWidth
    ? line.padEnd(liveState.render.lastTickerWidth)
    : line;

  writeStdout(`\r${padded}`);
  liveState.render.hasTickerLine = true;
  liveState.render.lastTickerWidth = padded.length;
}

function printHeartbeat(liveState) {
  if (liveState.heartbeatSeconds <= 0) return;

  const now = Date.now();
  if (now - liveState.lastHeartbeatMs < liveState.heartbeatSeconds * 1000) return;
  liveState.lastHeartbeatMs = now;

  finishLiveRender(liveState);
  writeStdout(
    `  Heartbeat: iter ${liveState.iteration}/${liveState.maxIterations}` +
    ` | phase ${formatPhaseLabel(liveState.phase)}` +
    ` | stage ${STAGE_LABELS[liveState.stage]}` +
    ` | iter ${formatDuration(now - liveState.iterationStartedMs)}` +
    ` | stage ${formatDuration(now - liveState.stageStartedMs)}` +
    ` | idle ${formatDuration(now - liveState.lastOutputMs)}` +
    ` | ${truncateSnippet(liveState.recentLines[liveState.recentLines.length - 1] || liveState.latestSnippet)}\n`
  );
}

function pollLiveState(liveState, iterationStartedMs) {
  const snapshot = buildSnapshot(liveState.cwd, liveState.repoRoot);
  liveState.latestSnapshot = snapshot;
  if (snapshot.current_phase) {
    liveState.phase = snapshot.current_phase;
  } else if (!liveState.phase && snapshot.next_phase) {
    liveState.phase = snapshot.next_phase;
  }

  const artifactStage = detectStageFromArtifacts(liveState, iterationStartedMs);
  if (artifactStage) {
    advanceStage(liveState, artifactStage.stage, 'artifact', artifactStage.snippet);
  }

  if (
    snapshot.git_head &&
    liveState.initialGitHead &&
    snapshot.git_head !== liveState.initialGitHead
  ) {
    advanceStage(liveState, 'commit_push', 'git', `Git head advanced to ${shortHash(snapshot.git_head)}`);
  }

  renderStageTicker(liveState);
  printHeartbeat(liveState);
}

async function runCodexIteration(repoRoot, iterationDir, options) {
  const stdoutPath = path.join(iterationDir, 'stdout.log');
  const stderrPath = path.join(iterationDir, 'stderr.log');
  const lastMessagePath = path.join(iterationDir, 'last-message.txt');
  const startedAt = nowIso();
  const startedMs = Date.now();
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');
  const liveState = createLiveState({
    cwd: options.cwd,
    repoRoot,
    iteration: options.iteration,
    maxIterations: options.maxIterations,
    beforeSnapshot: options.beforeSnapshot,
    startedMs,
    heartbeatSeconds: options.heartbeatSeconds,
    stageTickSeconds: options.stageTickSeconds,
    raw: options.raw,
  });

  let stdout = '';
  let stderr = '';
  let spawnError = null;
  let exitCode = 1;
  let signal = null;
  let pollTimer = null;

  const stdoutProcessor = createLineProcessor(line => handleOutputLine(liveState, line));
  const stderrProcessor = createLineProcessor(line => handleOutputLine(liveState, line));

  await new Promise(resolve => {
    const child = spawn(
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
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');

    if (!options.raw && (options.heartbeatSeconds > 0 || options.stageTickSeconds > 0)) {
      pollTimer = setInterval(() => {
        pollLiveState(liveState, startedMs);
      }, LIVE_POLL_INTERVAL_MS);
    }

    child.stdout.on('data', chunk => {
      stdout += chunk;
      fs.writeSync(stdoutFd, chunk);
      stdoutProcessor.push(chunk);
    });

    child.stderr.on('data', chunk => {
      stderr += chunk;
      fs.writeSync(stderrFd, chunk);
      stderrProcessor.push(chunk);
    });

    child.on('error', err => {
      spawnError = err;
    });

    child.on('close', (code, closeSignal) => {
      exitCode = typeof code === 'number' ? code : 1;
      signal = closeSignal || null;
      resolve();
    });
  });

  if (pollTimer) clearInterval(pollTimer);
  stdoutProcessor.flush();
  stderrProcessor.flush();
  finishLiveRender(liveState);
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  const lastMessage = fs.existsSync(lastMessagePath)
    ? fs.readFileSync(lastMessagePath, 'utf-8')
    : '';

  if (!fs.existsSync(lastMessagePath)) {
    writeFile(lastMessagePath, lastMessage);
  }

  return {
    startedAt,
    finishedAt: nowIso(),
    durationMs: Date.now() - startedMs,
    exitCode,
    signal,
    stdout,
    stderr,
    lastMessage,
    stdoutPath,
    stderrPath,
    lastMessagePath,
    spawnError,
    liveState,
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

async function cmdYoloRalph(cwd, args, raw) {
  const parsedArgs = parseArgs(args);
  if (parsedArgs.helpRequested) {
    writeStdout(`${HELP_TEXT}\n`);
    return;
  }
  const config = loadConfig(cwd);
  const maxIterations = parsedArgs.maxIterations ?? config.yolo_ralph_max_iterations;
  const sleepSeconds = parsedArgs.sleepSeconds ?? config.yolo_ralph_sleep_seconds;
  const heartbeatSeconds = parsedArgs.heartbeatSeconds ?? config.yolo_ralph_heartbeat_seconds;
  const stageTickSeconds = parsedArgs.stageTickSeconds ?? config.yolo_ralph_stage_tick_seconds;

  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    error('Resolved max iteration count must be a positive integer');
  }
  if (!Number.isInteger(sleepSeconds) || sleepSeconds < 0) {
    error('Resolved sleep interval must be a non-negative integer');
  }
  if (!Number.isInteger(heartbeatSeconds) || heartbeatSeconds < 0) {
    error('Resolved heartbeat interval must be a non-negative integer');
  }
  if (!Number.isInteger(stageTickSeconds) || stageTickSeconds < 0) {
    error('Resolved stage tick interval must be a non-negative integer');
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
    heartbeat_seconds: heartbeatSeconds,
    stage_tick_seconds: stageTickSeconds,
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
  let latestLiveState = null;

  for (let index = 1; index <= maxIterations; index++) {
    const before = buildSnapshot(cwd, repoRoot);
    const iterationDir = path.join(runDir, `iter-${String(index).padStart(2, '0')}`);
    ensureDir(iterationDir);

    if (!raw) {
      writeStdout(`\nStarting iteration ${index}/${maxIterations}...\n`);
    }

    const processResult = await runCodexIteration(repoRoot, iterationDir, {
      cwd,
      iteration: index,
      maxIterations,
      beforeSnapshot: before,
      heartbeatSeconds,
      stageTickSeconds,
      raw,
    });
    latestLiveState = processResult.liveState;
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
      printIterationSummary(record, sleepSeconds, willContinue, processResult.liveState);
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

  printFinalSummary(summary, latestLiveState);
}

module.exports = {
  cmdYoloRalph,
};

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'commands', 'gsd');
const WORKFLOWS_DIR = path.join(ROOT, 'get-shit-done', 'workflows');
const COMMANDS_DOC_PATH = path.join(ROOT, 'docs', 'COMMANDS.md');
const FEATURES_DOC_PATH = path.join(ROOT, 'docs', 'FEATURES.md');
const README_PATH = path.join(ROOT, 'README.md');
const HELP_PATH = path.join(ROOT, 'get-shit-done', 'workflows', 'help.md');
const CONTINUATION_FORMAT_PATH = path.join(
  ROOT,
  'get-shit-done',
  'references',
  'continuation-format.md'
);

function sliceSection(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  assert.ok(start !== -1, `Missing start marker: ${startMarker}`);
  const end = endMarker ? content.indexOf(endMarker, start) : content.length;
  assert.ok(end !== -1, `Missing end marker: ${endMarker}`);
  return content.slice(start, end);
}

function assertInOrder(content, fragments, message) {
  let lastIndex = -1;

  for (const fragment of fragments) {
    const nextIndex = content.indexOf(fragment, lastIndex + 1);
    assert.ok(nextIndex !== -1, `${message}: missing fragment ${fragment}`);
    assert.ok(
      nextIndex > lastIndex,
      `${message}: fragment out of order ${fragment}`
    );
    lastIndex = nextIndex;
  }
}

describe('recommended and yolo wrapper commands', () => {
  const commandFiles = [
    'recommended-discuss.md',
    'yolo-discuss.md',
    'yolo-discuss-plan-and-execute.md',
    'yolo-discuss-plan-execute-commit-and-push.md',
    'yolo-discuss-plan-execute-commit-and-push-all.md',
  ];

  for (const file of commandFiles) {
    test(`${file} command file exists with frontmatter`, () => {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
      assert.ok(content.startsWith('---\nname:'), `${file} should start with frontmatter`);
      assert.ok(content.includes('description:'), `${file} should include description frontmatter`);
      assert.ok(content.includes('<execution_context>'), `${file} should declare execution_context`);
    });
  }

  test('wrapper workflows exist', () => {
    const workflowFiles = [
      'recommended-discuss.md',
      'yolo-discuss.md',
      'yolo-discuss-plan-and-execute.md',
      'yolo-discuss-plan-execute-commit-and-push.md',
      'yolo-discuss-plan-execute-commit-and-push-all.md',
    ];

    for (const file of workflowFiles) {
      assert.ok(
        fs.existsSync(path.join(WORKFLOWS_DIR, file)),
        `workflow ${file} should exist`
      );
    }
  });

  test('single-phase yolo chain wrapper delegates to discuss-phase --yolo --chain', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-and-execute.md'),
      'utf8'
    );
    assert.ok(
      content.includes('Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo --chain --lifecycle-id ${PHASE_LIFECYCLE_ID} --lifecycle-mode yolo")'),
      'single-phase yolo chain should delegate to discuss-phase --yolo --chain'
    );
  });

  test('range yolo chain wrapper delegates to autonomous --yolo', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-and-execute.md'),
      'utf8'
    );
    assert.ok(
      content.includes('Skill(skill="gsd-autonomous", args="${ARGUMENTS} --yolo")'),
      'range yolo chain should delegate to autonomous --yolo'
    );
  });

  test('strict push wrapper delegates range mode to autonomous strict push', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push.md'),
      'utf8'
    );
    assert.ok(
      content.includes('Skill(skill="gsd-autonomous", args="${ARGUMENTS} --yolo --push-after-phase")'),
      'range strict push wrapper should delegate to autonomous strict push'
    );
  });

  test('strict push wrapper gates git finalization on passed verification', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push.md'),
      'utf8'
    );
    const pushSection = sliceSection(
      content,
      'Detect the current branch and upstream:',
      'Display:'
    );
    assert.ok(content.includes("VERIFY_STATUS` is not `passed`"), 'wrapper should guard on passed verification');
    assert.ok(content.includes('git push --set-upstream origin "${CURRENT_BRANCH}"'), 'wrapper should set upstream when missing');
    assert.ok(content.includes('git commit -m "chore(${padded_phase}): finalize autonomous phase ${phase_number}"'), 'wrapper should define deterministic final commit message');
    assert.ok(
      content.includes('This final push step does not create or switch branches. It only pushes the branch that is already checked out.'),
      'wrapper should document current-branch-only push behavior'
    );
    assert.ok(pushSection.includes('git push\n```'), 'wrapper should use plain git push when upstream exists');
    assert.ok(
      !pushSection.includes('git checkout -b') && !pushSection.includes('git switch -c'),
      'wrapper push section should not create a new branch'
    );
  });

  test('all alias delegates directly to autonomous strict push mode', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push-all.md'),
      'utf8'
    );
    assert.ok(
      content.includes('Skill(skill="gsd-autonomous", args="--yolo --push-after-phase")'),
      'all alias should delegate directly to autonomous strict push mode'
    );
  });

  test('all alias rejects unexpected arguments', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push-all.md'),
      'utf8'
    );
    assert.ok(
      content.includes('This command does not accept arguments.'),
      'all alias should reject unexpected arguments'
    );
    assert.ok(
      content.includes('Usage: /gsd-yolo-discuss-plan-execute-commit-and-push-all'),
      'all alias should include explicit no-arg usage'
    );
  });

  test('yolo-discuss previews the target phase and steps before delegation', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss.md'),
      'utf8'
    );
    assert.ok(content.includes('GSD ► YOLO DISCUSS'), 'yolo-discuss should have a preview banner');
    assert.ok(content.includes('Steps: discuss'), 'yolo-discuss should preview the discuss step');
    assert.ok(
      content.indexOf('Steps: discuss') < content.indexOf('Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo")'),
      'yolo-discuss preview should appear before delegation'
    );
  });

  test('yolo chain wrapper previews single-phase and range runs', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-and-execute.md'),
      'utf8'
    );
    assert.ok(content.includes('GSD ► YOLO PLAN EXECUTE'), 'yolo chain wrapper should have a preview banner');
    assert.ok(content.includes('Steps: discuss → plan → execute'), 'yolo chain wrapper should preview discuss → plan → execute');
    assert.ok(content.includes('This run will cover phases ${FIRST_PHASE} through ${LAST_PHASE}.'), 'yolo chain wrapper should preview covered phase range');
    assert.ok(content.includes('No remaining incomplete phases match this run.'), 'yolo chain wrapper should document the early no-op case');
  });

  test('strict push wrapper previews steps and strict push note', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push.md'),
      'utf8'
    );
    assert.ok(content.includes('GSD ► YOLO PLAN EXECUTE PUSH'), 'strict push wrapper should have a preview banner');
    assert.ok(content.includes('Steps: discuss → plan → execute → commit/push'), 'strict push wrapper should preview commit/push steps');
    assert.ok(content.includes('commit/push only happens after clean verification'), 'strict push wrapper should mention strict push gating in the preview');
    assert.ok(content.includes('No remaining incomplete phases match this run.'), 'strict push wrapper should document the early no-op case');
  });

  test('all alias previews remaining phases and no-op behavior', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push-all.md'),
      'utf8'
    );
    assert.ok(content.includes('GSD ► YOLO ALL PUSH'), 'all alias should have a preview banner');
    assert.ok(content.includes('This run will cover phases ${FIRST_PHASE} through ${LAST_PHASE}.'), 'all alias should preview remaining phases');
    assert.ok(content.includes('Steps: discuss → plan → execute → commit/push'), 'all alias should preview full step sequence');
    assert.ok(content.includes('No remaining incomplete phases are left in the current milestone.'), 'all alias should document the early no-op case');
  });
});

describe('discuss-phase: recommended and yolo modes', () => {
  const commandContent = fs.readFileSync(path.join(COMMANDS_DIR, 'discuss-phase.md'), 'utf8');
  const workflowContent = fs.readFileSync(path.join(WORKFLOWS_DIR, 'discuss-phase.md'), 'utf8');

  test('command frontmatter advertises --recommended and --yolo', () => {
    const hintLine = commandContent.split('\n').find(line => line.includes('argument-hint'));
    assert.ok(hintLine && hintLine.includes('--recommended'), 'argument-hint should include --recommended');
    assert.ok(hintLine && hintLine.includes('--yolo'), 'argument-hint should include --yolo');
  });

  test('workflow defines consolidated recommended summary review', () => {
    assert.ok(
      workflowContent.includes('<step name="review_recommended_summary">'),
      'workflow should define a review_recommended_summary step'
    );
    assert.ok(
      workflowContent.includes('Accept all') &&
      workflowContent.includes('Modify question') &&
      workflowContent.includes('Discuss area') &&
      workflowContent.includes('Cancel'),
      'recommended review should support accept, modify, discuss-area, and cancel actions'
    );
  });

  test('workflow keeps recommended and plain yolo local even when auto_advance config is enabled', () => {
    assert.ok(workflowContent.includes('FORCE_LOCAL_STOP'), 'workflow should compute local-stop override');
    assert.ok(
      workflowContent.includes('plain `--yolo` phase-local'),
      'workflow should document local-only behavior for plain yolo'
    );
  });

  test('workflow documents shared recommendation engine and yolo chain behavior', () => {
    assert.ok(
      workflowContent.includes('shared recommendation engine'),
      'workflow should describe shared recommendation engine'
    );
    assert.ok(
      workflowContent.includes('`--yolo --chain` captures context non-interactively'),
      'workflow should document yolo chain behavior'
    );
  });
});

describe('autonomous: yolo and push-after-phase', () => {
  const commandContent = fs.readFileSync(path.join(COMMANDS_DIR, 'autonomous.md'), 'utf8');
  const workflowContent = fs.readFileSync(path.join(WORKFLOWS_DIR, 'autonomous.md'), 'utf8');

  test('command frontmatter advertises --yolo and --push-after-phase', () => {
    const hintLine = commandContent.split('\n').find(line => line.includes('argument-hint'));
    assert.ok(hintLine && hintLine.includes('--yolo'), 'argument-hint should include --yolo');
    assert.ok(hintLine && hintLine.includes('--push-after-phase'), 'argument-hint should include --push-after-phase');
  });

  test('workflow rejects --interactive with --yolo', () => {
    assert.ok(
      workflowContent.includes('Error: --interactive and --yolo cannot be combined.'),
      'workflow should reject interactive + yolo combination'
    );
  });

  test('workflow routes yolo mode through discuss-phase --yolo', () => {
    assert.ok(
      workflowContent.includes('Skill(skill="gsd-discuss-phase", args="${PHASE_NUM} --yolo --lifecycle-id ${PHASE_LIFECYCLE_ID} --lifecycle-mode yolo")'),
      'autonomous yolo should reuse discuss-phase --yolo'
    );
  });

  test('workflow defines strict push-after-phase sub-step and clean-pass gate', () => {
    const pushSection = sliceSection(
      workflowContent,
      'Detect the current branch and upstream:',
      'Display:'
    );
    assert.ok(
      workflowContent.includes('3d.6. Push After Phase (Strict Git Mode)'),
      'workflow should define push-after-phase sub-step'
    );
    assert.ok(workflowContent.includes('CLEAN_PASS'), 'workflow should track clean pass');
    assert.ok(
      workflowContent.includes('Strict push mode does not create or switch branches here. It only pushes the branch that is already checked out.'),
      'workflow should document current-branch-only push behavior'
    );
    assert.ok(
      workflowContent.includes('git push --set-upstream origin "${CURRENT_BRANCH}"'),
      'workflow should set upstream on push-after-phase'
    );
    assert.ok(pushSection.includes('git push\n```'), 'workflow should use plain git push when upstream exists');
    assert.ok(
      !pushSection.includes('git checkout -b') && !pushSection.includes('git switch -c'),
      'workflow push section should not create a new branch'
    );
    assert.ok(
      workflowContent.includes('verify lifecycle "${PHASE_NUM}" --expect-id "${PHASE_LIFECYCLE_ID}" --expect-mode "${PHASE_LIFECYCLE_MODE}" --require-plans --require-verification --raw'),
      'strict push mode should validate lifecycle before push'
    );
  });

  test('workflow stops strict push mode on human_needed, gaps_found, and blockers', () => {
    assert.ok(
      workflowContent.includes('verification status is human_needed'),
      'strict push mode should stop on human_needed'
    );
    assert.ok(
      workflowContent.includes('verification status is gaps_found'),
      'strict push mode should stop on gaps_found'
    );
    assert.ok(
      workflowContent.includes('strict git mode stops immediately on the first blocker'),
      'strict push mode should stop on blockers'
    );
    assert.ok(
      workflowContent.includes('Fallback/manual artifacts detected in strict autonomous mode. Refusing to continue.'),
      'strict push mode should stop on fallback/manual lifecycle artifacts'
    );
  });

  test('workflow adds discuss and plan watchdogs plus pre-execute lifecycle validation', () => {
    assert.ok(
      workflowContent.includes('Discuss gets **180 seconds** to produce a compliant CONTEXT.md'),
      'workflow should define a discuss watchdog'
    );
    assert.ok(
      workflowContent.includes('Verify plan produced compliant output with a **300 second** watchdog.'),
      'workflow should define a plan watchdog'
    );
    assert.ok(
      workflowContent.includes('verify lifecycle "${PHASE_NUM}" --expect-id "${PHASE_LIFECYCLE_ID}" --expect-mode "${PHASE_LIFECYCLE_MODE}" --require-plans --raw'),
      'workflow should validate lifecycle before execute starts'
    );
  });

  test('strict push wrapper validates lifecycle before standalone git finalization', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push.md'),
      'utf8'
    );
    assert.ok(
      content.includes('verify lifecycle "${PHASE}" --require-plans --require-verification --raw'),
      'single-phase strict push wrapper should validate lifecycle before commit/push'
    );
    assert.ok(
      content.includes('lifecycle validation failed. Skipping commit/push.'),
      'single-phase strict push wrapper should stop when lifecycle validation fails'
    );
  });
});

describe('docs reference recommended and yolo wrappers', () => {
  const commandsDoc = fs.readFileSync(COMMANDS_DOC_PATH, 'utf8');
  const featuresDoc = fs.readFileSync(FEATURES_DOC_PATH, 'utf8');
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const help = fs.readFileSync(HELP_PATH, 'utf8');

  test('COMMANDS.md documents the new wrapper commands and discuss flags', () => {
    assert.ok(commandsDoc.includes('/gsd-recommended-discuss'), 'COMMANDS.md should document gsd-recommended-discuss');
    assert.ok(commandsDoc.includes('/gsd-yolo-discuss'), 'COMMANDS.md should document gsd-yolo-discuss');
    assert.ok(commandsDoc.includes('/gsd-yolo-discuss-plan-and-execute'), 'COMMANDS.md should document yolo chain wrapper');
    assert.ok(commandsDoc.includes('/gsd-yolo-discuss-plan-execute-commit-and-push'), 'COMMANDS.md should document strict push wrapper');
    assert.ok(commandsDoc.includes('/gsd-yolo-discuss-plan-execute-commit-and-push-all'), 'COMMANDS.md should document strict push all alias');
    assert.ok(commandsDoc.includes('`--recommended`'), 'COMMANDS.md should document --recommended');
    assert.ok(commandsDoc.includes('`--yolo`'), 'COMMANDS.md should document --yolo');
  });

  test('FEATURES.md documents the new discuss, wrapper, and autonomous capabilities', () => {
    assert.ok(featuresDoc.includes('### 104. Recommended Discuss Review'), 'FEATURES.md should define recommended discuss review');
    assert.ok(featuresDoc.includes('### 109. Autonomous Strict Push'), 'FEATURES.md should define autonomous strict push');
    assert.ok(featuresDoc.includes('### 110. Yolo Strict Push All Alias'), 'FEATURES.md should define strict push all alias');
    assert.ok(featuresDoc.includes('REQ-AUTO-06'), 'FEATURES.md should include autonomous yolo requirement');
  });

  test('README and help mention the new commands', () => {
    assert.ok(readme.includes('/gsd-recommended-discuss <N>'), 'README should mention gsd-recommended-discuss');
    assert.ok(readme.includes('/gsd-yolo-discuss-plan-execute-commit-and-push-all'), 'README should mention strict push all alias');
    assert.ok(readme.includes('Preview the covered phases'), 'README should mention wrapper previews');
    assert.ok(readme.includes('/gsd-autonomous [--yolo] [--push-after-phase]'), 'README should mention autonomous new flags');
    assert.ok(help.includes('/gsd-recommended-discuss 2'), 'help should include gsd-recommended-discuss usage');
    assert.ok(help.includes('/gsd-yolo-discuss-plan-execute-commit-and-push-all'), 'help should include strict push all alias usage');
    assert.ok(help.includes('Prints a short preview of the phases and high-level steps before it runs'), 'help should mention wrapper previews');
    assert.ok(help.includes('/gsd-autonomous --from 3 --to 5 --yolo --push-after-phase'), 'help should include autonomous strict push usage');
  });
});

describe('phase-entry Also available lists surface yolo wrappers', () => {
  test('new-project phase 1 Next Up variants advertise yolo wrappers after plan', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'new-project.md'),
      'utf8'
    );
    const withUi = sliceSection(
      content,
      '**If Phase 1 has UI (`PHASE1_HAS_UI` is `true`):**',
      '**If Phase 1 has no UI:**'
    );
    const withoutUi = sliceSection(
      content,
      '**If Phase 1 has no UI:**',
      '</process>'
    );

    assertInOrder(
      withUi,
      [
        '/gsd-ui-phase 1 — generate UI design contract (recommended for frontend phases)',
        '/gsd-plan-phase 1 — skip discussion, plan directly',
        '/gsd-yolo-discuss 1 — non-interactive discuss using recommended answers',
        '/gsd-yolo-discuss-plan-and-execute 1 — discuss, plan, and execute with minimal intervention',
        '/gsd-yolo-discuss-plan-execute-commit-and-push 1 — same flow, then commit/push only after clean verification',
      ],
      'new-project UI Next Up ordering'
    );

    assertInOrder(
      withoutUi,
      [
        '/gsd-plan-phase 1 — skip discussion, plan directly',
        '/gsd-yolo-discuss 1 — non-interactive discuss using recommended answers',
        '/gsd-yolo-discuss-plan-and-execute 1 — discuss, plan, and execute with minimal intervention',
        '/gsd-yolo-discuss-plan-execute-commit-and-push 1 — same flow, then commit/push only after clean verification',
      ],
      'new-project no-UI Next Up ordering'
    );
  });

  test('progress phase-entry blocks advertise yolo wrappers in the intended order', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'progress.md'),
      'utf8'
    );
    const currentWithUi = sliceSection(
      content,
      '**If CONTEXT.md does NOT exist AND phase has UI (`PHASE_HAS_UI` is `true`):**',
      '**If CONTEXT.md does NOT exist AND phase has no UI:**'
    );
    const currentWithoutUi = sliceSection(
      content,
      '**If CONTEXT.md does NOT exist AND phase has no UI:**',
      '**Route E: UAT gaps need fix plans**'
    );
    const nextWithUi = sliceSection(
      content,
      '**If next phase has UI (`NEXT_HAS_UI` is `true`):**',
      '**If next phase has no UI:**'
    );
    const nextWithoutUi = sliceSection(
      content,
      '**If next phase has no UI:**',
      '**Route D: Milestone complete**'
    );

    assertInOrder(
      currentWithUi,
      [
        '`/gsd-ui-phase {phase}` — generate UI design contract (recommended for frontend phases)',
        '`/gsd-plan-phase {phase}` — skip discussion, plan directly',
        '`/gsd-yolo-discuss {phase}` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute {phase}` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push {phase}` — same flow, then commit/push only after clean verification',
        '`/gsd-list-phase-assumptions {phase}` — see Claude\'s assumptions',
      ],
      'progress current phase UI ordering'
    );

    assertInOrder(
      currentWithoutUi,
      [
        '`/gsd-plan-phase {phase} ${GSD_WS}` — skip discussion, plan directly',
        '`/gsd-yolo-discuss {phase} ${GSD_WS}` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute {phase} ${GSD_WS}` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push {phase} ${GSD_WS}` — same flow, then commit/push only after clean verification',
        '`/gsd-list-phase-assumptions {phase} ${GSD_WS}` — see Claude\'s assumptions',
      ],
      'progress current phase no-UI ordering'
    );

    assertInOrder(
      nextWithUi,
      [
        '`/gsd-ui-phase {Z+1}` — generate UI design contract (recommended for frontend phases)',
        '`/gsd-plan-phase {Z+1}` — skip discussion, plan directly',
        '`/gsd-yolo-discuss {Z+1}` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute {Z+1}` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push {Z+1}` — same flow, then commit/push only after clean verification',
        '`/gsd-verify-work {Z}` — user acceptance test before continuing',
      ],
      'progress next phase UI ordering'
    );

    assertInOrder(
      nextWithoutUi,
      [
        '`/gsd-plan-phase {Z+1} ${GSD_WS}` — skip discussion, plan directly',
        '`/gsd-yolo-discuss {Z+1} ${GSD_WS}` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute {Z+1} ${GSD_WS}` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push {Z+1} ${GSD_WS}` — same flow, then commit/push only after clean verification',
        '`/gsd-verify-work {Z} ${GSD_WS}` — user acceptance test before continuing',
      ],
      'progress next phase no-UI ordering'
    );
  });

  test('transition missing-context block advertises yolo wrappers before research', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'transition.md'),
      'utf8'
    );
    const missingContext = sliceSection(
      content,
      '**If CONTEXT.md does NOT exist:**',
      '**If CONTEXT.md exists:**'
    );

    assertInOrder(
      missingContext,
      [
        '`/gsd-plan-phase [X+1] ${GSD_WS}` — skip discussion, plan directly',
        '`/gsd-yolo-discuss [X+1] ${GSD_WS}` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute [X+1] ${GSD_WS}` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push [X+1] ${GSD_WS}` — same flow, then commit/push only after clean verification',
        '`/gsd-research-phase [X+1] ${GSD_WS}` — investigate unknowns',
      ],
      'transition missing-context ordering'
    );
  });

  test('continuation-format examples include yolo wrapper discoverability pattern', () => {
    const content = fs.readFileSync(CONTINUATION_FORMAT_PATH, 'utf8');
    const planPhase = sliceSection(
      content,
      '### Plan a Phase',
      '### Phase Complete, Ready for Next'
    );
    const phaseComplete = sliceSection(
      content,
      '### Phase Complete, Ready for Next',
      '### Multiple Equal Options'
    );

    assertInOrder(
      planPhase,
      [
        '`/gsd-discuss-phase 2` — gather context first',
        '`/gsd-yolo-discuss 2` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute 2` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push 2` — same flow, then commit/push only after clean verification',
        '`/gsd-research-phase 2` — investigate unknowns',
      ],
      'continuation-format plan phase ordering'
    );

    assertInOrder(
      phaseComplete,
      [
        '`/gsd-discuss-phase 3` — gather context first',
        '`/gsd-yolo-discuss 3` — non-interactive discuss using recommended answers',
        '`/gsd-yolo-discuss-plan-and-execute 3` — discuss, plan, and execute with minimal intervention',
        '`/gsd-yolo-discuss-plan-execute-commit-and-push 3` — same flow, then commit/push only after clean verification',
        '`/gsd-research-phase 3` — investigate unknowns',
      ],
      'continuation-format phase complete ordering'
    );
  });
});

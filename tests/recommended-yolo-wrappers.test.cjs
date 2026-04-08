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
      content.includes('Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo --chain")'),
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
    assert.ok(content.includes("VERIFY_STATUS` is not `passed`"), 'wrapper should guard on passed verification');
    assert.ok(content.includes('git push --set-upstream origin "${CURRENT_BRANCH}"'), 'wrapper should set upstream when missing');
    assert.ok(content.includes('git commit -m "chore(${padded_phase}): finalize autonomous phase ${phase_number}"'), 'wrapper should define deterministic final commit message');
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
      workflowContent.includes('Skill(skill="gsd-discuss-phase", args="${PHASE_NUM} --yolo")'),
      'autonomous yolo should reuse discuss-phase --yolo'
    );
  });

  test('workflow defines strict push-after-phase sub-step and clean-pass gate', () => {
    assert.ok(
      workflowContent.includes('3d.6. Push After Phase (Strict Git Mode)'),
      'workflow should define push-after-phase sub-step'
    );
    assert.ok(workflowContent.includes('CLEAN_PASS'), 'workflow should track clean pass');
    assert.ok(
      workflowContent.includes('git push --set-upstream origin "${CURRENT_BRANCH}"'),
      'workflow should set upstream on push-after-phase'
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
    assert.ok(readme.includes('/gsd-autonomous [--yolo] [--push-after-phase]'), 'README should mention autonomous new flags');
    assert.ok(help.includes('/gsd-recommended-discuss 2'), 'help should include gsd-recommended-discuss usage');
    assert.ok(help.includes('/gsd-yolo-discuss-plan-execute-commit-and-push-all'), 'help should include strict push all alias usage');
    assert.ok(help.includes('/gsd-autonomous --from 3 --to 5 --yolo --push-after-phase'), 'help should include autonomous strict push usage');
  });
});

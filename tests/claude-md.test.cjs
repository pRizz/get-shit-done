/**
 * CLAUDE.md generation and new-project workflow tests
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('generate-claude-md', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates CLAUDE.md with workflow enforcement section', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'created');
    assert.strictEqual(output.sections_total, 6);
    assert.ok(output.sections_generated.includes('workflow'));
    assert.strictEqual(output.manual_content_preexisting, false);
    assert.deepStrictEqual(output.managed_sections_appended, []);
    assert.strictEqual(output.audit_recommended, false);
    assert.strictEqual(output.audit_message, '');

    const claudePath = path.join(tmpDir, 'CLAUDE.md');
    const content = fs.readFileSync(claudePath, 'utf-8');
    assert.ok(content.includes('## GSD Workflow Enforcement'));
    assert.ok(content.includes('/gsd-quick'));
    assert.ok(content.includes('/gsd-debug'));
    assert.ok(content.includes('/gsd-execute-phase'));
    assert.ok(content.includes('Do not make direct repo edits outside a GSD workflow'));
  });

  test('adds workflow enforcement section when updating an existing CLAUDE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '## Local Notes\n\nKeep this intro.\n');

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'updated');

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('## Local Notes'));
    assert.ok(content.includes('## GSD Workflow Enforcement'));
  });

  test('appends managed AGENTS.md sections after existing manual content without rewriting it', () => {
    const outputPath = path.join(tmpDir, 'AGENTS.md');
    const manualContent = '# Existing Instructions\n\nKeep this intro exactly.\n\n\n';

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );
    fs.writeFileSync(outputPath, manualContent);

    const result = runGsdTools(['generate-claude-md', '--output', outputPath, '--raw'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'updated');
    assert.strictEqual(output.claude_md_path, outputPath);
    assert.strictEqual(output.manual_content_preexisting, true);
    assert.deepStrictEqual(
      output.managed_sections_appended,
      ['project', 'stack', 'conventions', 'architecture', 'skills', 'workflow']
    );
    assert.strictEqual(output.audit_recommended, true);
    assert.ok(output.audit_message.includes('Review AGENTS.md'));

    const content = fs.readFileSync(outputPath, 'utf-8');
    assert.strictEqual(content.slice(0, manualContent.length), manualContent);
    assert.ok(content.startsWith(manualContent + '<!-- GSD:project-start'));
    assert.ok(content.includes('## GSD Workflow Enforcement'));
  });

  test('updates managed AGENTS.md sections in place and preserves manual content around them', () => {
    const outputPath = path.join(tmpDir, 'AGENTS.md');
    const manualTop = '# Existing Instructions\n\nKeep this intro.\n';
    const manualMiddle = '\n## Team Notes\n\nDo not rewrite this note.\n';
    const manualFooter = '\n## Local Footer\n\nTail note.\n';
    const existingContent = [
      manualTop,
      '<!-- GSD:project-start source:PROJECT.md -->',
      '## Project',
      '',
      'Old project summary.',
      '<!-- GSD:project-end -->',
      manualMiddle,
      '<!-- GSD:workflow-start source:GSD defaults -->',
      '## GSD Workflow Enforcement',
      '',
      'Outdated workflow rule.',
      '<!-- GSD:workflow-end -->',
      manualFooter,
    ].join('\n');

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );
    fs.writeFileSync(outputPath, existingContent);

    const result = runGsdTools(['generate-claude-md', '--output', outputPath, '--raw'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.manual_content_preexisting, true);
    assert.deepStrictEqual(output.managed_sections_appended, ['stack', 'conventions', 'architecture', 'skills']);
    assert.strictEqual(output.audit_recommended, true);
    assert.ok(output.audit_message.includes('Review AGENTS.md'));

    const content = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(content.includes(manualTop));
    assert.ok(content.includes(manualMiddle));
    assert.ok(content.includes(manualFooter));
    assert.ok(!content.includes('Old project summary.'));
    assert.ok(!content.includes('Outdated workflow rule.'));
    assert.ok(content.includes('**Test Project**'));
    assert.ok(content.indexOf('## Team Notes') < content.indexOf('<!-- GSD:workflow-start'));
    assert.ok(content.indexOf('## Local Footer') < content.indexOf('<!-- GSD:stack-start'));
  });

  test('does not recommend audit when a mixed AGENTS.md only refreshes existing managed sections', () => {
    const outputPath = path.join(tmpDir, 'AGENTS.md');

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );
    fs.writeFileSync(outputPath, '# Existing Instructions\n\nKeep this intro.\n');

    const firstRun = runGsdTools(['generate-claude-md', '--output', outputPath, '--raw'], tmpDir);
    assert.ok(firstRun.success, `Command failed: ${firstRun.error}`);

    const secondRun = runGsdTools(['generate-claude-md', '--output', outputPath, '--raw'], tmpDir);
    assert.ok(secondRun.success, `Command failed: ${secondRun.error}`);

    const output = JSON.parse(secondRun.output);
    assert.strictEqual(output.manual_content_preexisting, true);
    assert.deepStrictEqual(output.managed_sections_appended, []);
    assert.strictEqual(output.audit_recommended, false);
    assert.strictEqual(output.audit_message, '');
  });
});

describe('new-project workflow includes instruction-file merge behavior', () => {
  const workflowPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'new-project.md');
  const commandsPath = path.join(__dirname, '..', 'docs', 'COMMANDS.md');

  test('new-project workflow generates instruction file before final commit', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(content.includes('generate-claude-md'));
    assert.ok(content.includes('INSTRUCTION_RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" generate-claude-md --output "$INSTRUCTION_FILE")'));
    assert.ok(content.includes('if [[ "$INSTRUCTION_RESULT" == @file:* ]]; then INSTRUCTION_RESULT=$(cat "${INSTRUCTION_RESULT#@file:}"); fi'));
    assert.ok(content.includes('INSTRUCTION_AUDIT_RECOMMENDED=$(_gsd_field "$INSTRUCTION_RESULT" audit_recommended)'));
    assert.ok(content.includes('INSTRUCTION_AUDIT_MESSAGE=$(_gsd_field "$INSTRUCTION_RESULT" audit_message)'));
    assert.ok(content.includes('Create or merge project instruction file before final commit'));
    // Codex fix: workflow now uses $INSTRUCTION_FILE (AGENTS.md for Codex, CLAUDE.md otherwise)
    assert.ok(content.includes('--files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md "$INSTRUCTION_FILE"'));
  });

  test('new-project artifacts reference instruction file variable', () => {
    const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
    const commandsContent = fs.readFileSync(commandsPath, 'utf-8');

    assert.ok(workflowContent.includes('create or merge the default GSD workflow-enforcement guidance'));
    assert.ok(workflowContent.includes('| Project guide  | `$INSTRUCTION_FILE`'));
    assert.ok(workflowContent.includes('- `$INSTRUCTION_FILE`'));
    assert.ok(workflowContent.includes('created or merged with GSD workflow guidance'));
    assert.ok(workflowContent.includes('**Audit note:** [INSTRUCTION_AUDIT_MESSAGE] Review `$INSTRUCTION_FILE` before proceeding.'));
    assert.ok(
      workflowContent.indexOf('**Audit note:** [INSTRUCTION_AUDIT_MESSAGE] Review `$INSTRUCTION_FILE` before proceeding.')
      < workflowContent.indexOf('AUTO-ADVANCING → DISCUSS PHASE 1')
    );
    assert.ok(commandsContent.includes('instruction file'));
    assert.ok(commandsContent.includes('prompts you to audit that file'));
    assert.ok(commandsContent.includes('`AGENTS.md` for Codex'));
  });
});

describe('generate-claude-md skills section', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Test Project\n\n## What This Is\n\nA test project.\n'
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('includes skills fallback when no skills directories exist', () => {
    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.sections_fallback.includes('skills'));

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('<!-- GSD:skills-start'));
    assert.ok(content.includes('<!-- GSD:skills-end -->'));
    assert.ok(content.includes('No project skills found. Add skills to any of'));
  });

  test('discovers skills from .claude/skills/ directory', () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'api-payments');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: api-payments\ndescription: Payment gateway integration.\n---\n\n# API Payments\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.sections_generated.includes('skills'));
    assert.ok(!output.sections_fallback.includes('skills'));

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('api-payments'));
    assert.ok(content.includes('Payment gateway integration'));
    assert.ok(content.includes('## Project Skills'));
  });

  test('discovers skills from .agents/skills/ directory', () => {
    const skillDir = path.join(tmpDir, '.agents', 'skills', 'data-sync');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: data-sync\ndescription: ERP synchronization flows.\n---\n\n# Data Sync\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('data-sync'));
    assert.ok(content.includes('ERP synchronization flows'));
  });

  test('skips gsd- prefixed skill directories', () => {
    const gsdSkillDir = path.join(tmpDir, '.claude', 'skills', 'gsd-plan-phase');
    const userSkillDir = path.join(tmpDir, '.claude', 'skills', 'my-feature');
    fs.mkdirSync(gsdSkillDir, { recursive: true });
    fs.mkdirSync(userSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(gsdSkillDir, 'SKILL.md'),
      '---\nname: gsd-plan-phase\ndescription: GSD internal skill.\n---\n'
    );
    fs.writeFileSync(
      path.join(userSkillDir, 'SKILL.md'),
      '---\nname: my-feature\ndescription: Custom project skill.\n---\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(!content.includes('gsd-plan-phase'));
    assert.ok(content.includes('my-feature'));
    assert.ok(content.includes('Custom project skill'));
  });

  test('handles multi-line description in frontmatter', () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'complex-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: complex-skill\ndescription: First line of description.\n  Continued on second line.\n  And a third line.\n---\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('First line of description'));
    assert.ok(content.includes('Continued on second line'));
    assert.ok(content.includes('And a third line'));
  });

  test('deduplicates skills found in multiple directories', () => {
    // Same skill in both .claude/skills/ and .agents/skills/
    const dir1 = path.join(tmpDir, '.claude', 'skills', 'shared-skill');
    const dir2 = path.join(tmpDir, '.agents', 'skills', 'shared-skill');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    const skillContent = '---\nname: shared-skill\ndescription: Appears twice.\n---\n';
    fs.writeFileSync(path.join(dir1, 'SKILL.md'), skillContent);
    fs.writeFileSync(path.join(dir2, 'SKILL.md'), skillContent);

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    const matches = content.match(/shared-skill/g);
    // Should appear exactly twice: once in name column, once in path column (single row)
    assert.strictEqual(matches.length, 2);
  });

  test('updates existing skills section on regeneration', () => {
    // First generation — no skills
    runGsdTools('generate-claude-md', tmpDir);
    let content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('No project skills found'));

    // Add a skill and regenerate
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'new-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: new-skill\ndescription: Just added.\n---\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(!content.includes('No project skills found'));
    assert.ok(content.includes('new-skill'));
    assert.ok(content.includes('Just added'));
  });

  test('skills section appears between architecture and workflow', () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'ordering-test');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: ordering-test\ndescription: Verify section order.\n---\n'
    );

    const result = runGsdTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    const archIdx = content.indexOf('## Architecture');
    const skillsIdx = content.indexOf('## Project Skills');
    const workflowIdx = content.indexOf('## GSD Workflow Enforcement');
    assert.ok(archIdx < skillsIdx, 'Skills section should come after Architecture');
    assert.ok(skillsIdx < workflowIdx, 'Skills section should come before Workflow Enforcement');
  });
});

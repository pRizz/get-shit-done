/**
 * GSD Tools Tests - codex-config.cjs
 *
 * Tests for Codex adapter header, agent conversion, config.toml generation/merge,
 * per-agent .toml generation, and uninstall cleanup.
 */

// Enable test exports from install.js (skips main CLI logic)
process.env.GSD_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const {
  getCodexSkillAdapterHeader,
  convertClaudeCommandToCodexSkill,
  convertClaudeAgentToCodexAgent,
  generateCodexAgentToml,
  generateCodexConfigBlock,
  stripGsdFromCodexConfig,
  mergeCodexConfig,
  countClaudeRuntimeRootLeaks,
  getCodexManagedLeakScanRoots,
  scanCodexManagedClaudeRuntimeLeaks,
  install,
  GSD_CODEX_MARKER,
  CODEX_AGENT_SANDBOX,
} = require('../bin/install.js');

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

function runCodexInstall(codexHome, cwd = path.join(__dirname, '..')) {
  const previousCodeHome = process.env.CODEX_HOME;
  const previousCwd = process.cwd();
  const previousHome = setHomeDir(path.dirname(codexHome));
  process.env.CODEX_HOME = codexHome;

  try {
    process.chdir(cwd);
    return install(true, 'codex');
  } finally {
    process.chdir(previousCwd);
    restoreHomeDir(previousHome);
    if (previousCodeHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodeHome;
    }
  }
}

function readCodexConfig(codexHome) {
  return fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
}

function writeCodexConfig(codexHome, content) {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), content, 'utf8');
}

function countMatches(content, pattern) {
  return (content.match(pattern) || []).length;
}

function assertNoDraftRootKeys(content) {
  assert.ok(!content.includes('model = "gpt-5.4"'), 'does not inject draft model default');
  assert.ok(!content.includes('model_reasoning_effort = "high"'), 'does not inject draft reasoning default');
  assert.ok(!content.includes('disable_response_storage = true'), 'does not inject draft storage default');
}

function assertUsesOnlyEol(content, eol) {
  if (eol === '\r\n') {
    assert.ok(content.includes('\r\n'), 'contains CRLF line endings');
    assert.ok(!content.replace(/\r\n/g, '').includes('\n'), 'does not contain bare LF line endings');
    return;
  }
  assert.ok(!content.includes('\r\n'), 'does not contain CRLF line endings');
}

// ─── getCodexSkillAdapterHeader ─────────────────────────────────────────────────

describe('getCodexSkillAdapterHeader', () => {
  test('contains all four sections', () => {
    const result = getCodexSkillAdapterHeader('gsd-execute-phase');
    assert.ok(result.includes('<codex_skill_adapter>'), 'has opening tag');
    assert.ok(result.includes('</codex_skill_adapter>'), 'has closing tag');
    assert.ok(result.includes('## A. Skill Invocation'), 'has section A');
    assert.ok(result.includes('## B. AskUserQuestion'), 'has section B');
    assert.ok(result.includes('## C. Task() → spawn_agent'), 'has section C');
    assert.ok(result.includes('## D. Skill() → Nested Skill Delegation'), 'has section D');
  });

  test('includes correct invocation syntax', () => {
    const result = getCodexSkillAdapterHeader('gsd-plan-phase');
    assert.ok(result.includes('`$gsd-plan-phase`'), 'has $skillName invocation');
    assert.ok(result.includes('{{GSD_ARGS}}'), 'has GSD_ARGS variable');
  });

  test('section B maps AskUserQuestion parameters', () => {
    const result = getCodexSkillAdapterHeader('gsd-discuss-phase');
    assert.ok(result.includes('request_user_input'), 'maps to request_user_input');
    assert.ok(result.includes('header'), 'maps header parameter');
    assert.ok(result.includes('question'), 'maps question parameter');
    assert.ok(result.includes('label'), 'maps options label');
    assert.ok(result.includes('description'), 'maps options description');
    assert.ok(result.includes('multiSelect'), 'documents multiSelect workaround');
    assert.ok(result.includes('Execute mode'), 'documents Execute mode fallback');
  });

  test('section C maps Task to spawn_agent', () => {
    const result = getCodexSkillAdapterHeader('gsd-execute-phase');
    assert.ok(result.includes('spawn_agent'), 'maps to spawn_agent');
    assert.ok(result.includes('agent_type'), 'maps subagent_type to agent_type');
    assert.ok(result.includes('fork_context'), 'documents fork_context default');
    assert.ok(result.includes('wait(ids)'), 'documents parallel wait pattern');
    assert.ok(result.includes('close_agent'), 'documents close_agent cleanup');
    assert.ok(result.includes('CHECKPOINT'), 'documents result markers');
  });

  test('section D maps nested Skill delegation', () => {
    const result = getCodexSkillAdapterHeader('gsd-yolo-discuss-plan-execute-commit-and-push-all');
    assert.ok(result.includes('inline delegation'), 'documents inline delegation behavior');
    assert.ok(result.includes('./.codex/skills/<skill>/SKILL.md'), 'documents local skill resolution');
    assert.ok(result.includes('$HOME/.codex/skills/<skill>/SKILL.md'), 'documents global skill resolution');
    assert.ok(result.includes('{{GSD_ARGS}}'), 'documents delegated argument propagation');
    assert.ok(result.includes('may recurse multiple levels'), 'documents recursive nested skill handling');
    assert.ok(result.includes('clear missing-skill error'), 'documents missing-skill failure mode');
  });
});

// ─── convertClaudeCommandToCodexSkill ──────────────────────────────────────────

describe('convertClaudeCommandToCodexSkill', () => {
  test('injects the codex skill adapter header for wrapper skills', () => {
    const input = `---
name: gsd:yolo-discuss-plan-execute-commit-and-push-all
description: Run yolo discuss, plan, execute, commit, and push for all remaining phases.
---

Skill(skill="gsd-autonomous", args="--yolo --push-after-phase")`;

    const result = convertClaudeCommandToCodexSkill(
      input,
      'gsd-yolo-discuss-plan-execute-commit-and-push-all'
    );

    assert.ok(result.includes('## D. Skill() → Nested Skill Delegation'), 'converted skill includes nested skill section');
    assert.ok(result.includes('./.codex/skills/<skill>/SKILL.md'), 'converted skill includes local resolution guidance');
    assert.ok(result.includes('$HOME/.codex/skills/<skill>/SKILL.md'), 'converted skill includes global resolution guidance');
    assert.ok(result.includes('`$gsd-yolo-discuss-plan-execute-commit-and-push-all`'), 'converted skill uses Codex invocation syntax');
  });

  test('converted wrapper body still preserves nested Skill(...) calls under the new adapter', () => {
    const input = `---
name: gsd:yolo-discuss-plan-execute-commit-and-push-all
description: Run all remaining phases.
---

Skill(skill="gsd-autonomous", args="--yolo --push-after-phase")`;

    const result = convertClaudeCommandToCodexSkill(
      input,
      'gsd-yolo-discuss-plan-execute-commit-and-push-all'
    );

    assert.ok(
      result.includes('Skill(skill="gsd-autonomous", args="--yolo --push-after-phase")'),
      'converted wrapper keeps nested Skill call in body'
    );
    assert.ok(
      result.includes('treat this as inline delegation'),
      'adapter explicitly documents nested Skill inline delegation'
    );
  });
});

// ─── convertClaudeAgentToCodexAgent ─────────────────────────────────────────────

describe('convertClaudeAgentToCodexAgent', () => {
  test('adds codex_agent_role header and cleans frontmatter', () => {
    const input = `---
name: gsd-executor
description: Executes GSD plans with atomic commits
tools: Read, Write, Edit, Bash, Grep, Glob
color: yellow
---

<role>
You are a GSD plan executor.
</role>`;

    const result = convertClaudeAgentToCodexAgent(input);

    // Frontmatter rebuilt with only name and description
    assert.ok(result.startsWith('---\n'), 'starts with frontmatter');
    assert.ok(result.includes('"gsd-executor"'), 'has quoted name');
    assert.ok(result.includes('"Executes GSD plans with atomic commits"'), 'has quoted description');
    assert.ok(!result.includes('color: yellow'), 'drops color field');
    // Tools should be in <codex_agent_role> but NOT in frontmatter
    const fmEnd = result.indexOf('---', 4);
    const frontmatterSection = result.substring(0, fmEnd);
    assert.ok(!frontmatterSection.includes('tools:'), 'drops tools from frontmatter');

    // Has codex_agent_role block
    assert.ok(result.includes('<codex_agent_role>'), 'has role header');
    assert.ok(result.includes('role: gsd-executor'), 'role matches agent name');
    assert.ok(result.includes('tools: Read, Write, Edit, Bash, Grep, Glob'), 'tools in role block');
    assert.ok(result.includes('purpose: Executes GSD plans with atomic commits'), 'purpose from description');
    assert.ok(result.includes('</codex_agent_role>'), 'has closing tag');

    // Body preserved
    assert.ok(result.includes('<role>'), 'body content preserved');
  });

  test('converts slash commands in body', () => {
    const input = `---
name: gsd-test
description: Test agent
tools: Read
---

Run /gsd:execute-phase to proceed.`;

    const result = convertClaudeAgentToCodexAgent(input);
    assert.ok(result.includes('$gsd-execute-phase'), 'converts slash commands');
    assert.ok(!result.includes('/gsd:execute-phase'), 'original slash command removed');
  });

  test('handles content without frontmatter', () => {
    const input = 'Just some content without frontmatter.';
    const result = convertClaudeAgentToCodexAgent(input);
    assert.strictEqual(result, input, 'returns input unchanged');
  });

  test('replaces .claude paths with .codex paths (#1430)', () => {
    const input = `---
name: gsd-debugger
description: Debugs issues
tools: Read, Bash
---

INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state load)
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: resolve"`;

    const result = convertClaudeAgentToCodexAgent(input);
    assert.ok(result.includes('$HOME/.codex/get-shit-done/bin/gsd-tools.cjs'), 'replaces $HOME/.claude/ with $HOME/.codex/');
    assert.ok(!result.includes('$HOME/.claude/'), 'no .claude paths remain');
  });

  test('adds AGENTS canonical lookup with CLAUDE compatibility fallback', () => {
    const input = `---
name: gsd-executor
description: Executes plans
tools: Read
---

<project_context>
**Project instructions:** Read \`./CLAUDE.md\` if it exists in the working directory. Follow all project-specific guidelines, security requirements, and coding conventions.

**Project skills:** Check \`.claude/skills/\` or \`.agents/skills/\` directory if either exists:
1. List available skills (subdirectories)
2. Read \`SKILL.md\` for each skill (lightweight index ~130 lines)
3. Load specific \`rules/*.md\` files as needed during implementation
4. Do NOT load full \`AGENTS.md\` files (100KB+ context cost)
5. Follow skill rules relevant to your current task

**CLAUDE.md enforcement:** If \`./CLAUDE.md\` exists, treat its directives as hard constraints during execution.
</project_context>`;

    const result = convertClaudeAgentToCodexAgent(input);
    assert.ok(result.includes('Prefer `./AGENTS.md` in the working directory.'), 'uses AGENTS.md as canonical instruction file');
    assert.ok(result.includes('read `./CLAUDE.md` for compatibility with older repos'), 'keeps CLAUDE.md compatibility fallback');
    assert.ok(result.includes('**Instruction-file enforcement:**'), 'rewrites enforcement block to instruction-file wording');
    assert.ok(!result.includes('Do NOT load full `AGENTS.md` files'), 'removes stale AGENTS.md load-blocking instruction');
  });
});

// ─── generateCodexAgentToml ─────────────────────────────────────────────────────

describe('generateCodexAgentToml', () => {
  const sampleAgent = `---
name: gsd-executor
description: Executes plans
tools: Read, Write, Edit
color: yellow
---

<role>You are an executor.</role>`;

  test('sets workspace-write for executor', () => {
    const result = generateCodexAgentToml('gsd-executor', sampleAgent);
    assert.ok(result.includes('sandbox_mode = "workspace-write"'), 'has workspace-write');
  });

  test('sets read-only for plan-checker', () => {
    const checker = `---
name: gsd-plan-checker
description: Checks plans
tools: Read, Grep, Glob
---

<role>You check plans.</role>`;
    const result = generateCodexAgentToml('gsd-plan-checker', checker);
    assert.ok(result.includes('sandbox_mode = "read-only"'), 'has read-only');
  });

  test('includes developer_instructions from body', () => {
    const result = generateCodexAgentToml('gsd-executor', sampleAgent);
    assert.ok(result.includes("developer_instructions = '''"), 'has literal triple-quoted instructions');
    assert.ok(result.includes('<role>You are an executor.</role>'), 'body content in instructions');
    assert.ok(result.includes("'''"), 'has closing literal triple quotes');
  });

  test('includes required name and description fields', () => {
    const result = generateCodexAgentToml('gsd-executor', sampleAgent);
    assert.ok(result.includes('name = "gsd-executor"'), 'has name');
    assert.ok(result.includes('description = "Executes plans"'), 'has description');
  });

  test('falls back to generated description when frontmatter is missing fields', () => {
    const minimalAgent = `<role>You are an unknown agent.</role>`;
    const result = generateCodexAgentToml('gsd-unknown', minimalAgent);
    assert.ok(result.includes('name = "gsd-unknown"'), 'falls back to agent name');
    assert.ok(result.includes('description = "GSD agent gsd-unknown"'), 'falls back to synthetic description');
  });

  test('defaults unknown agents to read-only', () => {
    const result = generateCodexAgentToml('gsd-unknown', sampleAgent);
    assert.ok(result.includes('sandbox_mode = "read-only"'), 'defaults to read-only');
  });
});

// ─── CODEX_AGENT_SANDBOX mapping ────────────────────────────────────────────────

describe('CODEX_AGENT_SANDBOX', () => {
  test('has all 11 agents mapped', () => {
    const agentNames = Object.keys(CODEX_AGENT_SANDBOX);
    assert.strictEqual(agentNames.length, 11, 'has 11 agents');
  });

  test('workspace-write agents have write tools', () => {
    const writeAgents = [
      'gsd-executor', 'gsd-planner', 'gsd-phase-researcher',
      'gsd-project-researcher', 'gsd-research-synthesizer', 'gsd-verifier',
      'gsd-codebase-mapper', 'gsd-roadmapper', 'gsd-debugger',
    ];
    for (const name of writeAgents) {
      assert.strictEqual(CODEX_AGENT_SANDBOX[name], 'workspace-write', `${name} is workspace-write`);
    }
  });

  test('read-only agents have no write tools', () => {
    const readOnlyAgents = ['gsd-plan-checker', 'gsd-integration-checker'];
    for (const name of readOnlyAgents) {
      assert.strictEqual(CODEX_AGENT_SANDBOX[name], 'read-only', `${name} is read-only`);
    }
  });
});

// ─── generateCodexConfigBlock ───────────────────────────────────────────────────

describe('generateCodexConfigBlock', () => {
  const agents = [
    { name: 'gsd-executor', description: 'Executes plans' },
    { name: 'gsd-planner', description: 'Creates plans' },
  ];

  test('starts with GSD marker', () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(result.startsWith(GSD_CODEX_MARKER), 'starts with marker');
  });

  test('does not include feature flags or agents table header', () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(!result.includes('[features]'), 'no features table');
    assert.ok(!result.includes('multi_agent'), 'no multi_agent');
    assert.ok(!result.includes('default_mode_request_user_input'), 'no request_user_input');
    // Should not have bare [agents] table header (only [agents.gsd-*] sections)
    assert.ok(!result.match(/^\[agents\]\s*$/m), 'no bare [agents] table');
    assert.ok(!result.includes('max_threads'), 'no max_threads');
    assert.ok(!result.includes('max_depth'), 'no max_depth');
  });

  test('includes per-agent sections with relative paths (no targetDir)', () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(result.includes('[agents.gsd-executor]'), 'has executor section');
    assert.ok(result.includes('[agents.gsd-planner]'), 'has planner section');
    assert.ok(result.includes('config_file = "agents/gsd-executor.toml"'), 'relative config_file without targetDir');
    assert.ok(result.includes('"Executes plans"'), 'has executor description');
  });

  test('uses absolute config_file paths when targetDir is provided', () => {
    const result = generateCodexConfigBlock(agents, '/home/user/.codex');
    assert.ok(result.includes('config_file = "/home/user/.codex/agents/gsd-executor.toml"'), 'absolute executor path');
    assert.ok(result.includes('config_file = "/home/user/.codex/agents/gsd-planner.toml"'), 'absolute planner path');
    assert.ok(!result.includes('config_file = "agents/'), 'no relative paths when targetDir given');
  });
});

// ─── stripGsdFromCodexConfig ────────────────────────────────────────────────────

describe('stripGsdFromCodexConfig', () => {
  test('returns null for GSD-only config', () => {
    const content = `${GSD_CODEX_MARKER}\n[features]\nmulti_agent = true\n`;
    const result = stripGsdFromCodexConfig(content);
    assert.strictEqual(result, null, 'returns null when GSD-only');
  });

  test('preserves user content before marker', () => {
    const content = `[model]\nname = "o3"\n\n${GSD_CODEX_MARKER}\n[features]\nmulti_agent = true\n`;
    const result = stripGsdFromCodexConfig(content);
    assert.ok(result.includes('[model]'), 'preserves user section');
    assert.ok(result.includes('name = "o3"'), 'preserves user values');
    assert.ok(!result.includes('multi_agent'), 'removes GSD content');
    assert.ok(!result.includes(GSD_CODEX_MARKER), 'removes marker');
  });

  test('strips injected feature keys without marker', () => {
    const content = `[features]\nmulti_agent = true\ndefault_mode_request_user_input = true\nother_feature = false\n`;
    const result = stripGsdFromCodexConfig(content);
    assert.ok(!result.includes('multi_agent'), 'removes multi_agent');
    assert.ok(!result.includes('default_mode_request_user_input'), 'removes request_user_input');
    assert.ok(result.includes('other_feature = false'), 'preserves user features');
  });

  test('removes empty [features] section', () => {
    const content = `[features]\nmulti_agent = true\n[model]\nname = "o3"\n`;
    const result = stripGsdFromCodexConfig(content);
    assert.ok(!result.includes('[features]'), 'removes empty features section');
    assert.ok(result.includes('[model]'), 'preserves other sections');
  });

  test('strips injected keys above marker on uninstall', () => {
    // Case 3 install injects keys into [features] AND appends marker block
    const content = `[model]\nname = "o3"\n\n[features]\nmulti_agent = true\ndefault_mode_request_user_input = true\nsome_custom_flag = true\n\n${GSD_CODEX_MARKER}\n[agents]\nmax_threads = 4\n`;
    const result = stripGsdFromCodexConfig(content);
    assert.ok(result.includes('[model]'), 'preserves user model section');
    assert.ok(result.includes('some_custom_flag = true'), 'preserves user feature');
    assert.ok(!result.includes('multi_agent'), 'strips injected multi_agent');
    assert.ok(!result.includes('default_mode_request_user_input'), 'strips injected request_user_input');
    assert.ok(!result.includes(GSD_CODEX_MARKER), 'strips marker');
  });

  test('removes [agents.gsd-*] sections', () => {
    const content = `[agents.gsd-executor]\ndescription = "test"\nconfig_file = "agents/gsd-executor.toml"\n\n[agents.custom-agent]\ndescription = "user agent"\n`;
    const result = stripGsdFromCodexConfig(content);
    assert.ok(!result.includes('[agents.gsd-executor]'), 'removes GSD agent section');
    assert.ok(result.includes('[agents.custom-agent]'), 'preserves user agent section');
  });
});

// ─── mergeCodexConfig ───────────────────────────────────────────────────────────

describe('mergeCodexConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-codex-merge-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleBlock = generateCodexConfigBlock([
    { name: 'gsd-executor', description: 'Executes plans' },
  ]);

  test('case 1: creates new config.toml', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    mergeCodexConfig(configPath, sampleBlock);

    assert.ok(fs.existsSync(configPath), 'file created');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes(GSD_CODEX_MARKER), 'has marker');
    assert.ok(content.includes('[agents.gsd-executor]'), 'has agent');
    assert.ok(!content.includes('[features]'), 'no features section');
    assert.ok(!content.includes('multi_agent'), 'no multi_agent');
  });

  test('case 2: replaces existing GSD block', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const userContent = '[model]\nname = "o3"\n';
    fs.writeFileSync(configPath, userContent + '\n' + sampleBlock + '\n');

    // Re-merge with updated block
    const newBlock = generateCodexConfigBlock([
      { name: 'gsd-executor', description: 'Updated description' },
      { name: 'gsd-planner', description: 'New agent' },
    ]);
    mergeCodexConfig(configPath, newBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('[model]'), 'preserves user content');
    assert.ok(content.includes('Updated description'), 'has new description');
    assert.ok(content.includes('[agents.gsd-planner]'), 'has new agent');
    // Verify no duplicate markers
    const markerCount = (content.match(new RegExp(GSD_CODEX_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(markerCount, 1, 'exactly one marker');
  });

  test('case 3: appends to config without GSD marker', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[model]\nname = "o3"\n');

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('[model]'), 'preserves user content');
    assert.ok(content.includes(GSD_CODEX_MARKER), 'adds marker');
    assert.ok(content.includes('[agents.gsd-executor]'), 'has agent');
  });

  test('case 3 with existing [features]: preserves user features, does not inject GSD keys', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[features]\nother_feature = true\n\n[model]\nname = "o3"\n');

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('other_feature = true'), 'preserves existing feature');
    assert.ok(!content.includes('multi_agent'), 'does not inject multi_agent');
    assert.ok(!content.includes('default_mode_request_user_input'), 'does not inject request_user_input');
    assert.ok(content.includes(GSD_CODEX_MARKER), 'adds marker for agents block');
    assert.ok(content.includes('[agents.gsd-executor]'), 'has agent');
  });

  test('case 3 strips existing [agents.gsd-*] sections before appending fresh block', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const existing = [
      '[model]',
      'name = "o3"',
      '',
      '[agents.custom-agent]',
      'description = "user agent"',
      '',
      '',
      '[agents.gsd-executor]',
      'description = "old"',
      'config_file = "agents/gsd-executor.toml"',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, existing);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    const gsdAgentCount = (content.match(/^\[agents\.gsd-executor\]\s*$/gm) || []).length;
    const markerCount = (content.match(new RegExp(GSD_CODEX_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    assert.ok(content.includes('[model]'), 'preserves user content');
    assert.ok(content.includes('[agents.custom-agent]'), 'preserves non-GSD agent section');
    assert.strictEqual(gsdAgentCount, 1, 'keeps exactly one GSD agent section');
    assert.strictEqual(markerCount, 1, 'adds exactly one marker block');
    assert.ok(!/\n{3,}# GSD Agent Configuration/.test(content), 'does not leave extra blank lines before marker block');
  });

  test('idempotent: re-merge produces same result', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    mergeCodexConfig(configPath, sampleBlock);
    const first = fs.readFileSync(configPath, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    const second = fs.readFileSync(configPath, 'utf8');

    assert.strictEqual(first, second, 'idempotent merge');
  });

  test('case 2 after case 3 with existing [features]: no duplicate sections', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[features]\nother_feature = true\n\n[model]\nname = "o3"\n');
    mergeCodexConfig(configPath, sampleBlock);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    const featuresCount = (content.match(/^\[features\]\s*$/gm) || []).length;
    assert.strictEqual(featuresCount, 1, 'exactly one [features] section');
    assert.ok(content.includes('other_feature = true'), 'preserves user feature keys');
    assert.ok(content.includes('[agents.gsd-executor]'), 'has agent');
    // Verify no duplicate markers
    const markerCount = (content.match(new RegExp(GSD_CODEX_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(markerCount, 1, 'exactly one marker');
  });

  test('case 2 does not inject feature keys', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const manualContent = '[features]\nother_feature = true\n\n' + GSD_CODEX_MARKER + '\n[agents.gsd-old]\ndescription = "old"\n';
    fs.writeFileSync(configPath, manualContent);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(!content.includes('multi_agent'), 'does not inject multi_agent');
    assert.ok(!content.includes('default_mode_request_user_input'), 'does not inject request_user_input');
    assert.ok(content.includes('other_feature = true'), 'preserves user feature');
    assert.ok(content.includes('[agents.gsd-executor]'), 'has agent from fresh block');
  });

  test('case 2 strips leaked [agents] and [agents.gsd-*] from before content', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const brokenContent = [
      '[features]',
      'child_agents_md = false',
      '',
      '[agents]',
      'max_threads = 4',
      'max_depth = 2',
      '',
      '[agents.gsd-executor]',
      'description = "old"',
      'config_file = "agents/gsd-executor.toml"',
      '',
      GSD_CODEX_MARKER,
      '',
      '[agents.gsd-executor]',
      'description = "Executes plans"',
      'config_file = "agents/gsd-executor.toml"',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, brokenContent);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('child_agents_md = false'), 'preserves user feature keys');
    assert.ok(content.includes('[agents.gsd-executor]'), 'has agent from fresh block');
    // Verify the leaked [agents] table header above marker was stripped
    const markerIndex = content.indexOf(GSD_CODEX_MARKER);
    const beforeMarker = content.substring(0, markerIndex);
    assert.ok(!beforeMarker.match(/^\[agents\]\s*$/m), 'no leaked [agents] above marker');
    assert.ok(!beforeMarker.includes('[agents.gsd-'), 'no leaked [agents.gsd-*] above marker');
  });

  test('case 2 strips leaked GSD-managed sections above marker in CRLF files', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const brokenContent = [
      '[features]',
      'child_agents_md = false',
      '',
      '[agents]',
      'max_threads = 4',
      '',
      '[agents.gsd-executor]',
      'description = "stale"',
      'config_file = "agents/gsd-executor.toml"',
      '',
      GSD_CODEX_MARKER,
      '',
      '[agents.gsd-executor]',
      'description = "Executes plans"',
      'config_file = "agents/gsd-executor.toml"',
      '',
    ].join('\r\n');
    fs.writeFileSync(configPath, brokenContent, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    const markerIndex = content.indexOf(GSD_CODEX_MARKER);
    const beforeMarker = content.slice(0, markerIndex);

    assert.ok(content.includes('child_agents_md = false'), 'preserves user feature keys');
    assert.strictEqual(countMatches(beforeMarker, /^\[agents\]\s*$/gm), 0, 'removes leaked [agents] above marker');
    assert.strictEqual(countMatches(beforeMarker, /^\[agents\.gsd-executor\]\s*$/gm), 0, 'removes leaked GSD agent section above marker');
    assert.strictEqual(countMatches(content, /^\[agents\.gsd-executor\]\s*$/gm), 1, 'keeps one managed agent section');
    assertUsesOnlyEol(content, '\r\n');
  });

  test('case 2 preserves user-authored [agents] tables while stripping leaked GSD sections in CRLF files', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const brokenContent = [
      '[features]',
      'child_agents_md = false',
      '',
      '[agents]',
      'default = "custom-agent"',
      '',
      '[agents.gsd-executor]',
      'description = "stale"',
      'config_file = "agents/gsd-executor.toml"',
      '',
      GSD_CODEX_MARKER,
      '',
      '[agents.gsd-executor]',
      'description = "Executes plans"',
      'config_file = "agents/gsd-executor.toml"',
      '',
    ].join('\r\n');
    fs.writeFileSync(configPath, brokenContent, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    const markerIndex = content.indexOf(GSD_CODEX_MARKER);
    const beforeMarker = content.slice(0, markerIndex);

    assert.ok(beforeMarker.includes('[agents]\r\ndefault = "custom-agent"\r\n'), 'preserves user-authored [agents] table');
    assert.strictEqual(countMatches(beforeMarker, /^\[agents\.gsd-executor\]\s*$/gm), 0, 'removes leaked GSD agent section above marker');
    assert.strictEqual(countMatches(content, /^\[agents\.gsd-executor\]\s*$/gm), 1, 'keeps one managed agent section in the GSD block');
    assertUsesOnlyEol(content, '\r\n');
  });

  test('case 2 idempotent after case 3 with existing [features]', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[features]\nother_feature = true\n');
    mergeCodexConfig(configPath, sampleBlock);
    const first = fs.readFileSync(configPath, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    const second = fs.readFileSync(configPath, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    const third = fs.readFileSync(configPath, 'utf8');

    assert.strictEqual(first, second, 'idempotent after 2nd merge');
    assert.strictEqual(second, third, 'idempotent after 3rd merge');
  });

  test('preserves CRLF when appending GSD block to existing config', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[model]\r\nname = "o3"\r\n', 'utf8');

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('[model]\r\nname = "o3"\r\n'), 'preserves existing CRLF content');
    assert.ok(content.includes(`${GSD_CODEX_MARKER}\r\n`), 'writes marker with CRLF');
    assertUsesOnlyEol(content, '\r\n');
  });

  test('uses the first newline style when appending GSD block to mixed-EOL configs', () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '# first line wins\n[model]\r\nname = "o3"\r\n', 'utf8');

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('# first line wins\n[model]\r\nname = "o3"'), 'preserves the existing mixed-EOL model content');
    assert.ok(content.includes(`\n\n${GSD_CODEX_MARKER}\n`), 'writes the managed block using the first newline style');
  });
});

// ─── Integration: installCodexConfig ────────────────────────────────────────────

describe('Codex leak scan helpers', () => {
  let tmpTarget;

  beforeEach(() => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-codex-leaks-'));
  });

  afterEach(() => {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  });

  test('countClaudeRuntimeRootLeaks flags only runtime-root Claude paths', () => {
    const content = [
      'targetDir = ~/.claude/get-shit-done',
      'hooksDir = ~/.claude/hooks/',
      'projectsDir = $HOME/.claude/projects',
      'configDir = ~/.claude',
      'Project skills live in .claude/skills/',
      'Repo guidance can mention .claude/agents/',
      'Do not flag ~/.claude/skills/ because that is a convention reference here.',
    ].join('\n');

    assert.strictEqual(countClaudeRuntimeRootLeaks(content), 4, 'only true Claude runtime-root paths should count as leaks');
  });

  test('getCodexManagedLeakScanRoots only returns installer-managed targets', () => {
    fs.mkdirSync(path.join(tmpTarget, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'get-shit-done'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'worktrees', 'abc'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, '.tmp', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(tmpTarget, 'config.toml'), '[features]\n');
    fs.writeFileSync(path.join(tmpTarget, 'history.jsonl'), '{}\n');

    const roots = getCodexManagedLeakScanRoots(tmpTarget)
      .map(p => path.relative(tmpTarget, p).replace(/\\/g, '/'))
      .sort();

    assert.deepStrictEqual(roots, ['agents', 'config.toml', 'get-shit-done', 'skills']);
  });

  test('scanCodexManagedClaudeRuntimeLeaks ignores user/stateful paths and keeps managed leaks', () => {
    fs.mkdirSync(path.join(tmpTarget, 'skills', 'gsd-test'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'get-shit-done', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'worktrees', 'deadbeef'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, '.tmp', 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(tmpTarget, 'config-backup-repo'), { recursive: true });

    fs.writeFileSync(path.join(tmpTarget, 'skills', 'gsd-test', 'SKILL.md'), 'See .claude/skills/ for project conventions.\n');
    fs.writeFileSync(path.join(tmpTarget, 'agents', 'gsd-debugger.toml'), 'targetDir = ~/.claude/get-shit-done\n');
    fs.writeFileSync(path.join(tmpTarget, 'get-shit-done', 'workflows', 'debug.md'), 'configDir = ~/.claude\n');
    fs.writeFileSync(path.join(tmpTarget, 'worktrees', 'deadbeef', 'leaky.md'), 'hooksDir = ~/.claude/hooks/\n');
    fs.writeFileSync(path.join(tmpTarget, '.tmp', 'plugins', 'leaky.md'), 'projectsDir = $HOME/.claude/projects\n');
    fs.writeFileSync(path.join(tmpTarget, 'config-backup-repo', 'leaky.md'), 'targetDir = ~/.claude/get-shit-done\n');
    fs.writeFileSync(path.join(tmpTarget, 'history.jsonl'), '{"text":"~/.claude/get-shit-done"}\n');

    const leaks = scanCodexManagedClaudeRuntimeLeaks(tmpTarget);

    assert.deepStrictEqual(
      leaks,
      [
        { file: 'agents/gsd-debugger.toml', count: 1 },
        { file: 'get-shit-done/workflows/debug.md', count: 1 },
      ],
      'only managed Codex outputs with true Claude runtime-root leaks should be reported'
    );
  });
});

describe('debugger runtime-root example regression', () => {
  test('gsd-debugger stale-hook example is runtime-neutral in source', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'agents', 'gsd-debugger.md'), 'utf8');
    assert.ok(content.includes('configDir = <runtime config root>'), 'source example should use a runtime-neutral config root placeholder');
    assert.ok(content.includes('targetDir = <managed install root>'), 'source example should use a managed install placeholder');
    assert.ok(!content.includes('→ checks ~/.claude/hooks/'), 'source example should not mention Claude hook root directly');
    assert.ok(!content.includes('→ writes to ~/.claude/get-shit-done/hooks/'), 'source example should not mention Claude install root directly');
  });
});

describe('installCodexConfig (integration)', () => {
  let tmpTarget;
  const agentsSrc = path.join(__dirname, '..', 'agents');

  beforeEach(() => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-codex-install-'));
  });

  afterEach(() => {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  });

  // Only run if agents/ directory exists (not in CI without full checkout)
  const hasAgents = fs.existsSync(agentsSrc);

  (hasAgents ? test : test.skip)('generates config.toml and agent .toml files', () => {
    const { installCodexConfig } = require('../bin/install.js');
    const count = installCodexConfig(tmpTarget, agentsSrc);

    assert.ok(count >= 11, `installed ${count} agents (expected >= 11)`);

    // Verify config.toml
    const configPath = path.join(tmpTarget, 'config.toml');
    assert.ok(fs.existsSync(configPath), 'config.toml exists');
    const config = fs.readFileSync(configPath, 'utf8');
    assert.ok(config.includes(GSD_CODEX_MARKER), 'has GSD marker');
    assert.ok(config.includes('[agents.gsd-executor]'), 'has executor agent');
    assert.ok(!config.includes('multi_agent'), 'no feature flags');

    // Verify per-agent .toml files
    const agentsDir = path.join(tmpTarget, 'agents');
    assert.ok(fs.existsSync(path.join(agentsDir, 'gsd-executor.toml')), 'executor .toml exists');
    assert.ok(fs.existsSync(path.join(agentsDir, 'gsd-plan-checker.toml')), 'plan-checker .toml exists');

    const executorToml = fs.readFileSync(path.join(agentsDir, 'gsd-executor.toml'), 'utf8');
    assert.ok(executorToml.includes('name = "gsd-executor"'), 'executor has name');
    assert.ok(executorToml.includes('description = "Executes GSD plans with atomic commits, deviation handling, checkpoint protocols, and state management. Spawned by execute-phase orchestrator or execute-plan command."'), 'executor has description');
    assert.ok(executorToml.includes('sandbox_mode = "workspace-write"'), 'executor is workspace-write');
    assert.ok(executorToml.includes('developer_instructions'), 'has developer_instructions');

    const checkerToml = fs.readFileSync(path.join(agentsDir, 'gsd-plan-checker.toml'), 'utf8');
    assert.ok(checkerToml.includes('name = "gsd-plan-checker"'), 'plan-checker has name');
    assert.ok(checkerToml.includes('sandbox_mode = "read-only"'), 'plan-checker is read-only');
  });

  (hasAgents ? test : test.skip)('uses converted instruction fallback text in generated agent TOMLs', () => {
    const { installCodexConfig } = require('../bin/install.js');
    installCodexConfig(tmpTarget, agentsSrc);

    const agentsDir = path.join(tmpTarget, 'agents');
    const affectedAgents = [
      'gsd-executor',
      'gsd-plan-checker',
      'gsd-verifier',
      'gsd-code-reviewer',
    ];

    for (const agentName of affectedAgents) {
      const toml = fs.readFileSync(path.join(agentsDir, `${agentName}.toml`), 'utf8');
      assert.ok(toml.includes('Prefer `./AGENTS.md` in the working directory.'), `${agentName} uses AGENTS.md as canonical instruction file`);
      assert.ok(toml.includes('read `./CLAUDE.md` for compatibility with older repos'), `${agentName} keeps CLAUDE.md fallback`);
      assert.ok(!toml.includes('Read `./CLAUDE.md` if it exists in the working directory.'), `${agentName} does not keep stale CLAUDE-only instruction text`);
      assert.ok(!toml.includes('Do NOT load full `AGENTS.md` files'), `${agentName} does not keep stale AGENTS blocking text`);
    }
  });

  (hasAgents ? test : test.skip)('markdown conversion and generated TOML stay aligned on instruction fallback wording', () => {
    const { installCodexConfig } = require('../bin/install.js');
    installCodexConfig(tmpTarget, agentsSrc);

    const sourceAgent = fs.readFileSync(path.join(agentsSrc, 'gsd-executor.md'), 'utf8');
    const convertedAgent = convertClaudeAgentToCodexAgent(sourceAgent);
    const executorToml = fs.readFileSync(path.join(tmpTarget, 'agents', 'gsd-executor.toml'), 'utf8');

    assert.ok(convertedAgent.includes('Prefer `./AGENTS.md` in the working directory.'), 'converted markdown has AGENTS canonical lookup');
    assert.ok(convertedAgent.includes('read `./CLAUDE.md` for compatibility with older repos'), 'converted markdown has CLAUDE fallback');
    assert.ok(executorToml.includes('Prefer `./AGENTS.md` in the working directory.'), 'generated TOML has AGENTS canonical lookup');
    assert.ok(executorToml.includes('read `./CLAUDE.md` for compatibility with older repos'), 'generated TOML has CLAUDE fallback');
  });

  (hasAgents ? test : test.skip)('generated Codex debugger agent is free of Claude runtime-root paths', () => {
    const { installCodexConfig } = require('../bin/install.js');
    installCodexConfig(tmpTarget, agentsSrc);

    const debuggerToml = fs.readFileSync(path.join(tmpTarget, 'agents', 'gsd-debugger.toml'), 'utf8');
    assert.strictEqual(countClaudeRuntimeRootLeaks(debuggerToml), 0, 'debugger.toml should not contain Claude runtime-root leaks');
    assert.ok(!debuggerToml.includes('~/.claude/get-shit-done'), 'no Claude install root remains');
    assert.ok(!debuggerToml.includes('~/.claude/hooks'), 'no Claude hook root remains');
  });
});

// ─── Codex config.toml [features] safety (#1202) ─────────────────────────────

describe('codex features section safety', () => {
  test('non-boolean keys under [features] are moved to top level', () => {
    // Simulate the bug from #1202: model = "gpt-5.4" under [features]
    // causes "invalid type: string, expected a boolean in features"
    const configContent = `[features]\ncodex_hooks = true\n\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "medium"\n\n[agents.gsd-executor]\ndescription = "test"\n`;

    const featuresMatch = configContent.match(/\[features\]\n([\s\S]*?)(?=\n\[|$)/);
    assert.ok(featuresMatch, 'features section found');

    const featuresBody = featuresMatch[1];
    const nonBooleanKeys = featuresBody.split('\n')
      .filter(line => line.match(/^\s*\w+\s*=/) && !line.match(/=\s*(true|false)\s*(#.*)?$/))
      .map(line => line.trim());

    assert.strictEqual(nonBooleanKeys.length, 2, 'should detect 2 non-boolean keys');
    assert.ok(nonBooleanKeys.includes('model = "gpt-5.4"'), 'detects model key');
    assert.ok(nonBooleanKeys.includes('model_reasoning_effort = "medium"'), 'detects model_reasoning_effort key');
  });

  test('boolean keys under [features] are NOT flagged', () => {
    const configContent = `[features]\ncodex_hooks = true\nmulti_agent = false\n`;

    const featuresMatch = configContent.match(/\[features\]\n([\s\S]*?)(?=\n\[|$)/);
    const featuresBody = featuresMatch[1];
    const nonBooleanKeys = featuresBody.split('\n')
      .filter(line => line.match(/^\s*\w+\s*=/) && !line.match(/=\s*(true|false)\s*(#.*)?$/))
      .map(line => line.trim());

    assert.strictEqual(nonBooleanKeys.length, 0, 'no non-boolean keys in a clean config');
  });
});

describe('Codex install config repair (e2e)', () => {
  let tmpDir;
  let codexHome;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-codex-e2e-'));
    codexHome = path.join(tmpDir, 'codex-home');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function assertNoManagedCodexHooks(content) {
    assert.ok(!content.includes('# GSD Hooks'), 'does not keep the GSD hooks marker');
    assert.ok(!content.includes('gsd-check-update.js'), 'does not register the legacy GSD Codex hook');
    assert.ok(!/^codex_hooks = true(?:\s*#.*)?$/m.test(content), 'does not add a root codex_hooks key');
    assert.ok(!/^features\.codex_hooks = true(?:\s*#.*)?$/m.test(content), 'does not add a dotted codex_hooks key');
    assert.ok(!content.includes('# GSD codex_hooks ownership:'), 'does not keep legacy GSD ownership metadata');
  }

  test('fresh CODEX_HOME installs agents only and leaves hooks/features untouched', () => {
    runCodexInstall(codexHome);

    const content = readCodexConfig(codexHome);
    const agentsDir = path.join(codexHome, 'agents').replace(/\\/g, '/');
    const configFileLines = content.split('\n').filter(line => line.startsWith('config_file = '));

    assert.ok(content.includes(GSD_CODEX_MARKER), 'writes the managed GSD agent block');
    assert.ok(content.includes('[agents.gsd-executor]'), 'writes managed agent sections');
    assert.ok(configFileLines.length > 0, 'has config_file entries');
    for (const line of configFileLines) {
      assert.ok(line.includes(agentsDir), `absolute path in: ${line}`);
    }
    assert.ok(!content.includes('config_file = "agents/'), 'does not use relative config_file paths');
    assertNoManagedCodexHooks(content);
    assertNoDraftRootKeys(content);
  });

  test('reinstall strips the legacy GSD hook block and inferred codex_hooks feature while preserving later sections', () => {
    writeCodexConfig(codexHome, [
      'model = "gpt-5.4"',
      '',
      '[features]',
      'codex_hooks = true',
      '',
      '# GSD Agent Configuration — managed by get-shit-done installer',
      '[agents.gsd-executor]',
      'description = "old"',
      'config_file = "/tmp/old-executor.toml"',
      '',
      '# GSD Hooks',
      '[[hooks]]',
      'event = "SessionStart"',
      'command = "node /old/path/gsd-check-update.js"',
      '',
      '[marketplaces.openai-bundled]',
      'last_updated = "2026-04-24T00:24:16Z"',
      'source_type = "local"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const content = readCodexConfig(codexHome);
    assert.ok(content.includes('model = "gpt-5.4"'), 'preserves user top-level config');
    assert.ok(content.includes('[marketplaces.openai-bundled]'), 'preserves later non-GSD sections');
    assertNoManagedCodexHooks(content);
    assert.ok(content.includes('[agents.gsd-executor]'), 'rewrites the managed GSD agent section');
  });

  test('reinstall strips the legacy GSD [hooks] map form that triggers the app error', () => {
    writeCodexConfig(codexHome, [
      'model = "gpt-5.4"',
      '',
      '# GSD Hooks',
      '[hooks]',
      'event = "SessionStart"',
      'command = "node /old/path/gsd-check-update.js"',
      '',
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const content = readCodexConfig(codexHome);
    assert.ok(!content.includes('\n[hooks]\n'), 'removes the legacy hooks map section');
    assert.ok(content.includes('[projects."/tmp/example"]'), 'preserves unrelated config after the hooks block');
    assertNoManagedCodexHooks(content);
  });

  test('reinstall preserves user-authored non-GSD hooks', () => {
    writeCodexConfig(codexHome, [
      'model = "o3"',
      '',
      '[[hooks]]',
      'event = "AfterCommand"',
      'command = "echo custom-after-command"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const content = readCodexConfig(codexHome);
    assert.ok(content.includes('command = "echo custom-after-command"'), 'preserves the user hook');
    assert.strictEqual(countMatches(content, /echo custom-after-command/g), 1, 'does not duplicate the user hook');
    assertNoManagedCodexHooks(content);
  });

  test('reinstall removes ambiguous codex_hooks values when GSD manages the Codex install', () => {
    writeCodexConfig(codexHome, [
      '[features]',
      'codex_hooks = true',
      'other_feature = true',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const content = readCodexConfig(codexHome);
    assert.ok(!content.includes('codex_hooks = true'), 'removes the ambiguous legacy codex_hooks value');
    assert.ok(content.includes('other_feature = true'), 'preserves neighboring feature keys');
    assert.ok(!content.includes('# GSD Hooks'), 'does not add the managed GSD hook block');
    assert.ok(!content.includes('gsd-check-update.js'), 'does not add the managed GSD update hook');
  });

  test('fresh CODEX_HOME installs with no managed Claude runtime-root leak warnings', () => {
    runCodexInstall(codexHome);

    const leaks = scanCodexManagedClaudeRuntimeLeaks(codexHome);
    assert.deepStrictEqual(leaks, [], 'managed Codex install output should not retain Claude runtime-root leaks');
  });

  test('installed Codex workflows warn when no root instruction file exists and avoid hardcoded instruction reads', () => {
    runCodexInstall(codexHome);

    const planWorkflow = fs.readFileSync(path.join(codexHome, 'get-shit-done', 'workflows', 'plan-phase.md'), 'utf8');
    const executeWorkflow = fs.readFileSync(path.join(codexHome, 'get-shit-done', 'workflows', 'execute-phase.md'), 'utf8');

    assert.ok(planWorkflow.includes('PROJECT_INSTRUCTION_FILE="./AGENTS.md"'), 'plan-phase resolves AGENTS.md first');
    assert.ok(planWorkflow.includes('PROJECT_INSTRUCTION_FILE="./CLAUDE.md"'), 'plan-phase falls back to CLAUDE.md');
    assert.ok(planWorkflow.includes('No root project instruction file found (expected AGENTS.md or CLAUDE.md).'), 'plan-phase warns when no root instruction file exists');
    assert.ok(planWorkflow.includes('Prefer the root project instruction file resolved during preflight'), 'plan-phase passes generic instruction lookup guidance to subagents');

    assert.ok(executeWorkflow.includes('PROJECT_INSTRUCTION_FILE="./AGENTS.md"'), 'execute-phase resolves AGENTS.md first');
    assert.ok(executeWorkflow.includes('PROJECT_INSTRUCTION_FILE="./CLAUDE.md"'), 'execute-phase falls back to CLAUDE.md');
    assert.ok(executeWorkflow.includes('No root project instruction file found (expected AGENTS.md or CLAUDE.md).'), 'execute-phase warns when no root instruction file exists');
    assert.ok(executeWorkflow.includes('Prefer the root project instruction file resolved during preflight'), 'execute-phase passes generic instruction lookup guidance to executors');
    assert.ok(!executeWorkflow.includes('- ./AGENTS.md (Project instructions, if exists'), 'execute-phase does not hardcode a possibly-missing instruction file into files_to_read');
  });
});

describe('Codex uninstall symmetry for migrated hook configs', () => {
  let tmpDir;
  let codexHome;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-codex-uninstall-'));
    codexHome = path.join(tmpDir, 'codex-home');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('fresh install strips back to nothing on uninstall cleanup', () => {
    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.strictEqual(cleaned, null, 'fresh GSD-only config strips back to nothing');
  });

  test('uninstall cleanup preserves user config after legacy GSD hook repair', () => {
    writeCodexConfig(codexHome, [
      'model = "gpt-5.4"',
      '',
      '[features]',
      'codex_hooks = true',
      '',
      '# GSD Agent Configuration — managed by get-shit-done installer',
      '[agents.gsd-executor]',
      'description = "old"',
      'config_file = "/tmp/old-executor.toml"',
      '',
      '# GSD Hooks',
      '[[hooks]]',
      'event = "SessionStart"',
      'command = "node /old/path/gsd-check-update.js"',
      '',
      '[marketplaces.openai-bundled]',
      'last_updated = "2026-04-24T00:24:16Z"',
      'source_type = "local"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(cleaned.includes('model = "gpt-5.4"'), 'preserves user top-level config');
    assert.ok(cleaned.includes('[marketplaces.openai-bundled]'), 'preserves later unrelated sections');
    assert.ok(!cleaned.includes(GSD_CODEX_MARKER), 'removes the GSD agent marker');
  });

  test('uninstall cleanup preserves user-authored hooks while removing ambiguous codex_hooks', () => {
    writeCodexConfig(codexHome, [
      '[features]',
      'codex_hooks = true',
      'other_feature = true',
      '',
      '[[hooks]]',
      'event = "AfterCommand"',
      'command = "echo custom-after-command"',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(!cleaned.includes('codex_hooks = true'), 'removes the ambiguous codex_hooks value');
    assert.ok(cleaned.includes('other_feature = true'), 'keeps other user-authored feature settings');
    assert.ok(cleaned.includes('command = "echo custom-after-command"'), 'keeps user-authored hooks');
    assert.strictEqual(countMatches(cleaned, /gsd-check-update\.js/g), 0, 'contains no legacy GSD hook entries');
    assert.strictEqual(countMatches(cleaned, /\[agents\.gsd-/g), 0, 'removes managed GSD agent sections');
  });

  test('uninstall cleanup strips the legacy [hooks] map fixture', () => {
    const cleaned = stripGsdFromCodexConfig([
      'model = "gpt-5.4"',
      '',
      '# GSD Hooks',
      '[hooks]',
      'event = "SessionStart"',
      'command = "node /old/path/gsd-check-update.js"',
      '',
      '# GSD Agent Configuration — managed by get-shit-done installer',
      '[agents.gsd-executor]',
      'description = "old"',
      'config_file = "/tmp/old-executor.toml"',
      '',
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      '',
    ].join('\n'));

    assert.ok(cleaned.includes('[projects."/tmp/example"]'), 'preserves unrelated config');
    assert.ok(!cleaned.includes('\n[hooks]\n'), 'removes the legacy hooks map section');
    assert.ok(!cleaned.includes(GSD_CODEX_MARKER), 'removes the managed GSD marker block');
  });

  test('install then uninstall removes dotted features.codex_hooks without creating a [features] table', () => {
    writeCodexConfig(codexHome, [
      'features.other_feature = true',
      '',
      '[[hooks]]',
      'event = "AfterCommand"',
      'command = "echo custom-after-command"',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(cleaned.includes('features.other_feature = true'), 'preserves other dotted feature keys');
    assert.strictEqual(countMatches(cleaned, /^features\.codex_hooks = true$/gm), 0, 'removes the dotted GSD codex_hooks key');
    assert.strictEqual(countMatches(cleaned, /^\[features\]\s*$/gm), 0, 'does not leave behind a [features] table');
    assert.strictEqual(countMatches(cleaned, /echo custom-after-command/g), 1, 'preserves non-GSD hooks');
    assert.strictEqual(countMatches(cleaned, /gsd-check-update\.js/g), 0, 'removes the GSD update hook');
  });

  test('install then uninstall removes a pre-existing [features].codex_hooks = true', () => {
    writeCodexConfig(codexHome, [
      '[features]',
      'codex_hooks = true',
      'other_feature = true',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(!cleaned.includes('codex_hooks = true'), 'removes the ambiguous codex_hooks assignment');
    assert.ok(cleaned.includes('other_feature = true'), 'preserves other feature keys');
    assert.strictEqual(countMatches(cleaned, /gsd-check-update\.js/g), 0, 'removes the GSD update hook');
    assert.strictEqual(countMatches(cleaned, /\[agents\.gsd-/g), 0, 'removes managed GSD agent sections');
  });

  test('install then uninstall removes a pre-existing quoted [features].\"codex_hooks\" = true', () => {
    writeCodexConfig(codexHome, [
      '[features]',
      '"codex_hooks" = true',
      'other_feature = true',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(!cleaned.includes('"codex_hooks" = true'), 'removes the ambiguous quoted codex_hooks assignment');
    assert.ok(cleaned.includes('other_feature = true'), 'preserves other feature keys');
    assert.strictEqual(countMatches(cleaned, /gsd-check-update\.js/g), 0, 'removes the GSD update hook');
    assert.strictEqual(countMatches(cleaned, /\[agents\.gsd-/g), 0, 'removes managed GSD agent sections');
  });

  test('install then uninstall removes a pre-existing root dotted features.codex_hooks = true', () => {
    writeCodexConfig(codexHome, [
      'features.codex_hooks = true',
      'features.other_feature = true',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\n'));

    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(!cleaned.includes('features.codex_hooks = true'), 'removes the ambiguous dotted codex_hooks assignment');
    assert.ok(cleaned.includes('features.other_feature = true'), 'preserves other dotted feature keys');
    assert.strictEqual(countMatches(cleaned, /gsd-check-update\.js/g), 0, 'removes the GSD update hook');
    assert.strictEqual(countMatches(cleaned, /\[agents\.gsd-/g), 0, 'removes managed GSD agent sections');
  });

  test('install then uninstall leaves short-circuited root features assignments untouched', () => {
    const cases = [
      'features = { other_feature = true }\n\n[model]\nname = "o3"\n',
      'features = "disabled"\n\n[model]\nname = "o3"\n',
    ];

    for (const initialContent of cases) {
      writeCodexConfig(codexHome, initialContent);
      runCodexInstall(codexHome);

      const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
      assert.strictEqual(cleaned, initialContent, `preserves short-circuited root features assignment: ${initialContent.split('\n')[0]}`);

      fs.rmSync(codexHome, { recursive: true, force: true });
      fs.mkdirSync(codexHome, { recursive: true });
    }
  });

  test('install then uninstall keeps mixed-EOL user content stable while removing GSD hook state', () => {
    const initialContent = [
      '# first line wins',
      '[features]',
      'other_feature = true',
      '',
      '[model]',
      'name = "o3"',
      '',
    ].join('\r\n').replace(/^# first line wins\r\n/, '# first line wins\n');

    writeCodexConfig(codexHome, initialContent);
    runCodexInstall(codexHome);

    const cleaned = stripGsdFromCodexConfig(readCodexConfig(codexHome));
    assert.ok(cleaned.includes('# first line wins\n[features]\r\nother_feature = true\r\n\r\n[model]\r\nname = "o3"'), 'preserves the original mixed-EOL user content');
    assert.strictEqual(countMatches(cleaned, /^codex_hooks = true$/gm), 0, 'removes the injected codex_hooks key');
    assert.strictEqual(countMatches(cleaned, /gsd-check-update\.js/g), 0, 'removes the GSD update hook');
    assert.strictEqual(countMatches(cleaned, /\[agents\.gsd-/g), 0, 'removes managed GSD agent sections');
  });
});

describe('Codex install version surfaces', () => {
  let tmpRoot;
  let codexHome;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-codex-version-'));
    codexHome = path.join(tmpRoot, '.codex');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('install writes gsd-version skill and release metadata', () => {
    runCodexInstall(codexHome);

    const skillPath = path.join(codexHome, 'skills', 'gsd-version', 'SKILL.md');
    const releasePath = path.join(codexHome, 'get-shit-done', 'RELEASE.json');

    assert.ok(fs.existsSync(skillPath), 'Codex install should include gsd-version skill');
    assert.ok(fs.existsSync(releasePath), 'Codex install should include RELEASE.json');

    const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
    const expectedHead = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: 'pipe' }).trim();
    const expectedCommitDate = new Date(
      execSync('git show -s --format=%cI HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: 'pipe' }).trim()
    ).toISOString();

    assert.strictEqual(release.gitHead, expectedHead, 'Codex install should stamp the current repo HEAD');
    assert.strictEqual(release.commitDate, expectedCommitDate, 'Codex install should stamp the current repo commit date');
  });
});

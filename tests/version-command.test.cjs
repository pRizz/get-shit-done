'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('version command', () => {
  test('command file exists with correct frontmatter', () => {
    const commandPath = path.join(__dirname, '..', 'commands', 'gsd', 'version.md');
    assert.ok(fs.existsSync(commandPath), 'commands/gsd/version.md should exist');

    const content = fs.readFileSync(commandPath, 'utf8');

    assert.ok(content.includes('name: gsd:version'), 'command must have name: gsd:version');
    assert.ok(content.includes('description: Show installed GSD version, commit, and commit date'), 'command must describe version metadata');
    assert.ok(content.includes('- Read'), 'command should allow Read');
    assert.ok(content.includes('- Bash'), 'command should allow Bash');
    assert.ok(content.includes('workflows/version.md'), 'command should reference the version workflow');
  });

  test('workflow exists and documents local metadata lookup', () => {
    const workflowPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'version.md');
    assert.ok(fs.existsSync(workflowPath), 'get-shit-done/workflows/version.md should exist');

    const content = fs.readFileSync(workflowPath, 'utf8');

    assert.ok(content.includes('RELEASE.json'), 'workflow should read RELEASE.json');
    assert.ok(content.includes('PREFERRED_CONFIG_DIR'), 'workflow should derive preferred config dir like gsd-update');
    assert.ok(content.includes('Install Scope:'), 'workflow should output install scope');
    assert.ok(content.includes('Commit Date:'), 'workflow should output commit date');
    assert.ok(content.includes('Commit metadata unavailable'), 'workflow should document the fallback note');
  });
});

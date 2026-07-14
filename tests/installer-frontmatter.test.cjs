const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.GSD_TEST_MODE = '1';

const {
  extractFrontmatterAndBody,
  convertClaudeToGeminiAgent,
} = require('../bin/install.js');

describe('installer frontmatter splitting', () => {
  test('supports BOM/CRLF and selects only contiguous duplicate top headers', () => {
    const content = '\uFEFF---\r\nname: stale\r\n---\r\n---\r\nname: current\r\n---\r\nbody';
    const result = extractFrontmatterAndBody(content);

    assert.strictEqual(result.frontmatter, 'name: current');
    assert.strictEqual(result.body, '\r\nbody');
  });

  test('does not treat body thematic breaks or fenced YAML as headers', () => {
    const content = '---\ndescription: real\n---\n\n---\n\n```yaml\n---\ndescription: example\n---\n```';
    const result = extractFrontmatterAndBody(content);

    assert.strictEqual(result.frontmatter, 'description: real');
    assert.strictEqual(result.body, '\n\n---\n\n```yaml\n---\ndescription: example\n---\n```');
  });

  test('runtime converters use the anchored header and preserve body rules', () => {
    const content = '---\nname: worker\ntools: Read\n---\n\n---\n\nBody';
    const result = convertClaudeToGeminiAgent(content);

    assert.ok(result.includes('name: worker'));
    assert.ok(result.includes('\n---\n\n---\n\nBody'));
  });
});

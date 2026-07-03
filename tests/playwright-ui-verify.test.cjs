const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Playwright-MCP UI verification integration', () => {
  test('verify-work.md mentions automated UI verification', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'get-shit-done', 'workflows', 'verify-work.md'), 'utf-8'
    );
    assert.ok(
      content.toLowerCase().includes('playwright') || content.includes('automated') && content.includes('UI'),
      'verify-work.md should mention automated UI verification option'
    );
  });

  test('ui-review.md mentions Playwright-MCP when available', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'get-shit-done', 'workflows', 'ui-review.md'), 'utf-8'
    );
    assert.ok(
      content.toLowerCase().includes('playwright') || content.includes('mcp__playwright'),
      'ui-review.md should reference Playwright-MCP'
    );
  });

  test('gsd-ui-auditor.md includes automated screenshot guidance', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'agents', 'gsd-ui-auditor.md'), 'utf-8'
    );
    assert.ok(
      content.toLowerCase().includes('playwright') || content.includes('screenshot') || content.includes('automated'),
      'gsd-ui-auditor.md should mention automated screenshot verification'
    );
  });

  test('automated verification is optional/conditional (falls back to manual)', () => {
    const verifyContent = fs.readFileSync(
      path.join(__dirname, '..', 'get-shit-done', 'workflows', 'verify-work.md'), 'utf-8'
    );
    // Must include a fallback / "if available" conditional
    const hasConditional =
      verifyContent.includes('if available') ||
      verifyContent.includes('when available') ||
      verifyContent.includes('if Playwright') ||
      verifyContent.includes('fall back');
    assert.ok(hasConditional, 'Playwright integration must be conditional with manual fallback');
  });

  test('verify-work supports conditional agent-performed simple UAT with manual fallback', () => {
    const verifyContent = fs.readFileSync(
      path.join(__dirname, '..', 'get-shit-done', 'workflows', 'verify-work.md'), 'utf-8'
    );
    assert.ok(
      verifyContent.includes('agent_performed_simple_uat'),
      'verify-work.md should define agent-performed simple UAT rules'
    );
    assert.ok(
      verifyContent.includes('verified_by: agent') && verifyContent.includes('evidence:'),
      'agent-passed UAT should require verification metadata'
    );
    assert.ok(
      verifyContent.includes('fall back to `present_test` unchanged') ||
        verifyContent.includes('continue with the manual checkpoint presentation'),
      'agent UAT must fall back to manual checkpoint presentation'
    );
    assert.ok(
      verifyContent.includes('Do NOT auto-pass checkpoints that require human judgment') &&
        verifyContent.includes('destructive or unsafe action'),
      'agent UAT must exclude human-only and unsafe checkpoints'
    );
  });
});

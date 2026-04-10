/**
 * Tests for the stale-hook semver comparison used in gsd-check-update.js.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
process.env.GSD_TEST_MODE = '1';
const { isNewer } = require('../hooks/gsd-check-update.js');

describe('isNewer (semver comparison)', () => {
  test('newer major version', () => {
    assert.strictEqual(isNewer('2.0.0', '1.0.0'), true);
  });

  test('newer minor version', () => {
    assert.strictEqual(isNewer('1.1.0', '1.0.0'), true);
  });

  test('newer patch version', () => {
    assert.strictEqual(isNewer('1.0.1', '1.0.0'), true);
  });

  test('equal versions', () => {
    assert.strictEqual(isNewer('1.0.0', '1.0.0'), false);
  });

  test('older version returns false', () => {
    assert.strictEqual(isNewer('1.0.0', '2.0.0'), false);
  });

  test('installed ahead of npm (git install scenario)', () => {
    assert.strictEqual(isNewer('1.30.0', '1.31.0'), false);
  });

  test('npm ahead of installed (real update available)', () => {
    assert.strictEqual(isNewer('1.31.0', '1.30.0'), true);
  });

  test('pre-release suffix stripped', () => {
    assert.strictEqual(isNewer('1.0.1-beta.1', '1.0.0'), true);
  });

  test('pre-release on both sides', () => {
    assert.strictEqual(isNewer('2.0.0-rc.1', '1.9.0-beta.2'), true);
  });

  test('null/undefined handled', () => {
    assert.strictEqual(isNewer(null, '1.0.0'), false);
    assert.strictEqual(isNewer('1.0.0', null), true);
    assert.strictEqual(isNewer(null, null), false);
  });

  test('empty string handled', () => {
    assert.strictEqual(isNewer('', '1.0.0'), false);
    assert.strictEqual(isNewer('1.0.0', ''), true);
  });

  test('two-segment version (missing patch)', () => {
    assert.strictEqual(isNewer('1.1', '1.0'), true);
    assert.strictEqual(isNewer('1.0', '1.1'), false);
  });
});

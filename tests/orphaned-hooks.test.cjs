/**
 * Regression test for #1750: orphaned hook files from removed features
 * (e.g., gsd-intel-*.js) should NOT be flagged as stale by gsd-check-update.js.
 *
 * The stale hooks scanner should only check hooks that are part of the current
 * distribution, not every gsd-*.js file in the hooks directory.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CHECK_UPDATE_PATH = path.join(__dirname, '..', 'hooks', 'gsd-check-update.js');
const BUILD_HOOKS_PATH = path.join(__dirname, '..', 'scripts', 'build-hooks.js');
const { MANAGED_HOOKS, collectStaleHooks } = require('../hooks/gsd-check-update.js');

describe('orphaned hooks stale detection (#1750)', () => {
  test('stale hook scanner uses an allowlist of managed hooks, not a wildcard', () => {
    const content = fs.readFileSync(CHECK_UPDATE_PATH, 'utf8');

    // The scanner MUST NOT use a broad `startsWith('gsd-')` filter that catches
    // orphaned files from removed features (gsd-intel-index.js, gsd-intel-prune.js, etc.)
    // Instead, it should reference a known set of managed hook filenames.

    assert.ok(content.includes('const MANAGED_HOOKS = ['), 'should define a managed hooks allowlist');

    // The hook scanner must NOT have a broad gsd-*.js wildcard filter
    const hasBroadFilter = /readdirSync\([^)]+\)\.filter\([^)]*startsWith\('gsd-'\)\s*&&[^)]*endsWith\('\.js'\)/s.test(content);
    assert.ok(!hasBroadFilter,
      'scanner must NOT use broad startsWith("gsd-") && endsWith(".js") filter — ' +
      'this catches orphaned hooks from removed features (e.g., gsd-intel-index.js). ' +
      'Use a MANAGED_HOOKS allowlist instead.');
  });

  test('managed hooks list in check-update matches build-hooks HOOKS_TO_COPY entries', () => {
    // Extract hooks from build-hooks.js HOOKS_TO_COPY
    const buildContent = fs.readFileSync(BUILD_HOOKS_PATH, 'utf8');
    const hooksArrayMatch = buildContent.match(/HOOKS_TO_COPY\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(hooksArrayMatch, 'should find HOOKS_TO_COPY array');

    const managedHooks = [];
    const hookEntries = hooksArrayMatch[1].matchAll(/'([^']+\.(?:js|sh))'/g);
    for (const m of hookEntries) {
      managedHooks.push(m[1]);
    }
    assert.ok(managedHooks.length >= 8, `expected managed hooks in HOOKS_TO_COPY, got ${managedHooks.length}`);

    // Verify each hook from HOOKS_TO_COPY is referenced in the managed list
    for (const hook of managedHooks) {
      assert.ok(
        MANAGED_HOOKS.includes(hook),
        `managed hooks in check-update should include '${hook}' from HOOKS_TO_COPY`
      );
    }
  });

  test('orphaned hook filenames would NOT match the managed hooks list', () => {
    // These are real orphaned hooks from the removed intel feature
    const orphanedHooks = [
      'gsd-intel-index.js',
      'gsd-intel-prune.js',
      'gsd-intel-session.js',
    ];

    for (const orphan of orphanedHooks) {
      assert.ok(
        !MANAGED_HOOKS.includes(orphan),
        `orphaned hook '${orphan}' must NOT be in the managed hooks list`
      );
    }
  });

  test('stale scanner tracks shell hook version headers', (t) => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-stale-hooks-'));
    t.after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });
    const hooksDir = path.join(tmpDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    fs.writeFileSync(path.join(hooksDir, 'gsd-validate-commit.sh'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(hooksDir, 'gsd-phase-boundary.sh'), '# gsd-hook-version: 1.0.0\n', 'utf8');
    fs.writeFileSync(path.join(hooksDir, 'gsd-session-state.sh'), '# gsd-hook-version: 1.34.2\n', 'utf8');

    const staleHooks = collectStaleHooks(tmpDir, '1.34.2');
    const staleFiles = staleHooks.map(h => h.file);

    assert.ok(staleFiles.includes('gsd-validate-commit.sh'), 'shell hook without version header should be stale');
    assert.ok(staleFiles.includes('gsd-phase-boundary.sh'), 'older shell hook should be stale');
    assert.ok(!staleFiles.includes('gsd-session-state.sh'), 'current shell hook should not be stale');
  });
});

#!/usr/bin/env node
// gsd-hook-version: {{GSD_VERSION}}
// Check for GSD updates in background, write result to cache.
// Called by SessionStart hook - spawns a detached background check once per session.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

const SOURCE_REPO = 'https://github.com/pRizz/get-shit-done.git';
const SOURCE_REPO_WEB = 'https://github.com/pRizz/get-shit-done';
const SOURCE_REPO_API = 'https://api.github.com/repos/pRizz/get-shit-done';
const DEFAULT_TARGET_REF = 'main';
const MANAGED_HOOKS = [
  'gsd-check-update.js',
  'gsd-context-monitor.js',
  'gsd-prompt-guard.js',
  'gsd-read-guard.js',
  'gsd-statusline.js',
  'gsd-workflow-guard.js',
];

const homeDir = os.homedir();
const cwd = process.cwd();

// Detect runtime config directory (supports Claude, Codex, OpenCode, Kilo, Gemini).
function detectConfigDir(baseDir) {
  const envCandidates = [
    process.env.CLAUDE_CONFIG_DIR,
    process.env.GEMINI_CONFIG_DIR,
    process.env.KILO_CONFIG_DIR,
    process.env.OPENCODE_CONFIG_DIR,
    process.env.CODEX_HOME,
  ].filter(Boolean);

  if (process.env.KILO_CONFIG) {
    envCandidates.push(path.dirname(process.env.KILO_CONFIG));
  }
  if (process.env.OPENCODE_CONFIG) {
    envCandidates.push(path.dirname(process.env.OPENCODE_CONFIG));
  }

  for (const envDir of envCandidates) {
    if (
      fs.existsSync(path.join(envDir, 'get-shit-done', 'VERSION')) ||
      fs.existsSync(path.join(envDir, 'get-shit-done', 'RELEASE.json')) ||
      fs.existsSync(path.join(envDir, 'get-shit-done', 'workflows', 'update.md'))
    ) {
      return envDir;
    }
  }

  for (const dir of ['.claude', '.gemini', '.config/kilo', '.kilo', '.config/opencode', '.opencode', '.codex']) {
    if (
      fs.existsSync(path.join(baseDir, dir, 'get-shit-done', 'VERSION')) ||
      fs.existsSync(path.join(baseDir, dir, 'get-shit-done', 'RELEASE.json')) ||
      fs.existsSync(path.join(baseDir, dir, 'get-shit-done', 'workflows', 'update.md'))
    ) {
      return path.join(baseDir, dir);
    }
  }

  return process.env.CLAUDE_CONFIG_DIR || process.env.CODEX_HOME || path.join(baseDir, '.claude');
}

// Compare semver: true if a > b (a is strictly newer than b).
// Used for stale hook detection against the installed VERSION file.
function isNewer(a, b) {
  const pa = (a || '').split('.').map((s) => Number(s.replace(/-.*/, '')) || 0);
  const pb = (b || '').split('.').map((s) => Number(s.replace(/-.*/, '')) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

function readReleaseMetadata(releaseFile, fallbackVersion = '0.0.0') {
  try {
    const parsed = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
    return {
      version: typeof parsed.version === 'string' && parsed.version.trim()
        ? parsed.version.trim()
        : fallbackVersion,
      gitHead: typeof parsed.gitHead === 'string' && parsed.gitHead.trim()
        ? parsed.gitHead.trim()
        : null,
      commitDate: typeof parsed.commitDate === 'string' && parsed.commitDate.trim()
        ? parsed.commitDate.trim()
        : null,
    };
  } catch {
    return {
      version: fallbackVersion,
      gitHead: null,
      commitDate: null,
    };
  }
}

function detectInstalledMetadata(projectConfigDir, globalConfigDir) {
  const candidates = [
    { configDir: projectConfigDir, scope: 'LOCAL' },
    { configDir: globalConfigDir, scope: 'GLOBAL' },
  ];

  for (const candidate of candidates) {
    if (!candidate.configDir) continue;

    const versionFile = path.join(candidate.configDir, 'get-shit-done', 'VERSION');
    const releaseFile = path.join(candidate.configDir, 'get-shit-done', 'RELEASE.json');
    const markerFile = path.join(candidate.configDir, 'get-shit-done', 'workflows', 'update.md');

    if (!fs.existsSync(versionFile) && !fs.existsSync(releaseFile) && !fs.existsSync(markerFile)) {
      continue;
    }

    let installed = '0.0.0';
    if (fs.existsSync(versionFile)) {
      try {
        installed = fs.readFileSync(versionFile, 'utf8').trim() || '0.0.0';
      } catch {}
    }

    const release = fs.existsSync(releaseFile)
      ? readReleaseMetadata(releaseFile, installed)
      : { version: installed, gitHead: null, commitDate: null };

    return {
      scope: candidate.scope,
      configDir: candidate.configDir,
      installedVersion: release.version || installed,
      gitHead: release.gitHead,
      commitDate: release.commitDate,
      needsMigration: !release.gitHead,
    };
  }

  return {
    scope: 'UNKNOWN',
    configDir: '',
    installedVersion: '0.0.0',
    gitHead: null,
    commitDate: null,
    needsMigration: false,
  };
}

function shouldOfferForkUpdate(installedGitHead, targetGitHead, needsMigration = false) {
  if (!targetGitHead) return false;
  if (needsMigration) return true;
  if (!installedGitHead) return true;
  return installedGitHead.trim() !== targetGitHead.trim();
}

function fetchTargetRelease(ref = DEFAULT_TARGET_REF) {
  return new Promise((resolve) => {
    const url = `${SOURCE_REPO_API}/commits/${encodeURIComponent(ref)}`;
    const request = https.get(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'gsd-check-update',
      },
      timeout: 10000,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(body);
          const gitHead = typeof parsed.sha === 'string' ? parsed.sha.trim() : null;
          const commitDate = parsed?.commit?.committer?.date || null;
          const htmlUrl = typeof parsed.html_url === 'string' ? parsed.html_url : null;

          if (!gitHead) {
            resolve(null);
            return;
          }

          resolve({
            gitHead,
            commitDate,
            htmlUrl,
          });
        } catch {
          resolve(null);
        }
      });
    });

    request.on('timeout', () => {
      request.destroy();
    });
    request.on('error', () => {
      resolve(null);
    });
  });
}

function collectStaleHooks(configDir, installedVersion) {
  const staleHooks = [];

  if (!configDir) {
    return staleHooks;
  }

  const hooksDir = path.join(configDir, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    return staleHooks;
  }

  try {
    const hookFiles = fs.readdirSync(hooksDir).filter((file) => MANAGED_HOOKS.includes(file));
    for (const hookFile of hookFiles) {
      try {
        const content = fs.readFileSync(path.join(hooksDir, hookFile), 'utf8');
        const versionMatch = content.match(/\/\/ gsd-hook-version:\s*(.+)/);
        if (versionMatch) {
          const hookVersion = versionMatch[1].trim();
          if (isNewer(installedVersion, hookVersion) && !hookVersion.includes('{{')) {
            staleHooks.push({ file: hookFile, hookVersion, installedVersion });
          }
        } else {
          staleHooks.push({ file: hookFile, hookVersion: 'unknown', installedVersion });
        }
      } catch {}
    }
  } catch {}

  return staleHooks;
}

async function runBackgroundCheck() {
  const globalConfigDir = detectConfigDir(homeDir);
  const projectConfigDir = detectConfigDir(cwd);
  const cacheDir = path.join(homeDir, '.cache', 'gsd');
  const cacheFile = path.join(cacheDir, 'gsd-update-check.json');

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const installed = detectInstalledMetadata(projectConfigDir, globalConfigDir);
  const staleHooks = collectStaleHooks(installed.configDir, installed.installedVersion);
  const target = await fetchTargetRelease(DEFAULT_TARGET_REF);
  const needsMigration = Boolean(installed.needsMigration && target?.gitHead);

  const result = {
    update_available: shouldOfferForkUpdate(installed.gitHead, target?.gitHead, needsMigration),
    installed: installed.installedVersion,
    latest: target?.gitHead || 'unknown',
    checked: Math.floor(Date.now() / 1000),
    stale_hooks: staleHooks.length > 0 ? staleHooks : undefined,
    installed_git_head: installed.gitHead || 'unavailable',
    installed_commit_date: installed.commitDate || 'unavailable',
    target_git_head: target?.gitHead || 'unknown',
    target_commit_date: target?.commitDate || 'unknown',
    target_ref: DEFAULT_TARGET_REF,
    source_repo: SOURCE_REPO,
    target_commit_url: target?.htmlUrl || `${SOURCE_REPO_WEB}/tree/${DEFAULT_TARGET_REF}`,
    needs_migration: needsMigration || undefined,
  };

  fs.writeFileSync(cacheFile, JSON.stringify(result));
}

function spawnBackgroundCheck() {
  const child = spawn(process.execPath, [__filename, '--background-check'], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  });
  child.unref();
}

if (require.main === module) {
  if (process.argv.includes('--background-check')) {
    runBackgroundCheck().catch(() => {});
  } else {
    spawnBackgroundCheck();
  }
}

module.exports = {
  DEFAULT_TARGET_REF,
  MANAGED_HOOKS,
  SOURCE_REPO,
  SOURCE_REPO_API,
  detectConfigDir,
  isNewer,
  readReleaseMetadata,
  detectInstalledMetadata,
  shouldOfferForkUpdate,
  fetchTargetRelease,
  collectStaleHooks,
  runBackgroundCheck,
  spawnBackgroundCheck,
};

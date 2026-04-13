const fs = require('fs');
const path = require('path');
const { output, error, toPosixPath } = require('./core.cjs');

const CANONICAL_FILE = 'AGENTS.md';
const COMPAT_FILE = 'CLAUDE.md';
const VALID_FILES = new Set([CANONICAL_FILE, COMPAT_FILE]);

function normalizeAbs(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function samePath(a, b) {
  return normalizeAbs(a) === normalizeAbs(b);
}

function safeLstat(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function safeRealpath(filePath) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(filePath) : fs.realpathSync(filePath);
  } catch {
    return null;
  }
}

function relPathFromCwd(cwd, filePath) {
  const rel = path.relative(cwd, filePath);
  return toPosixPath(rel || path.basename(filePath));
}

function inspectInstructionFile(cwd, name, otherName) {
  const absPath = path.join(cwd, name);
  const otherAbsPath = path.join(cwd, otherName);
  const stat = safeLstat(absPath);

  const result = {
    name,
    path: name,
    absolute_path: absPath,
    exists: false,
    is_symlink: false,
    is_regular: false,
    is_directory: false,
    link_target: null,
    link_target_path: null,
    resolved_path: null,
    target_missing: false,
    points_to_other: false,
  };

  if (!stat) {
    return result;
  }

  result.exists = true;
  result.is_symlink = stat.isSymbolicLink();
  result.is_regular = stat.isFile();
  result.is_directory = stat.isDirectory();

  if (result.is_symlink) {
    const rawTarget = fs.readlinkSync(absPath);
    const targetAbsPath = path.resolve(path.dirname(absPath), rawTarget);
    result.link_target = toPosixPath(rawTarget);
    result.link_target_path = relPathFromCwd(cwd, targetAbsPath);
    result.points_to_other = samePath(targetAbsPath, otherAbsPath);

    const resolvedPath = safeRealpath(absPath);
    if (resolvedPath) {
      result.resolved_path = relPathFromCwd(cwd, resolvedPath);
    } else {
      result.target_missing = true;
    }
  } else {
    const resolvedPath = safeRealpath(absPath) || absPath;
    result.resolved_path = relPathFromCwd(cwd, resolvedPath);
  }

  return result;
}

function deriveInstructionFilesStatus(cwd) {
  const agents = inspectInstructionFile(cwd, CANONICAL_FILE, COMPAT_FILE);
  const claude = inspectInstructionFile(cwd, COMPAT_FILE, CANONICAL_FILE);

  let state = 'broken_or_unexpected_link';
  let healthy = false;
  let realFile = null;
  let linkFile = null;
  let message = 'Instruction files need manual review.';

  if (!agents.exists && !claude.exists) {
    state = 'none';
    message = 'Neither AGENTS.md nor CLAUDE.md exists.';
  } else if (agents.exists && !claude.exists) {
    if (!agents.is_symlink && !agents.is_directory) {
      state = 'agents_only';
      message = 'AGENTS.md exists and CLAUDE.md is missing.';
    } else {
      message = 'AGENTS.md exists in an unexpected symlink or directory state while CLAUDE.md is missing.';
    }
  } else if (!agents.exists && claude.exists) {
    if (!claude.is_symlink && !claude.is_directory) {
      state = 'claude_only';
      message = 'CLAUDE.md exists and AGENTS.md is missing.';
    } else {
      message = 'CLAUDE.md exists in an unexpected symlink or directory state while AGENTS.md is missing.';
    }
  } else if (agents.exists && claude.exists) {
    if (!agents.is_symlink && !claude.is_symlink && !agents.is_directory && !claude.is_directory) {
      state = 'dual_regular';
      message = 'AGENTS.md and CLAUDE.md both exist as regular files.';
    } else if (agents.is_symlink && !claude.is_symlink && agents.points_to_other && !agents.target_missing && !claude.is_directory) {
      state = 'linked_ok';
      healthy = true;
      realFile = COMPAT_FILE;
      linkFile = CANONICAL_FILE;
      message = 'AGENTS.md is a symlink to CLAUDE.md.';
    } else if (!agents.is_symlink && claude.is_symlink && claude.points_to_other && !claude.target_missing && !agents.is_directory) {
      state = 'linked_ok';
      healthy = true;
      realFile = CANONICAL_FILE;
      linkFile = COMPAT_FILE;
      message = 'CLAUDE.md is a symlink to AGENTS.md.';
    } else {
      message = 'AGENTS.md and CLAUDE.md exist, but the link relationship is broken or unexpected.';
    }
  }

  return {
    state,
    healthy,
    real_file: realFile,
    link_file: linkFile,
    recommended_canonical: CANONICAL_FILE,
    message,
    agents,
    claude,
  };
}

function validateInstructionFileName(name, flagName) {
  if (!VALID_FILES.has(name)) {
    throw new Error(`${flagName} must be AGENTS.md or CLAUDE.md`);
  }
}

function ensureInstructionLink(cwd, options = {}) {
  const real = options.real;
  const link = options.link;
  const replaceExisting = !!options.replaceExisting;

  validateInstructionFileName(real, '--real');
  validateInstructionFileName(link, '--link');
  if (real === link) {
    throw new Error('--real and --link must be different files');
  }

  const realAbsPath = path.join(cwd, real);
  const linkAbsPath = path.join(cwd, link);
  const realEntry = inspectInstructionFile(cwd, real, link);
  const linkEntry = inspectInstructionFile(cwd, link, real);

  if (!realEntry.exists) {
    throw new Error(`${real} does not exist. Create or merge it before creating a symlink.`);
  }
  if (realEntry.is_directory) {
    throw new Error(`${real} is a directory. Expected a file.`);
  }
  if (realEntry.is_symlink) {
    throw new Error(`${real} is already a symlink. Choose a regular file as the canonical instruction file.`);
  }

  const relativeTarget = toPosixPath(path.relative(path.dirname(linkAbsPath), realAbsPath) || path.basename(realAbsPath));
  let action = 'created';

  if (linkEntry.exists) {
    if (linkEntry.is_directory) {
      throw new Error(`${link} is a directory and cannot be replaced with a symlink.`);
    }

    if (linkEntry.is_symlink) {
      const currentTargetAbsPath = path.resolve(path.dirname(linkAbsPath), linkEntry.link_target || '');
      if (!linkEntry.target_missing && samePath(currentTargetAbsPath, realAbsPath)) {
        return {
          action: 'noop',
          real_file: real,
          link_file: link,
          link_target: relativeTarget,
          ...deriveInstructionFilesStatus(cwd),
        };
      }
    }

    if (!replaceExisting) {
      throw new Error(`${link} already exists. Re-run with --replace-existing to replace it with a symlink to ${real}.`);
    }

    fs.unlinkSync(linkAbsPath);
    action = 'replaced';
  }

  try {
    if (process.platform === 'win32') {
      fs.symlinkSync(relativeTarget, linkAbsPath, 'file');
    } else {
      fs.symlinkSync(relativeTarget, linkAbsPath);
    }
  } catch (err) {
    const detail = err && err.code ? err.code : err.message;
    throw new Error(`Failed to create symlink ${link} -> ${real}: ${detail}. Stop and resolve manually; GSD will not create a duplicate regular file.`);
  }

  return {
    action,
    real_file: real,
    link_file: link,
    link_target: relativeTarget,
    ...deriveInstructionFilesStatus(cwd),
  };
}

function cmdInstructionFilesStatus(cwd, raw) {
  output(deriveInstructionFilesStatus(cwd), raw);
}

function cmdInstructionFilesEnsureLink(cwd, options, raw) {
  try {
    output(ensureInstructionLink(cwd, options), raw);
  } catch (err) {
    error(err.message);
  }
}

module.exports = {
  CANONICAL_FILE,
  COMPAT_FILE,
  deriveInstructionFilesStatus,
  ensureInstructionLink,
  cmdInstructionFilesStatus,
  cmdInstructionFilesEnsureLink,
};

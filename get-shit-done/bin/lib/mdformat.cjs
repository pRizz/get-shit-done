/**
 * Mdformat compatibility setup and legacy GSD marker migration.
 */

const fs = require('fs');
const path = require('path');
const { atomicWriteFileSync, output, error } = require('./core.cjs');

const MDFORMAT_CONFIG = `# GSD Markdown requires these parser extensions.
wrap = "keep"
number = false
end_of_line = "lf"
validate = true
extensions = ["gfm", "frontmatter"]

# Path exclusions require Python 3.13 or newer.
exclude = [
  "**/node_modules/**",
  "**/.venv/**",
  "**/venv/**",
  "**/vendor/**",
]
`;

const INSTALL_COMMANDS = [
  "pipx install 'mdformat==1.0.0' --python python3.13",
  "pipx inject mdformat 'mdformat-frontmatter==2.1.2' 'mdformat-gfm==1.0.0'",
];

const CORE_GSD_MARKERS = new Set([
  'acceptance-criteria',
  'available-agent-types',
  'execution-context',
  'files-to-read',
  'read-first',
  'required-reading',
  'success-criteria',
]);

let maybeKnownGsdMarkers;

function cmdMdformatInit(cwd, raw) {
  const configPath = path.join(cwd, '.mdformat.toml');
  if (fs.existsSync(configPath)) {
    output({
      created: false,
      reason: 'existing-config-preserved',
      path: configPath,
      required_config: MDFORMAT_CONFIG,
      install_commands: INSTALL_COMMANDS,
    }, raw, 'existing-config-preserved');
    return;
  }

  atomicWriteFileSync(configPath, MDFORMAT_CONFIG);
  output({
    created: true,
    path: configPath,
    install_commands: INSTALL_COMMANDS,
  }, raw, configPath);
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function collectMarkdownFiles(targetPath) {
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return targetPath.toLowerCase().endsWith('.md') ? [targetPath] : [];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    files.push(...collectMarkdownFiles(path.join(targetPath, entry.name)));
  }
  return files;
}

function getKnownGsdMarkers() {
  if (maybeKnownGsdMarkers) return maybeKnownGsdMarkers;

  const markers = new Set(CORE_GSD_MARKERS);
  const packageRoot = path.resolve(__dirname, '..', '..', '..');
  const shippedDirectories = ['agents', 'commands', 'get-shit-done'];
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9-]*-[A-Za-z0-9-]*)(?=[\s>])/g;

  for (const directory of shippedDirectories) {
    const directoryPath = path.join(packageRoot, directory);
    if (!fs.existsSync(directoryPath)) continue;

    for (const filePath of collectMarkdownFiles(directoryPath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const match of content.matchAll(tagPattern)) markers.add(match[1]);
    }
  }

  maybeKnownGsdMarkers = markers;
  return markers;
}

/**
 * Convert recognized GSD pseudo-XML markers to CommonMark-safe custom elements.
 * The allowlist is derived from shipped GSD documents so user-defined elements
 * are not rewritten merely because their names contain underscores.
 */
function migrateMarkers(content) {
  return content.replace(
    /\\?(<\/?)([A-Za-z][A-Za-z0-9-]*_[A-Za-z0-9_-]*)(?=[\s>])/g,
    (match, opener, tagName) => {
      const canonicalTagName = tagName.replaceAll('_', '-');
      if (!getKnownGsdMarkers().has(canonicalTagName)) return match;
      return `${opener}${canonicalTagName}`;
    }
  );
}

function cmdMdformatMigrate(cwd, target, check, raw) {
  const requestedTarget = target || '.planning';
  const targetPath = path.resolve(cwd, requestedTarget);
  if (!isWithinRoot(cwd, targetPath)) {
    error('mdformat migrate path must stay within the project root');
  }
  if (!fs.existsSync(targetPath)) {
    output({ error: 'Path not found', path: requestedTarget }, raw);
    return;
  }

  const changed = [];
  for (const filePath of collectMarkdownFiles(targetPath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const migrated = migrateMarkers(content);
    if (migrated === content) continue;
    changed.push(path.relative(cwd, filePath).split(path.sep).join('/'));
    if (!check) atomicWriteFileSync(filePath, migrated);
  }

  output({
    check,
    changed: changed.length,
    files: changed,
  }, raw, String(changed.length));
}

module.exports = {
  MDFORMAT_CONFIG,
  migrateMarkers,
  cmdMdformatInit,
  cmdMdformatMigrate,
};

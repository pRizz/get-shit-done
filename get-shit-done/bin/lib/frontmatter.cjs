/**
 * Frontmatter — YAML frontmatter parsing, serialization, and CRUD commands
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, normalizeMd, output, error } = require('./core.cjs');

// ─── Parsing engine ───────────────────────────────────────────────────────────

/**
 * Split a YAML inline array body on commas, respecting quoted strings.
 * e.g. '"a, b", c' → ['a, b', 'c']
 */
function splitInlineArray(body) {
  const items = [];
  let current = '';
  let inQuote = null; // null | '"' | "'"

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ',') {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) items.push(trimmed);
  return items;
}

function lineEndingAt(content, offset) {
  if (content.startsWith('\r\n', offset)) return '\r\n';
  if (content.startsWith('\n', offset)) return '\n';
  return null;
}

/**
 * Read one full-line-delimited YAML block at an exact offset.
 *
 * Delimiters must be exactly `---` and occupy a complete line. The returned
 * end offset excludes the closing delimiter's line ending so callers can
 * preserve the body byte-for-byte.
 */
function readFrontmatterBlock(content, openingOffset) {
  if (!content.startsWith('---', openingOffset)) return null;

  const openingEnd = openingOffset + 3;
  const openingLineEnding = lineEndingAt(content, openingEnd);
  if (!openingLineEnding) return null;

  const yamlStart = openingEnd + openingLineEnding.length;
  let lineStart = yamlStart;

  while (lineStart <= content.length) {
    const newlineIndex = content.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex;
    const contentEnd = lineEnd > lineStart && content[lineEnd - 1] === '\r'
      ? lineEnd - 1
      : lineEnd;

    if (content.slice(lineStart, contentEnd) === '---') {
      let yamlEnd = lineStart;
      if (yamlEnd > yamlStart && content[yamlEnd - 1] === '\n') yamlEnd -= 1;
      if (yamlEnd > yamlStart && content[yamlEnd - 1] === '\r') yamlEnd -= 1;

      return {
        yaml: content.slice(yamlStart, yamlEnd),
        openingOffset,
        closingEnd: contentEnd,
      };
    }

    if (newlineIndex === -1) break;
    lineStart = newlineIndex + 1;
  }

  return null;
}

/**
 * Split the document's top frontmatter prefix from its body.
 *
 * A UTF-8 BOM is allowed before the first delimiter. Corrupted duplicate
 * headers are recovered only when blocks are immediately back-to-back; the
 * last such header wins. Delimiters elsewhere in the body are never scanned.
 */
function splitFrontmatterDocument(content) {
  const hasBom = content.startsWith('\uFEFF');
  const firstOffset = hasBom ? 1 : 0;
  const blocks = [];
  const firstBlock = readFrontmatterBlock(content, firstOffset);

  if (!firstBlock) {
    return {
      frontmatter: null,
      body: content,
      bodyOffset: 0,
      hasBom,
      blocks,
    };
  }

  blocks.push(firstBlock);
  let lastBlock = firstBlock;

  while (true) {
    const separator = lineEndingAt(content, lastBlock.closingEnd);
    if (!separator) break;

    const nextOffset = lastBlock.closingEnd + separator.length;
    const maybeNextBlock = readFrontmatterBlock(content, nextOffset);
    if (!maybeNextBlock) break;

    blocks.push(maybeNextBlock);
    lastBlock = maybeNextBlock;
  }

  return {
    frontmatter: lastBlock.yaml,
    body: content.slice(lastBlock.closingEnd),
    bodyOffset: lastBlock.closingEnd,
    hasBom,
    blocks,
  };
}

function extractFrontmatter(content) {
  const frontmatter = {};
  const { frontmatter: yaml } = splitFrontmatterDocument(content);
  if (yaml === null) return frontmatter;
  const lines = yaml.split(/\r?\n/);

  // Stack to track nested objects: [{obj, key, indent}]
  // obj = object to write to, key = current key collecting array items, indent = indentation level
  let stack = [{ obj: frontmatter, key: null, indent: -1 }];

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Calculate indentation (number of leading spaces)
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // Pop stack back to appropriate level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Check for key: value pattern
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[2];
      const value = keyMatch[3].trim();

      if (value === '' || value === '[') {
        // Key with no value or opening bracket — could be nested object or array
        // We'll determine based on next lines, for now create placeholder
        current.obj[key] = value === '[' ? [] : {};
        current.key = null;
        // Push new context for potential nested content
        stack.push({ obj: current.obj[key], key: null, indent });
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array: key: [a, b, c] — quote-aware split (REG-04 fix)
        current.obj[key] = splitInlineArray(value.slice(1, -1));
        current.key = null;
      } else {
        // Simple key: value
        current.obj[key] = value.replace(/^["']|["']$/g, '');
        current.key = null;
      }
    } else if (line.trim().startsWith('- ')) {
      // Array item
      const itemValue = line.trim().slice(2).replace(/^["']|["']$/g, '');

      // If current context is an empty object, convert to array
      if (typeof current.obj === 'object' && !Array.isArray(current.obj) && Object.keys(current.obj).length === 0) {
        // Find the key in parent that points to this object and convert it
        const parent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parent) {
          for (const k of Object.keys(parent.obj)) {
            if (parent.obj[k] === current.obj) {
              parent.obj[k] = [itemValue];
              current.obj = parent.obj[k];
              break;
            }
          }
        }
      } else if (Array.isArray(current.obj)) {
        current.obj.push(itemValue);
      }
    }
  }

  return frontmatter;
}

function serializeYamlScalar(value) {
  if (typeof value !== 'string') return String(value);

  const yamlKeyword = /^(?:null|~|true|false|yes|no|on|off)$/i;
  const yamlNumber = /^[+-]?(?:(?:[0-9][0-9_]*|\.[0-9_]+)(?:\.[0-9_]*)?(?:e[+-]?[0-9]+)?|0o[0-7_]+|0x[0-9a-f_]+|0b[01_]+)$/i;
  const yamlSpecialNumber = /^[+-]?\.(?:inf|nan)$/i;
  const yamlDate = /^\d{4}-\d{2}-\d{2}(?:(?:[Tt]|[ \t]+)\d{2}:\d{2}(?::\d{2}(?:\.\d*)?)?(?:[ \t]*(?:Z|[+-]\d{2}(?::?\d{2})?))?)?$/;
  const unsafeLeadingCharacter = /^[\-?:,\[\]{}#&*!|>'"%@`]/;
  const needsQuotes = value.length === 0
    || value.trim() !== value
    || /[\r\n\t]/.test(value)
    || unsafeLeadingCharacter.test(value)
    || value.includes(':')
    || value.includes('#')
    || /[\[\]{},]/.test(value)
    || yamlKeyword.test(value)
    || yamlNumber.test(value)
    || yamlSpecialNumber.test(value)
    || yamlDate.test(value);

  return needsQuotes ? JSON.stringify(value) : value;
}

function reconstructFrontmatter(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every(v => typeof v === 'string') && value.length <= 3 && value.join(', ').length < 60) {
        lines.push(`${key}: [${value.map(serializeYamlScalar).join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${serializeYamlScalar(item)}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subkey, subval] of Object.entries(value)) {
        if (subval === null || subval === undefined) continue;
        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else if (subval.every(v => typeof v === 'string') && subval.length <= 3 && subval.join(', ').length < 60) {
            lines.push(`  ${subkey}: [${subval.map(serializeYamlScalar).join(', ')}]`);
          } else {
            lines.push(`  ${subkey}:`);
            for (const item of subval) {
              lines.push(`    - ${serializeYamlScalar(item)}`);
            }
          }
        } else if (typeof subval === 'object') {
          lines.push(`  ${subkey}:`);
          for (const [subsubkey, subsubval] of Object.entries(subval)) {
            if (subsubval === null || subsubval === undefined) continue;
            if (Array.isArray(subsubval)) {
              if (subsubval.length === 0) {
                lines.push(`    ${subsubkey}: []`);
              } else {
                lines.push(`    ${subsubkey}:`);
                for (const item of subsubval) {
                  lines.push(`      - ${serializeYamlScalar(item)}`);
                }
              }
            } else {
              lines.push(`    ${subsubkey}: ${serializeYamlScalar(subsubval)}`);
            }
          }
        } else {
          lines.push(`  ${subkey}: ${serializeYamlScalar(subval)}`);
        }
      }
    } else {
      lines.push(`${key}: ${serializeYamlScalar(value)}`);
    }
  }
  return lines.join('\n');
}

function spliceFrontmatter(content, newObj) {
  const yamlStr = reconstructFrontmatter(newObj);
  const split = splitFrontmatterDocument(content);
  const bom = split.hasBom ? '\uFEFF' : '';

  if (split.frontmatter !== null) {
    return `${bom}---\n${yamlStr}\n---` + split.body;
  }

  const body = split.hasBom ? content.slice(1) : content;
  return `${bom}---\n${yamlStr}\n---\n\n` + body;
}

function parseMustHavesBlock(content, blockName) {
  // Extract a specific block from must_haves in raw frontmatter YAML
  // Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}]
  const { frontmatter: yaml } = splitFrontmatterDocument(content);
  if (yaml === null) return [];

  // Find must_haves: first to detect its indentation level
  const mustHavesMatch = yaml.match(/^(\s*)must_haves:\s*$/m);
  if (!mustHavesMatch) return [];
  const mustHavesIndent = mustHavesMatch[1].length;

  // Find the block (e.g., "truths:", "artifacts:", "key_links:") under must_haves
  // It must be indented more than must_haves but we detect the actual indent dynamically
  const blockPattern = new RegExp(`^(\\s+)${blockName}:\\s*$`, 'm');
  const blockMatch = yaml.match(blockPattern);
  if (!blockMatch) return [];

  const blockIndent = blockMatch[1].length;
  // The block must be nested under must_haves (more indented)
  if (blockIndent <= mustHavesIndent) return [];

  // Find where the block starts in the yaml string
  const blockStart = yaml.indexOf(blockMatch[0]);
  if (blockStart === -1) return [];

  const afterBlock = yaml.slice(blockStart);
  const blockLines = afterBlock.split(/\r?\n/).slice(1); // skip the header line

  // List items are indented one level deeper than blockIndent
  // Continuation KVs are indented one level deeper than list items
  const items = [];
  let current = null;
  let listItemIndent = -1; // detected from first "- " line

  for (const line of blockLines) {
    // Skip empty lines
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s*)/)[1].length;
    // Stop at same or lower indent level than the block header
    if (indent <= blockIndent && line.trim() !== '') break;

    const trimmed = line.trim();

    if (trimmed.startsWith('- ')) {
      // Detect list item indent from the first occurrence
      if (listItemIndent === -1) listItemIndent = indent;

      // Only treat as a top-level list item if at the expected indent
      if (indent === listItemIndent) {
        if (current) items.push(current);
        current = {};
        const afterDash = trimmed.slice(2);
        // Check if it's a simple string item (no colon means not a key-value)
        if (!afterDash.includes(':')) {
          current = afterDash.replace(/^["']|["']$/g, '');
        } else {
          // Key-value on same line as dash: "- path: value"
          const kvMatch = afterDash.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
          if (kvMatch) {
            current = {};
            current[kvMatch[1]] = kvMatch[2];
          }
        }
        continue;
      }
    }

    if (current && typeof current === 'object' && indent > listItemIndent) {
      // Continuation key-value or nested array item
      if (trimmed.startsWith('- ')) {
        // Array item under a key
        const arrVal = trimmed.slice(2).replace(/^["']|["']$/g, '');
        const keys = Object.keys(current);
        const lastKey = keys[keys.length - 1];
        if (lastKey && !Array.isArray(current[lastKey])) {
          current[lastKey] = current[lastKey] ? [current[lastKey]] : [];
        }
        if (lastKey) current[lastKey].push(arrVal);
      } else {
        const kvMatch = trimmed.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
        if (kvMatch) {
          const val = kvMatch[2];
          // Try to parse as number
          current[kvMatch[1]] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
        }
      }
    }
  }
  if (current) items.push(current);

  // Warn when must_haves block exists but parsed as empty -- likely YAML formatting issue.
  // This is a critical diagnostic: empty must_haves causes verification to silently degrade
  // to Option C (LLM-derived truths) instead of checking documented contracts.
  if (items.length === 0 && blockLines.length > 0) {
    const nonEmptyLines = blockLines.filter(l => l.trim() !== '').length;
    if (nonEmptyLines > 0) {
      process.stderr.write(
        `[gsd-tools] WARNING: must_haves.${blockName} block has ${nonEmptyLines} content lines but parsed 0 items. ` +
        `Possible YAML formatting issue — verification will fall back to LLM-derived truths.\n`
      );
    }
  }

  return items;
}

// ─── Frontmatter CRUD commands ────────────────────────────────────────────────

const FRONTMATTER_SCHEMAS = {
  plan: { required: ['phase', 'plan', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  summary: { required: ['phase', 'plan', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['phase', 'verified', 'status', 'score'] },
};

function cmdFrontmatterGet(cwd, filePath, field, raw) {
  if (!filePath) { error('file path required'); }
  // Path traversal guard: reject null bytes
  if (filePath.includes('\0')) { error('file path contains null bytes'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }
  const fm = extractFrontmatter(content);
  if (field) {
    const value = fm[field];
    if (value === undefined) { output({ error: 'Field not found', field }, raw); return; }
    output({ [field]: value }, raw, JSON.stringify(value));
  } else {
    output(fm, raw);
  }
}

function cmdFrontmatterSet(cwd, filePath, field, value, raw) {
  if (!filePath || !field || value === undefined) { error('file, field, and value required'); }
  // Path traversal guard: reject null bytes
  if (filePath.includes('\0')) { error('file path contains null bytes'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: filePath }, raw); return; }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let parsedValue;
  try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }
  fm[field] = parsedValue;
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, normalizeMd(newContent), 'utf-8');
  output({ updated: true, field, value: parsedValue }, raw, 'true');
}

function cmdFrontmatterMerge(cwd, filePath, data, raw) {
  if (!filePath || !data) { error('file and data required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: filePath }, raw); return; }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let mergeData;
  try { mergeData = JSON.parse(data); } catch { error('Invalid JSON for --data'); return; }
  Object.assign(fm, mergeData);
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, normalizeMd(newContent), 'utf-8');
  output({ merged: true, fields: Object.keys(mergeData) }, raw, 'true');
}

function cmdFrontmatterValidate(cwd, filePath, schemaName, raw) {
  if (!filePath || !schemaName) { error('file and schema required'); }
  const schema = FRONTMATTER_SCHEMAS[schemaName];
  if (!schema) { error(`Unknown schema: ${schemaName}. Available: ${Object.keys(FRONTMATTER_SCHEMAS).join(', ')}`); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }
  const fm = extractFrontmatter(content);
  const missing = schema.required.filter(f => fm[f] === undefined);
  const present = schema.required.filter(f => fm[f] !== undefined);
  output({ valid: missing.length === 0, missing, present, schema: schemaName }, raw, missing.length === 0 ? 'valid' : 'invalid');
}

module.exports = {
  splitFrontmatterDocument,
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  FRONTMATTER_SCHEMAS,
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
};

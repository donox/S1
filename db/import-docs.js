/**
 * import-docs.js — bulk import doc sections from a JSON file
 *
 * Usage:
 *   node db/import-docs.js db/sample-docs.json
 *
 * Each object in the JSON array must have: section, title, body
 * Optional: tags, source, source_url
 *
 * Deduplication is on (section, title) — if a row with the same section and
 * title already exists it is skipped rather than overwritten. This makes the
 * script safe to re-run after partial imports.
 *
 * source defaults to 'other' if the value is missing or unrecognized.
 * All inserts are wrapped in a single transaction for atomicity.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const VALID_SOURCES = ['personal', 'xtool-official', 'community', 'other'];

// --------------------------------------------------------------------------
// Load and parse input file
// --------------------------------------------------------------------------

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node db/import-docs.js <path-to-json-file>');
  process.exit(1);
}

const absPath = path.resolve(filePath);
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`);
  process.exit(1);
}

let rows;
try {
  rows = JSON.parse(fs.readFileSync(absPath, 'utf8'));
} catch (e) {
  console.error(`Failed to parse JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(rows)) {
  console.error('JSON file must contain an array of doc section objects');
  process.exit(1);
}

// --------------------------------------------------------------------------
// Prepared statements
// --------------------------------------------------------------------------

const findExisting = db.prepare(`
  SELECT id FROM docs_sections
  WHERE section = ? AND title = ?
`);

const insertRow = db.prepare(`
  INSERT INTO docs_sections (section, title, body, tags, source, source_url)
  VALUES (@section, @title, @body, @tags, @source, @source_url)
`);

// --------------------------------------------------------------------------
// Import transaction
// --------------------------------------------------------------------------

let inserted = 0;
let skipped  = 0;
const errors = [];

const importAll = db.transaction(() => {
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowLabel = `row ${i + 1}`;

    // Required field validation
    if (!raw.section || typeof raw.section !== 'string') {
      errors.push(`${rowLabel}: missing or invalid 'section'`);
      continue;
    }
    if (!raw.title || typeof raw.title !== 'string') {
      errors.push(`${rowLabel} (${raw.section}): missing or invalid 'title'`);
      continue;
    }
    if (!raw.body || typeof raw.body !== 'string') {
      errors.push(`${rowLabel} (${raw.section} / ${raw.title}): missing or invalid 'body'`);
      continue;
    }

    // Dedup check on (section, title)
    const existing = findExisting.get(raw.section, raw.title);
    if (existing) {
      console.log(`  SKIP  "${raw.section} / ${raw.title}" — already exists (id=${existing.id})`);
      skipped++;
      continue;
    }

    // Normalize optional fields
    const source = VALID_SOURCES.includes(raw.source) ? raw.source : 'other';
    const row = {
      section:    raw.section,
      title:      raw.title,
      body:       raw.body,
      tags:       raw.tags       ?? null,
      source,
      source_url: raw.source_url ?? null,
    };

    try {
      const info = insertRow.run(row);
      console.log(`  INSERT "${raw.section} / ${raw.title}" [${source}] → id=${info.lastInsertRowid}`);
      inserted++;
    } catch (e) {
      errors.push(`${rowLabel} (${raw.section} / ${raw.title}): ${e.message}`);
    }
  }
});

console.log(`\nImporting ${rows.length} doc section(s) from ${path.basename(absPath)}...\n`);
importAll();

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------

console.log(`\n--- Import complete ---`);
console.log(`  Inserted: ${inserted}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Errors:   ${errors.length}`);
if (errors.length) {
  console.log('\nErrors:');
  for (const e of errors) console.log(`  ! ${e}`);
}

/**
 * import-settings.js — bulk import material settings from a JSON file
 *
 * Usage:
 *   node db/import-settings.js db/sample-import.json
 *
 * All rows are inserted as role='candidate' regardless of what the file specifies.
 * Deduplication is on (material, operation, power, speed) — exact match only.
 * source defaults to 'other' if the value is missing or unrecognized.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const VALID_SOURCES   = ['personal', 'xtool-official', 'community', 'other'];
const VALID_OPERATIONS = ['engrave', 'score', 'cut'];

// --------------------------------------------------------------------------
// Load and parse input file
// --------------------------------------------------------------------------

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node db/import-settings.js <path-to-json-file>');
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
  console.error('JSON file must contain an array of setting objects');
  process.exit(1);
}

// --------------------------------------------------------------------------
// Prepared statements
// --------------------------------------------------------------------------

const findExisting = db.prepare(`
  SELECT id FROM material_settings
  WHERE material = ? AND operation = ? AND power = ? AND speed = ?
`);

const insertRow = db.prepare(`
  INSERT INTO material_settings
    (material, operation, power, speed, lines_per_inch, passes,
     focus_offset_mm, notes, starred, role, source, source_url)
  VALUES
    (@material, @operation, @power, @speed, @lines_per_inch, @passes,
     @focus_offset_mm, @notes, 0, 'candidate', @source, @source_url)
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
    if (!raw.material || typeof raw.material !== 'string') {
      errors.push(`${rowLabel}: missing or invalid 'material'`);
      continue;
    }
    if (!raw.operation || !VALID_OPERATIONS.includes(raw.operation)) {
      errors.push(`${rowLabel} (${raw.material}): 'operation' must be engrave, score, or cut`);
      continue;
    }
    if (raw.power == null || typeof raw.power !== 'number') {
      errors.push(`${rowLabel} (${raw.material}/${raw.operation}): 'power' is required and must be a number`);
      continue;
    }
    if (raw.speed == null || typeof raw.speed !== 'number') {
      errors.push(`${rowLabel} (${raw.material}/${raw.operation}): 'speed' is required and must be a number`);
      continue;
    }

    // Dedup check
    const existing = findExisting.get(raw.material, raw.operation, raw.power, raw.speed);
    if (existing) {
      console.log(`  SKIP  ${raw.material} / ${raw.operation} / power=${raw.power} speed=${raw.speed} — already exists (id=${existing.id})`);
      skipped++;
      continue;
    }

    // Normalize optional fields
    const source = VALID_SOURCES.includes(raw.source) ? raw.source : 'other';
    const row = {
      material:        raw.material,
      operation:       raw.operation,
      power:           raw.power,
      speed:           raw.speed,
      lines_per_inch:  raw.lines_per_inch  ?? null,
      passes:          raw.passes          ?? 1,
      focus_offset_mm: raw.focus_offset_mm ?? 0,
      notes:           raw.notes           ?? null,
      source,
      source_url:      raw.source_url      ?? null,
    };

    try {
      const info = insertRow.run(row);
      console.log(`  INSERT ${raw.material} / ${raw.operation} / power=${raw.power} speed=${raw.speed} [${source}] → id=${info.lastInsertRowid}`);
      inserted++;
    } catch (e) {
      errors.push(`${rowLabel} (${raw.material}/${raw.operation}): ${e.message}`);
    }
  }
});

console.log(`\nImporting ${rows.length} row(s) from ${path.basename(absPath)}...\n`);
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

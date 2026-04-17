/**
 * embed-all.js — backfill embeddings for all docs_sections rows missing one
 *
 * Usage:
 *   node db/embed-all.js          # embed only rows with no embedding
 *   node db/embed-all.js --force  # re-embed all rows
 *
 * Requires Ollama running at localhost:11434 with nomic-embed-text pulled.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');
const { embed, ollamaAvailable, serializeEmbedding } = require('./embed');

const force = process.argv.includes('--force');

(async () => {
  const available = await ollamaAvailable();
  if (!available) {
    console.error('Ollama is not running. Start it with: ollama serve');
    process.exit(1);
  }

  const rows = force
    ? db.prepare('SELECT id, title, body, tags FROM docs_sections').all()
    : db.prepare('SELECT id, title, body, tags FROM docs_sections WHERE embedding IS NULL').all();

  if (!rows.length) {
    console.log('All docs already have embeddings. Use --force to re-embed.');
    process.exit(0);
  }

  console.log(`Embedding ${rows.length} doc(s)...\n`);

  const update = db.prepare('UPDATE docs_sections SET embedding = ? WHERE id = ?');

  let ok = 0, fail = 0;
  for (const r of rows) {
    const text = [r.title, r.tags, r.body].filter(Boolean).join(' ');
    const vec  = await embed(text);
    if (vec) {
      update.run(serializeEmbedding(vec), r.id);
      console.log(`  ✓ id=${r.id} "${r.title}"`);
      ok++;
    } else {
      console.log(`  ✗ id=${r.id} "${r.title}" — embed failed`);
      fail++;
    }
  }

  console.log(`\nDone — ${ok} embedded, ${fail} failed`);
})();

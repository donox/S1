/**
 * embed.js — Ollama embedding utility
 *
 * Provides:
 *   embed(text)           → Float64Array | null  (null if Ollama unavailable)
 *   cosineSimilarity(a,b) → number 0..1
 *   ollamaAvailable()     → Promise<boolean>
 *
 * Model: nomic-embed-text (768 dimensions)
 * Ollama must be running at http://localhost:11434
 * All functions degrade gracefully — callers get null, never a thrown error.
 */

const OLLAMA_URL = 'http://localhost:11434';
const MODEL      = 'nomic-embed-text';

async function ollamaAvailable() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch { return false; }
}

async function embed(text) {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: MODEL, prompt: String(text) }),
      signal:  AbortSignal.timeout(60000),
    });
    if (!r.ok) return null;
    const { embedding } = await r.json();
    return embedding ? new Float64Array(embedding) : null;
  } catch { return null; }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Serialize Float64Array → JSON string for SQLite TEXT storage
function serializeEmbedding(vec) {
  return JSON.stringify(Array.from(vec));
}

// Deserialize JSON string → Float64Array
function deserializeEmbedding(str) {
  if (!str) return null;
  try { return new Float64Array(JSON.parse(str)); }
  catch { return null; }
}

module.exports = { embed, cosineSimilarity, ollamaAvailable, serializeEmbedding, deserializeEmbedding };

import { chunkText, cosineSimilarity } from './db.js';

console.log('=== Running DB and Vector Math Verification tests ===');

// 1. Test Chunking
const testText = "The quick brown fox jumps over the lazy dog. This is sentence number two. And here is a third sentence to help test the text chunking mechanism in JS.";
const chunks = chunkText(testText, 60, 15);

console.log('\n1. Chunking Test:');
console.log(`Original length: ${testText.length} chars`);
console.log(`Generated chunks count: ${chunks.length}`);
chunks.forEach((c, idx) => console.log(`  Chunk [${idx}]: "${c}" (len: ${c.length})`));

if (chunks.length > 0) {
  console.log('✅ Chunking test passed!');
} else {
  console.log('❌ Chunking test failed!');
  process.exit(1);
}

// 2. Test Cosine Similarity
console.log('\n2. Vector Cosine Similarity Test:');
const vecA = [1.0, 0.0, 0.5];
const vecB = [1.0, 0.0, 0.5]; // identical
const vecC = [0.0, 1.0, 0.0]; // orthogonal

const simIdentical = cosineSimilarity(vecA, vecB);
const simOrthogonal = cosineSimilarity(vecA, vecC);

console.log(`Similarity (identical): ${simIdentical.toFixed(4)} (Expected: ~1.0000)`);
console.log(`Similarity (orthogonal): ${simOrthogonal.toFixed(4)} (Expected: ~0.0000)`);

if (Math.abs(simIdentical - 1.0) < 0.0001 && Math.abs(simOrthogonal - 0.0) < 0.0001) {
  console.log('✅ Cosine Similarity test passed!');
} else {
  console.log('❌ Cosine Similarity test failed!');
  process.exit(1);
}

console.log('\n=== All DB unit tests passed successfully! ===');

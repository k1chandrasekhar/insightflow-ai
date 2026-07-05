import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

// Initial schema
const initialDb = {
  items: [],
  chunks: [],
  sessions: [],
  messages: []
};

const STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot',
  'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed',
  'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i',
  'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more',
  'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes',
  'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well',
  'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who',
  'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre',
  'youve', 'your', 'yours', 'yourself', 'yourselves',
  'also', 'will', 'using', 'used', 'based', 'file', 'data', 'document', 'text', 'information', 'content', 'image', 'system'
]);

export function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length > 1);
}

export function extractKeywords(text, topN = 5) {
  if (!text) return [];
  const words = tokenize(text).filter(w => w.length > 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const freqs = {};
  words.forEach(w => {
    freqs[w] = (freqs[w] || 0) + 1;
  });
  return Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(entry => entry[0]);
}

// Load database from JSON file
export function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      saveDatabase(initialDb);
      return initialDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    // Ensure backwards compatibility with older db.json schemas
    if (!parsed.sessions) parsed.sessions = [];
    if (!parsed.messages) parsed.messages = [];
    
    // Self-healing migration for keywords
    let updated = false;
    if (parsed.items) {
      parsed.items.forEach(item => {
        if (!item.keywords) {
          item.keywords = extractKeywords(item.content, 5);
          updated = true;
        }
      });
    }
    if (updated) {
      saveDatabase(parsed);
    }
    
    return parsed;
  } catch (error) {
    console.error('Error loading database, returning empty schema:', error);
    return initialDb;
  }
}

// Save database to JSON file
export function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Add a new item (document/bookmark/note)
export function addItem(item) {
  const db = loadDatabase();
  const newItem = {
    id: Date.now().toString(),
    addedDate: new Date().toISOString(),
    keywords: extractKeywords(item.content, 5),
    ...item
  };
  db.items.push(newItem);
  saveDatabase(db);
  return newItem;
}

// Get all items
export function getItems() {
  const db = loadDatabase();
  return db.items;
}

// Delete an item and its associated text chunks
export function deleteItem(id) {
  const db = loadDatabase();
  
  const item = db.items.find(i => i.id === id);
  if (item && item.type === 'pdf' && item.filepath) {
    try {
      const fullPath = path.join(__dirname, item.filepath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`Deleted associated file: ${fullPath}`);
      }
    } catch (err) {
      console.error(`Failed to delete file for item ${id}:`, err);
    }
  }

  db.items = db.items.filter(i => i.id !== id);
  db.chunks = db.chunks.filter(c => c.itemId !== id);
  saveDatabase(db);
  return true;
}

// Add text chunks with embeddings
export function addChunks(itemId, chunkList) {
  const db = loadDatabase();
  const formattedChunks = chunkList.map((chunk, index) => ({
    id: `${itemId}-chunk-${index}`,
    itemId,
    text: chunk.text,
    embedding: chunk.embedding
  }));
  db.chunks.push(...formattedChunks);
  saveDatabase(db);
  return formattedChunks;
}

// Split text into sliding chunks
export function chunkText(text, size = 500, overlap = 100) {
  const chunks = [];
  if (!text) return chunks;
  
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  let i = 0;
  while (i < cleanText.length) {
    let chunk = cleanText.slice(i, i + size);
    
    if (i + size < cleanText.length) {
      const lastPeriod = chunk.lastIndexOf('. ');
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastPeriod > size * 0.7) {
        chunk = chunk.slice(0, lastPeriod + 1);
      } else if (lastSpace > size * 0.8) {
        chunk = chunk.slice(0, lastSpace);
      }
    }
    
    chunks.push(chunk.trim());
    const increment = chunk.length - overlap;
    i += (increment > 0) ? increment : chunk.length;
  }
  return chunks.filter(c => c.length > 5);
}

// Compute cosine similarity between two vectors
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search top similar chunks for a given query embedding
export function querySimilarChunks(queryEmbedding, topK = 4) {
  const db = loadDatabase();
  if (!db.chunks || db.chunks.length === 0) return [];
  
  const scoredChunks = db.chunks.map(chunk => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    const parentItem = db.items.find(i => i.id === chunk.itemId);
    return {
      chunkId: chunk.id,
      itemId: chunk.itemId,
      text: chunk.text,
      similarity,
      sourceTitle: parentItem ? parentItem.title : 'Unknown Source',
      sourceType: parentItem ? parentItem.type : 'unknown',
      sourceUrl: parentItem ? parentItem.url : null
    };
  });
  
  scoredChunks.sort((a, b) => b.similarity - a.similarity);
  return scoredChunks.slice(0, topK);
}

// Search top BM25 matching chunks for a given query text
export function searchBM25(query, chunks) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const N = chunks.length;
  const docTermFreqs = [];
  const docLengths = [];
  let totalLength = 0;
  const termDocCounts = {};

  chunks.forEach(chunk => {
    const tokens = tokenize(chunk.text);
    const freqs = {};
    tokens.forEach(token => {
      freqs[token] = (freqs[token] || 0) + 1;
    });
    docTermFreqs.push(freqs);
    docLengths.push(tokens.length);
    totalLength += tokens.length;

    Object.keys(freqs).forEach(term => {
      termDocCounts[term] = (termDocCounts[term] || 0) + 1;
    });
  });

  const avgdl = totalLength / N;
  const k1 = 1.2;
  const b = 0.75;

  const scored = chunks.map((chunk, idx) => {
    let score = 0;
    const freqs = docTermFreqs[idx];
    const docLen = docLengths[idx];

    queryTerms.forEach(term => {
      const termFreq = freqs[term] || 0;
      if (termFreq > 0) {
        const docCount = termDocCounts[term] || 0;
        const idf = Math.log(1 + (N - docCount + 0.5) / (docCount + 0.5));
        const termScore = idf * (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLen / avgdl)));
        score += termScore;
      }
    });

    return { chunk, score };
  });

  const maxScore = Math.max(...scored.map(s => s.score));
  return scored.map(s => ({
    chunk: s.chunk,
    score: maxScore > 0 ? s.score / maxScore : 0
  }));
}

// Search top hybrid chunks combining vector similarity and BM25 search
export function queryHybridChunks(queryText, queryEmbedding, topK = 4, similarityThreshold = 0.4, hybridWeight = 0.5) {
  const db = loadDatabase();
  if (!db.chunks || db.chunks.length === 0) return [];

  // Vector Scores
  const vectorScores = db.chunks.map(chunk => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    return { chunk, similarity };
  });

  // BM25 Scores
  const bm25Results = searchBM25(queryText, db.chunks);
  const bm25Map = {};
  bm25Results.forEach(r => {
    bm25Map[r.chunk.id] = r.score;
  });

  // Combine Scores
  const scoredChunks = vectorScores.map(v => {
    const vectorScore = v.similarity;
    const bm25Score = bm25Map[v.chunk.id] || 0;
    const hybridScore = (hybridWeight * vectorScore) + ((1 - hybridWeight) * bm25Score);
    const parentItem = db.items.find(i => i.id === v.chunk.itemId);

    return {
      chunkId: v.chunk.id,
      itemId: v.chunk.itemId,
      text: v.chunk.text,
      similarity: vectorScore,
      bm25Score,
      hybridScore,
      sourceTitle: parentItem ? parentItem.title : 'Unknown Source',
      sourceType: parentItem ? parentItem.type : 'unknown',
      sourceUrl: parentItem ? parentItem.url : null
    };
  });

  // Filter by Vector Similarity Threshold
  const filteredChunks = scoredChunks.filter(c => c.similarity >= similarityThreshold);

  // Sort by Hybrid Score descending
  filteredChunks.sort((a, b) => b.hybridScore - a.hybridScore);

  return filteredChunks.slice(0, topK);
}

// --- Session & Message Management ---

export function createSession(title = 'New Chat') {
  const db = loadDatabase();
  const newSession = {
    id: Date.now().toString(),
    title,
    createdDate: new Date().toISOString()
  };
  db.sessions.unshift(newSession);
  saveDatabase(db);
  return newSession;
}

export function getSessions() {
  const db = loadDatabase();
  return db.sessions;
}

export function deleteSession(id) {
  const db = loadDatabase();
  db.sessions = db.sessions.filter(s => s.id !== id);
  db.messages = db.messages.filter(m => m.sessionId !== id);
  saveDatabase(db);
  return true;
}

export function getSessionMessages(sessionId) {
  const db = loadDatabase();
  return db.messages.filter(m => m.sessionId === sessionId);
}

export function addMessage(sessionId, role, content, citations = [], metrics = null, images = []) {
  const db = loadDatabase();
  const newMessage = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sessionId,
    role,
    content,
    citations,
    metrics,
    images,
    timestamp: new Date().toISOString()
  };
  db.messages.push(newMessage);

  // Auto update title if it's currently 'New Chat'
  if (role === 'user') {
    const session = db.sessions.find(s => s.id === sessionId);
    if (session && session.title === 'New Chat') {
      session.title = content.length > 24 ? `${content.slice(0, 24)}...` : content;
    }
  }

  saveDatabase(db);
  return newMessage;
}

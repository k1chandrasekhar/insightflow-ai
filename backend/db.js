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

export function addMessage(sessionId, role, content, citations = [], metrics = null) {
  const db = loadDatabase();
  const newMessage = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sessionId,
    role,
    content,
    citations,
    metrics,
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

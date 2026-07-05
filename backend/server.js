import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { pipeline } from '@xenova/transformers';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import { searchWeb, scrapeUrlText } from './search.js';
import { 
  addItem, 
  getItems, 
  deleteItem, 
  chunkText, 
  addChunks, 
  querySimilarChunks,
  queryHybridChunks,
  createSession,
  getSessions,
  deleteSession,
  getSessionMessages,
  addMessage
} from './db.js';

// Helper: Custom PPTX Slide Text Extractor using zip parsing
function parsePptxText(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    let textContent = '';
    
    // Sort slide files in numerical order
    const slideEntries = zipEntries
      .filter(entry => entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml'))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/\d+/)[0]);
        const numB = parseInt(b.entryName.match(/\d+/)[0]);
        return numA - numB;
      });

    slideEntries.forEach((entry, idx) => {
      const xml = entry.getData().toString('utf8');
      const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
      const slideText = matches
        .map(m => m.replace(/<\/?a:t>/g, ''))
        .join(' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      if (slideText.trim()) {
        textContent += `[Slide ${idx + 1}] ${slideText}\n\n`;
      }
    });

    return textContent.trim();
  } catch (err) {
    console.error('Error parsing PPTX:', err);
    throw err;
  }
}

// Helper: Parse CSV rows correctly (taking quotes into account)
function parseCSVRows(lines) {
  const parsed = [];
  lines.forEach(line => {
    const row = [];
    let insideQuote = false;
    let currentVal = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    row.push(currentVal.trim());
    parsed.push(row);
  });
  return parsed;
}

// Helper: Convert parsed CSV rows back to a Markdown table
function csvToMarkdown(rows) {
  if (rows.length === 0) return '';
  const headers = rows[0];
  const body = rows.slice(1);
  
  let md = '| ' + headers.join(' | ') + ' |\n';
  md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  body.forEach(row => {
    md += '| ' + row.join(' | ') + ' |\n';
  });
  return md;
}

// Helper: Chunk spreadsheet rows and return Markdown tables preserving columns
function chunkSpreadsheet(csvContent, chunkSize = 20) {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  const header = lines[0];
  const dataRows = lines.slice(1);
  const chunks = [];
  
  for (let i = 0; i < dataRows.length; i += chunkSize) {
    const chunkRows = dataRows.slice(i, i + chunkSize);
    const tableRows = [header, ...chunkRows];
    const parsedRows = parseCSVRows(tableRows);
    const mdTable = csvToMarkdown(parsedRows);
    chunks.push(mdTable);
  }
  return chunks;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads folder exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

// Helper: Get embedding for a text chunk using local WASM MiniLM model
let embedder = null;
async function getEmbedding(text) {
  if (!embedder) {
    console.log('Initializing local WASM embedding model (all-MiniLM-L6-v2)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// --- Library Endpoints ---

// Route: Get all items
app.get('/api/items', (req, res) => {
  try {
    res.json(getItems());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Delete an item
app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    deleteItem(id);
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Add a bookmark (with optional auto-scrape) or text note
app.post('/api/items', async (req, res) => {
  try {
    const { title, content, type, url } = req.body;
    if (!title || !type) {
      return res.status(400).json({ error: 'Title and type are required' });
    }

    let finalContent = content || '';

    // If type is a link (bookmark) and no content was manually pasted, scrape the URL!
    if (type === 'link' && !finalContent.trim()) {
      if (!url) {
        return res.status(400).json({ error: 'URL is required for bookmarks' });
      }
      console.log(`Auto-scraping content from URL: ${url}`);
      const scrapedText = await scrapeUrlText(url);
      if (!scrapedText || scrapedText.length < 50) {
        return res.status(400).json({ 
          error: 'Failed to extract meaningful text from this webpage. Please paste the article content manually.' 
        });
      }
      finalContent = scrapedText;
      console.log(`Successfully scraped webpage! Content size: ${scrapedText.length} characters.`);
    } else {
      // If it's a note or manual link, content is required
      if (!finalContent.trim()) {
        return res.status(400).json({ error: 'Content is required for notes and manual bookmarks' });
      }
    }

    const newItem = addItem({ title, content: finalContent, type, url });

    const chunks = chunkText(finalContent);
    const chunkEmbeddings = [];

    console.log(`Generating embeddings for note/bookmark "${title}" (${chunks.length} chunks)...`);
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      chunkEmbeddings.push({ text: chunk, embedding });
    }

    addChunks(newItem.id, chunkEmbeddings);
    res.json({ success: true, item: newItem });
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Upload PDF, Image, or text document and process
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const relativePath = path.relative(__dirname, filePath);
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;
    const extension = path.extname(filename).toLowerCase();

    let newItem;

    if (mimeType.startsWith('image/')) {
      console.log(`Saving image file: ${filename}`);
      newItem = addItem({
        title: filename,
        content: `Image file: ${filename}`,
        type: 'image',
        filepath: relativePath
      });
      // Skip embedding generation for images since text model is active
    } else if (mimeType === 'application/pdf') {
      console.log(`Parsing PDF file: ${filename}`);
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      const content = pdfData.text;

      if (!content || content.trim().length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Failed to extract text from PDF (it might be scanned/image-only)' });
      }

      newItem = addItem({
        title: filename,
        content,
        type: 'pdf',
        filepath: relativePath
      });

      const chunks = chunkText(content);
      const chunkEmbeddings = [];

      console.log(`Generating embeddings for PDF "${filename}" (${chunks.length} chunks)...`);
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        chunkEmbeddings.push({ text: chunk, embedding });
      }

      addChunks(newItem.id, chunkEmbeddings);
    } else if (extension === '.docx') {
      console.log(`Parsing DOCX file: ${filename}`);
      const result = await mammoth.extractRawText({ path: filePath });
      const content = result.value;

      if (!content || content.trim().length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Failed to extract text from Word document' });
      }

      newItem = addItem({
        title: filename,
        content,
        type: 'note',
        filepath: relativePath
      });

      const chunks = chunkText(content);
      const chunkEmbeddings = [];

      console.log(`Generating embeddings for DOCX "${filename}" (${chunks.length} chunks)...`);
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        chunkEmbeddings.push({ text: chunk, embedding });
      }

      addChunks(newItem.id, chunkEmbeddings);
    } else if (extension === '.xlsx' || extension === '.csv' || mimeType === 'text/csv' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      console.log(`Parsing spreadsheet file: ${filename}`);
      let csvContent = '';
      if (extension === '.csv') {
        csvContent = fs.readFileSync(filePath, 'utf8');
      } else {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        csvContent = XLSX.utils.sheet_to_csv(sheet);
      }

      if (!csvContent || csvContent.trim().length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Failed to extract data from spreadsheet' });
      }

      newItem = addItem({
        title: filename,
        content: csvContent,
        type: 'note',
        filepath: relativePath
      });

      const chunks = chunkSpreadsheet(csvContent, 20);
      const chunkEmbeddings = [];

      console.log(`Generating embeddings for spreadsheet "${filename}" (${chunks.length} chunks)...`);
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        chunkEmbeddings.push({ text: chunk, embedding });
      }

      addChunks(newItem.id, chunkEmbeddings);
    } else if (extension === '.pptx' || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      console.log(`Parsing PPTX file: ${filename}`);
      const content = parsePptxText(filePath);

      if (!content || content.trim().length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Failed to extract text from PowerPoint presentation' });
      }

      newItem = addItem({
        title: filename,
        content,
        type: 'note',
        filepath: relativePath
      });

      const chunks = chunkText(content);
      const chunkEmbeddings = [];

      console.log(`Generating embeddings for PPTX "${filename}" (${chunks.length} chunks)...`);
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        chunkEmbeddings.push({ text: chunk, embedding });
      }

      addChunks(newItem.id, chunkEmbeddings);
    } else {
      // General text file fallback (like txt, md, js, json, etc.)
      console.log(`Saving text file: ${filename}`);
      const content = fs.readFileSync(filePath, 'utf8');
      
      newItem = addItem({
        title: filename,
        content,
        type: 'note', // Treat raw text documents as notes
        filepath: relativePath
      });

      const chunks = chunkText(content);
      const chunkEmbeddings = [];

      console.log(`Generating embeddings for text file "${filename}" (${chunks.length} chunks)...`);
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        chunkEmbeddings.push({ text: chunk, embedding });
      }

      addChunks(newItem.id, chunkEmbeddings);
    }

    res.json({ success: true, item: newItem });
  } catch (error) {
    console.error('Error uploading/processing file:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// --- Session History Endpoints ---

// Route: Get all chat sessions
app.get('/api/sessions', (req, res) => {
  try {
    res.json(getSessions());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Create a new chat session
app.post('/api/sessions', (req, res) => {
  try {
    const { title } = req.body;
    const newSession = createSession(title);
    res.json(newSession);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Delete a chat session
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const { id } = req.params;
    deleteSession(id);
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Get messages for a session
app.get('/api/sessions/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    res.json(getSessionMessages(id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Query / RAG Endpoint ---

// Route: Query Ollama RAG (with persistent session history)
// Helper: Save base64 image to disk and return relative path
function saveBase64Image(base64Str) {
  try {
    const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let ext = 'png';
    let data = base64Str;
    if (matches && matches.length === 3) {
      ext = matches[1].split('/')[1] || 'png';
      data = matches[2];
    }
    const buffer = Buffer.from(data, 'base64');
    const filename = `chat-img-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 image:', err);
    return null;
  }
}

// Helper: Read file from disk and convert to base64
function getBase64OfFile(relativeFilePath) {
  try {
    const fullPath = path.join(__dirname, relativeFilePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, { encoding: 'base64' });
    }
  } catch (err) {
    console.error(`Error reading image file for base64: ${relativeFilePath}`, err);
  }
  return null;
}

// Route: Query Ollama RAG (with persistent session history)
app.post('/api/query', async (req, res) => {
  try {
    const { query, mode, chatModel, sessionId, images, ragSettings } = req.body;
    if (!query || !sessionId) {
      return res.status(400).json({ error: 'Query and sessionId are required' });
    }

    const activeChatModel = chatModel || 'llama3';
    const activeMode = mode || 'none';

    // RAG configuration variables
    const topK = ragSettings?.topK || 4;
    const similarityThreshold = ragSettings?.similarityThreshold !== undefined ? ragSettings.similarityThreshold : 0.4;
    const hybridWeight = ragSettings?.hybridWeight !== undefined ? ragSettings.hybridWeight : 0.5;

    // Save image attachments to disk if any
    const savedImagePaths = [];
    if (images && images.length > 0) {
      images.forEach(img => {
        const savedPath = saveBase64Image(img);
        if (savedPath) savedImagePaths.push(savedPath);
      });
    }

    // 1. Save user query in database
    addMessage(sessionId, 'user', query, [], null, savedImagePaths);

    // 2. Fetch session history for Ollama context (excluding the new user query we just saved)
    const previousMessages = getSessionMessages(sessionId).slice(0, -1);
    const history = previousMessages.map(m => {
      const msgObj = {
        role: m.role,
        content: m.content
      };
      if (m.images && m.images.length > 0) {
        msgObj.images = m.images.map(img => getBase64OfFile(img)).filter(Boolean);
      }
      return msgObj;
    });

    let contextChunks = [];
    let promptContext = '';
    let systemPrompt = '';

    if (activeMode === 'local') {
      console.log(`Performing local hybrid search for session ${sessionId}: "${query}" (topK=${topK}, threshold=${similarityThreshold}, hybridWeight=${hybridWeight})`);
      const queryEmbedding = await getEmbedding(query);
      const localChunks = queryHybridChunks(query, queryEmbedding, topK, similarityThreshold, hybridWeight);
      
      contextChunks = localChunks.map(c => ({
        sourceTitle: c.sourceTitle,
        sourceType: c.sourceType,
        sourceUrl: c.sourceUrl,
        similarity: c.similarity,
        hybridScore: c.hybridScore,
        text: c.text
      }));

      if (contextChunks.length > 0) {
        promptContext = contextChunks.map((c, i) => `[${i + 1}] Source: "${c.sourceTitle}"\nContent: ${c.text}`).join('\n\n');
      }

      systemPrompt = `You are an offline private AI research assistant. You answer queries using the provided text contexts from the user's bookmarks, notes, and PDFs.
Guidelines:
1. Provide a detailed, accurate response.
2. Rely strictly on the provided context if it contains the answer. If the context does not contain relevant information, clearly state that the provided files do not contain the answer, and then provide a general answer based on your knowledge base.
3. Cite your sources in the text using bracketed numbers like [1], [2] at the end of the sentences where you reference them.
4. Keep the tone helpful, professional, and clear.`;

    } else if (activeMode === 'web') {
      console.log(`Performing web search for session ${sessionId}: "${query}"`);
      const searchResults = await searchWeb(query);
      
      contextChunks = searchResults.map(r => ({
        sourceTitle: r.title,
        sourceType: 'web',
        sourceUrl: r.url,
        similarity: 1.0,
        text: r.snippet
      }));

      if (contextChunks.length > 0) {
        promptContext = contextChunks.map((c, i) => `[${i + 1}] Source: "${c.sourceTitle}" (URL: ${c.sourceUrl})\nSnippet: ${c.text}`).join('\n\n');
      }

      const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      systemPrompt = `You are a helpful AI assistant. You answer queries using the real-time search results retrieved from the internet.
Guidelines:
1. Synthesize a comprehensive, direct, and helpful answer.
2. Rely strictly on the provided search results to answer the query. Note that the current date is ${currentDate}. Focus on the most recent facts, dates, and versions from 2026 or late 2025.
3. Cite your sources using bracketed numbers like [1], [2] at the end of the sentences where you reference them.
4. Do not mention your 2022 knowledge cutoff or state that you cannot access the internet, since you are currently equipped with live web search results.
5. Keep the tone helpful, professional, and clear.`;

    } else {
      // Direct Chat Mode (mode === 'none')
      console.log(`Direct chat query for session ${sessionId}: "${query}"`);
      systemPrompt = `You are a helpful, direct local AI assistant. Provide an accurate and comprehensive response to the user's query.`;
    }

    const messages = [];
    
    // Add system instructions and context
    if (promptContext) {
      messages.push({ 
        role: 'system', 
        content: `${systemPrompt}\n\nHere is the retrieved context:\n\n${promptContext}`
      });
    } else {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Append conversational history if any
    if (history && history.length > 0) {
      messages.push(...history);
    }

    // Append current user query
    const userMessage = { role: 'user', content: query };
    if (savedImagePaths.length > 0) {
      // Pass base64 strings to Ollama
      userMessage.images = savedImagePaths.map(img => getBase64OfFile(img)).filter(Boolean);
    }
    messages.push(userMessage);

    console.log(`Calling Ollama chat API with model: ${activeChatModel}`);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeChatModel,
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama chat completion failed with status ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.message ? data.message.content : '';

    // Extract performance metrics if returned by Ollama
    const metrics = data.eval_count ? {
      totalDuration: data.total_duration,
      loadDuration: data.load_duration,
      promptEvalCount: data.prompt_eval_count,
      promptEvalDuration: data.prompt_eval_duration,
      evalCount: data.eval_count,
      evalDuration: data.eval_duration
    } : null;

    // 3. Save assistant response in database
    addMessage(sessionId, 'assistant', responseText, contextChunks, metrics);

    res.json({
      response: responseText,
      citations: contextChunks,
      metrics
    });
  } catch (error) {
    console.error('Error during query:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- System Status Endpoints ---

// Route: Get Ollama connection status & models list
app.get('/api/ollama/status', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      return res.json({ connected: false, error: 'Ollama responded with error code' });
    }
    const data = await response.json();
    const models = data.models || [];
    res.json({ connected: true, models });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// Route: Pull a new model
app.post('/api/ollama/pull', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }

    console.log(`Starting to pull Ollama model: ${model}`);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to pull model: status ${response.status} - ${errorText}`);
    }

    await response.json(); // Consume response body
    res.json({ success: true, message: `Model ${model} pulled successfully` });
  } catch (error) {
    console.error(`Error pulling model:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Get active loaded models currently in VRAM/RAM
app.get('/api/ollama/active', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/ps`);
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to query active models from Ollama' });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route: Preload a model into memory
app.post('/api/ollama/load', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    console.log(`Preloading model into memory: ${model}`);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        keep_alive: '20m', // keep loaded for 20 minutes
        stream: false
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to load model: status ${response.status} - ${errorText}`);
    }
    await response.json(); // Consume response body
    res.json({ success: true, message: `Model ${model} loaded successfully` });
  } catch (error) {
    console.error('Error preloading model:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Unload a model from memory (free RAM/VRAM)
app.post('/api/ollama/unload', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    console.log(`Unloading model from memory: ${model}`);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [],
        keep_alive: 0 // unload immediately
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unload model: status ${response.status} - ${errorText}`);
    }
    await response.json(); // Consume response body
    res.json({ success: true, message: `Model ${model} unloaded successfully` });
  } catch (error) {
    console.error('Error unloading model:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});

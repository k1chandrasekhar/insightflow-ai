const API_BASE_URL = 'http://localhost:5000/api';

export async function fetchItems() {
  const response = await fetch(`${API_BASE_URL}/items`);
  if (!response.ok) throw new Error('Failed to fetch items');
  return response.json();
}

export async function deleteItem(id) {
  const response = await fetch(`${API_BASE_URL}/items/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete item');
  return response.json();
}

export async function addItem(itemData) {
  const response = await fetch(`${API_BASE_URL}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemData),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to add item');
  }
  return response.json();
}

export async function uploadFile(formData) {
  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to upload file');
  }
  return response.json();
}

export async function queryRAG(queryData) {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryData),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to query database');
  }
  return response.json();
}

export async function fetchOllamaStatus() {
  const response = await fetch(`${API_BASE_URL}/ollama/status`);
  if (!response.ok) throw new Error('Failed to fetch Ollama status');
  return response.json();
}

export async function pullOllamaModel(model) {
  const response = await fetch(`${API_BASE_URL}/ollama/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to pull model');
  }
  return response.json();
}

// --- Session History Methods ---

export async function fetchSessions() {
  const response = await fetch(`${API_BASE_URL}/sessions`);
  if (!response.ok) throw new Error('Failed to fetch chat sessions');
  return response.json();
}

export async function createSession(title) {
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error('Failed to create chat session');
  return response.json();
}

export async function deleteSession(id) {
  const response = await fetch(`${API_BASE_URL}/sessions/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete chat session');
  return response.json();
}

export async function fetchSessionMessages(id) {
  const response = await fetch(`${API_BASE_URL}/sessions/${id}/messages`);
  if (!response.ok) throw new Error('Failed to fetch session messages');
  return response.json();
}

export async function fetchActiveModels() {
  const response = await fetch(`${API_BASE_URL}/ollama/active`);
  if (!response.ok) throw new Error('Failed to fetch active models');
  return response.json();
}

export async function loadOllamaModel(model) {
  const response = await fetch(`${API_BASE_URL}/ollama/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) throw new Error('Failed to load model');
  return response.json();
}

export async function unloadOllamaModel(model) {
  const response = await fetch(`${API_BASE_URL}/ollama/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) throw new Error('Failed to unload model');
  return response.json();
}

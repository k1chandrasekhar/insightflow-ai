import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import DocumentLibrary from './components/DocumentLibrary';
import Settings from './components/Settings';
import AddItemModal from './components/AddItemModal';
import { 
  fetchItems, 
  deleteItem, 
  fetchOllamaStatus,
  fetchSessions,
  createSession,
  deleteSession
} from './utils/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [items, setItems] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Collapsible Sidebar state (persisted)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  // Theme state (persisted)
  const [theme, setTheme] = useState(
    localStorage.getItem('theme') || 'dark-slate'
  );

  // Chat sessions list
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');

  // Ollama status & Model configuration
  const [ollamaStatus, setOllamaStatus] = useState({ connected: false, models: [] });
  const [chatModel, setChatModel] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [loadingItems, setLoadingItems] = useState(true);

  // Apply Collapsed State persistence
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  // Apply Theme styling changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'amoled') {
      root.style.setProperty('--bg-primary', '#000000');
      root.style.setProperty('--bg-secondary', '#050508');
      root.style.setProperty('--bg-tertiary', '#0a0a0f');
      root.style.setProperty('--sidebar-bg', '#000000');
      root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.05)');
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.01)');
      root.style.setProperty('--glass-border', '1px solid rgba(255, 255, 255, 0.04)');
      root.style.setProperty('--text-primary', '#f3f4f6');
      root.style.setProperty('--text-secondary', '#9ca3af');
      root.style.setProperty('--text-muted', '#6b7280');
      document.body.style.backgroundColor = '#000000';
    } else if (theme === 'light') {
      root.style.setProperty('--bg-primary', '#f8fafc');
      root.style.setProperty('--bg-secondary', '#ffffff');
      root.style.setProperty('--bg-tertiary', '#f1f5f9');
      root.style.setProperty('--sidebar-bg', '#e2e8f0');
      root.style.setProperty('--border-color', 'rgba(15, 23, 42, 0.08)');
      root.style.setProperty('--text-primary', '#0f172a');
      root.style.setProperty('--text-secondary', '#1e293b');
      root.style.setProperty('--text-muted', '#475569');
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.85)');
      root.style.setProperty('--glass-border', '1px solid rgba(15, 23, 42, 0.06)');
      document.body.style.backgroundColor = '#f8fafc';
    } else {
      // Default Dark Slate
      root.style.setProperty('--bg-primary', '#0a0b10');
      root.style.setProperty('--bg-secondary', 'rgba(18, 20, 29, 0.6)');
      root.style.setProperty('--bg-tertiary', 'rgba(25, 28, 41, 0.8)');
      root.style.setProperty('--sidebar-bg', 'rgba(10, 11, 16, 0.85)');
      root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--text-primary', '#f3f4f6');
      root.style.setProperty('--text-secondary', '#9ca3af');
      root.style.setProperty('--text-muted', '#6b7280');
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.03)');
      root.style.setProperty('--glass-border', '1px solid rgba(255, 255, 255, 0.06)');
      document.body.style.backgroundColor = '#0a0b10';
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Fetch bookmarks & notes
  const loadItems = async () => {
    try {
      setLoadingItems(true);
      const data = await fetchItems();
      setItems(data);
    } catch (err) {
      console.error('Failed to load library items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Fetch chat sessions list
  const loadSessionsList = async (selectNewest = false) => {
    try {
      const data = await fetchSessions();
      setSessions(data);
      if (data.length > 0) {
        if (selectNewest || !activeSessionId) {
          setActiveSessionId(data[0].id);
        }
      } else {
        handleCreateSession();
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    }
  };

  const handleCreateSession = async () => {
    try {
      const newS = await createSession('New Chat');
      setSessions(prev => [newS, ...prev]);
      setActiveSessionId(newS.id);
      setActiveTab('chat');
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  };

  const handleDeleteSession = async (id) => {
    if (window.confirm('Are you sure you want to delete this chat session? All its messages will be removed permanently.')) {
      try {
        await deleteSession(id);
        const remaining = sessions.filter(s => s.id !== id);
        setSessions(remaining);
        
        if (activeSessionId === id) {
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
          } else {
            handleCreateSession();
          }
        }
      } catch (err) {
        alert(`Failed to delete session: ${err.message}`);
      }
    }
  };

  // Check Ollama server connection & load available models
  const checkOllama = async () => {
    try {
      const status = await fetchOllamaStatus();
      setOllamaStatus(status);
      
      if (status.connected && status.models.length > 0) {
        const modelNames = status.models.map(m => m.name);
        
        if (!chatModel) {
          const defaultChat = modelNames.find(name => name.startsWith('llama3')) || modelNames[0];
          setChatModel(defaultChat);
        }

        if (!embedModel) {
          const defaultEmbed = modelNames.find(name => name.startsWith('nomic-embed-text')) || modelNames.find(name => name.startsWith('llama3')) || modelNames[0];
          setEmbedModel(defaultEmbed);
        }
      }
    } catch (err) {
      console.error('Failed to check Ollama status:', err);
      setOllamaStatus({ connected: false, models: [] });
    }
  };

  useEffect(() => {
    loadItems();
    loadSessionsList();
    checkOllama();
  }, []);

  const handleDeleteItem = async (id) => {
    if (window.confirm('Are you sure you want to delete this document? This will also remove its vector embeddings.')) {
      try {
        await deleteItem(id);
        setItems(prev => prev.filter(item => item.id !== id));
      } catch (err) {
        alert(`Failed to delete document: ${err.message}`);
      }
    }
  };

  const handleAddSuccess = () => {
    loadItems();
  };

  return (
    <div 
      className="app-container" 
      style={{ '--sidebar-width': isSidebarCollapsed ? '72px' : '260px' }}
    >
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        ollamaStatus={ollamaStatus} 
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleDeleteSession}
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
      />

      <main className="main-content">
        {activeTab === 'chat' && (
          <ChatInterface 
            chatModel={chatModel} 
            embedModel={embedModel} 
            itemsCount={items.length} 
            activeSessionId={activeSessionId}
            onSessionUpdate={() => {
              loadSessionsList(false);
              loadItems();
            }}
          />
        )}

        {activeTab === 'library' && (
          <DocumentLibrary 
            items={items} 
            onDeleteItem={handleDeleteItem} 
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === 'settings' && (
          <Settings 
            chatModel={chatModel} 
            setChatModel={setChatModel}
            embedModel={embedModel} 
            setEmbedModel={setEmbedModel}
            ollamaStatus={ollamaStatus}
            refreshOllama={checkOllama}
            itemsCount={items.length}
            theme={theme}
            setTheme={setTheme}
          />
        )}
      </main>

      <AddItemModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        onAddSuccess={handleAddSuccess}
        embedModel={embedModel}
      />
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Send, FileText, Link as LinkIcon, FileDown, Sparkles, BrainCircuit, Globe, Eye, Server, Plus, Download, Info, ExternalLink, X, User, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { queryRAG, fetchSessionMessages, uploadFile } from '../utils/api';

const truncateTitle = (title, maxLen = 20) => {
  if (!title) return '';
  if (title.length <= maxLen) return title;
  const extIndex = title.lastIndexOf('.');
  if (extIndex !== -1 && title.length - extIndex <= 6) {
    const ext = title.slice(extIndex);
    const base = title.slice(0, extIndex);
    const availableLength = maxLen - ext.length - 3;
    if (availableLength > 3) {
      return `${base.slice(0, availableLength)}...${ext}`;
    }
  }
  return `${title.slice(0, maxLen - 3)}...`;
};

export default function ChatInterface({ chatModel, embedModel, itemsCount, activeSessionId, onSessionUpdate }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('none'); // 'none' | 'local' | 'web'
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  // Custom states for new features
  const [activeCitation, setActiveCitation] = useState(null); // Interactive Citation Viewer
  const [pendingImage, setPendingImage] = useState(null); // { file, base64 }
  
  // Speech states (Text-to-Speech only)
  const [speakingMessageId, setSpeakingMessageId] = useState(null);

  // Stop speaking if session changes or component unmounts
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [activeSessionId]);

  const handleSpeak = (e, messageId, text) => {
    e.preventDefault();
    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    
    window.speechSynthesis.cancel(); // Stop any current speech
    
    // Strip markdown formatting and citations before speaking
    const cleanText = text
      .replace(/[\*\#\_\`\[\]\(\)]/g, '')
      .replace(/\[\d+\]/g, '');
      
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    utterance.onend = () => {
      setSpeakingMessageId(null);
    };
    
    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };
  
  // Profile name syncing for avatars and headers
  const [profileName, setProfileName] = useState(
    localStorage.getItem('profile-name') || 'Chand'
  );

  const messagesEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  // Sync profile name on localStorage updates
  useEffect(() => {
    const handleStorageChange = () => {
      setProfileName(localStorage.getItem('profile-name') || 'Chand');
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Sync mode based on library count
  useEffect(() => {
    if (itemsCount > 0) {
      setMode('local');
    } else {
      setMode('web');
    }
  }, [itemsCount]);

  // Group citations by document/link source to avoid duplicates in chips
  const getGroupedCitations = (citations) => {
    if (!citations) return [];
    const groups = {};
    
    citations.forEach(c => {
      const key = c.sourceUrl || c.sourceTitle;
      if (!groups[key]) {
        groups[key] = {
          sourceTitle: c.sourceTitle,
          sourceType: c.sourceType,
          sourceUrl: c.sourceUrl,
          similarity: c.similarity,
          text: c.text,
          chunks: [c]
        };
      } else {
        if (c.similarity > groups[key].similarity) {
          groups[key].similarity = c.similarity;
        }
        groups[key].chunks.push(c);
      }
    });
    
    return Object.values(groups);
  };

  // Load messages from database when active session changes
  useEffect(() => {
    const loadSessionHistory = async () => {
      if (!activeSessionId) return;
      setLoadingMessages(true);
      try {
        const data = await fetchSessionMessages(activeSessionId);
        setMessages(data.length > 0 ? data : [
          {
            role: 'assistant',
            content: 'Hello! I am your AI assistant. Ask me anything. I can chat offline, search your local Library, or browse the internet in real-time!',
            citations: []
          }
        ]);
      } catch (err) {
        console.error('Failed to load session history:', err);
      } finally {
        setLoadingMessages(false);
      }
    };
    loadSessionHistory();
  }, [activeSessionId]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading || !activeSessionId) return;

    const userQuery = query.trim();
    const currentPendingImage = pendingImage;
    
    setQuery('');
    setPendingImage(null);
    setLoading(true);

    // Get current RAG sliders configuration from local storage
    const topK = parseInt(localStorage.getItem('rag-top-k')) || 4;
    const similarityThreshold = parseFloat(localStorage.getItem('rag-threshold')) || 0.4;
    const hybridWeight = parseFloat(localStorage.getItem('rag-hybrid-weight')) || 0.5;

    // Append user message instantly
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userQuery, 
      timestamp: new Date().toISOString(),
      images: currentPendingImage ? [currentPendingImage.base64] : []
    }]);

    try {
      // Call RAG API
      const queryData = {
        query: userQuery,
        mode: mode,
        chatModel,
        sessionId: activeSessionId,
        ragSettings: {
          topK,
          similarityThreshold,
          hybridWeight
        }
      };

      if (currentPendingImage) {
        queryData.images = [currentPendingImage.base64];
      }

      const result = await queryRAG(queryData);

      // Append assistant response with metrics
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.response,
        citations: result.citations || [],
        metrics: result.metrics || null,
        timestamp: new Date().toISOString()
      }]);

      // Call callback to refresh sidebar session titles
      if (onSessionUpdate) {
        onSessionUpdate();
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}. Please verify that your local Ollama server is running.`,
        citations: [],
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleChatFileChange = async (e) => {
    if (e.target.files && e.target.files[0] && activeSessionId) {
      const file = e.target.files[0];
      
      // If it's an image, set it as pending image instead of indexing directly in library
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPendingImage({
            file,
            base64: reader.result
          });
        };
        reader.readAsDataURL(file);
        
        if (chatFileInputRef.current) {
          chatFileInputRef.current.value = '';
        }
        return;
      }
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⏳ Uploading and indexing file **${file.name}** to your local library...`,
        citations: [],
        timestamp: new Date().toISOString()
      }]);
      setLoading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);
        
        await uploadFile(formData);

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ Successfully uploaded and indexed **${file.name}**! It is now stored in your library and searchable.`,
          citations: [],
          timestamp: new Date().toISOString()
        }]);

        if (onSessionUpdate) {
          onSessionUpdate();
        }
      } catch (err) {
        console.error('File upload error:', err);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Failed to upload and index **${file.name}**: ${err.message}`,
          citations: [],
          timestamp: new Date().toISOString()
        }]);
      } finally {
        setLoading(false);
        if (chatFileInputRef.current) {
          chatFileInputRef.current.value = '';
        }
      }
    }
  };

  const handleExportMarkdown = () => {
    if (messages.length <= 1) return;
    
    let mdContent = `# InsightFlow AI Chat Session Export\n`;
    mdContent += `*Timestamp: ${new Date().toLocaleString()}*\n`;
    mdContent += `*Model: ${chatModel}*\n\n`;
    mdContent += `---\n\n`;

    messages.forEach((msg, idx) => {
      const roleName = msg.role === 'user' ? `👤 ${profileName}` : '🤖 InsightFlow AI';
      mdContent += `### **${roleName}**\n\n${msg.content}\n\n`;
      
      if (msg.metrics) {
        const speed = msg.metrics.evalCount / (msg.metrics.evalDuration / 1e9);
        const duration = msg.metrics.totalDuration / 1e9;
        mdContent += `*Inference Metrics: ${speed.toFixed(1)} t/s • ${duration.toFixed(1)}s total*\n\n`;
      }
      
      if (msg.citations && msg.citations.length > 0) {
        mdContent += `#### **Sources:**\n`;
        msg.citations.forEach((c, cIdx) => {
          mdContent += `${cIdx + 1}. **${c.sourceTitle}** (${c.sourceUrl || 'Local File'})\n`;
        });
        mdContent += `\n`;
      }
      mdContent += `---\n\n`;
    });

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insightflow_chat_${activeSessionId || Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCitationClick = (e, citation) => {
    e.preventDefault();
    setActiveCitation(citation);
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="chat-container">
      <div className="header-bar">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={24} style={{ color: 'var(--accent)' }} />
          <span>AI Research Copilot</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="doc-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BrainCircuit size={14} />
            <span>LLM: {chatModel}</span>
          </div>
          {messages.length > 1 && (
            <button 
              className="btn btn-secondary btn-icon" 
              onClick={handleExportMarkdown} 
              title="Export chat as Markdown"
              style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}
            >
              <Download size={13} />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>

      <div className="glass-panel chat-messages">
        {loadingMessages ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            <div className="status-dot online" style={{ animation: 'pulse 1s infinite alternate', marginRight: '10px' }} />
            <span>Loading history...</span>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id || index} style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '20px' }}>
                {/* Message Meta Info Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '6px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  paddingLeft: isUser ? '0' : '40px',
                  paddingRight: isUser ? '40px' : '0',
                  justifyContent: isUser ? 'flex-end' : 'flex-start'
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {isUser ? profileName : 'InsightFlow AI'}
                  </span>
                  <span>•</span>
                  <span>{formatTime(msg.timestamp || msg.id)}</span>
                </div>

                {/* Message Bubble */}
                <div className={`message-bubble ${msg.role}`} style={{ animation: 'none', margin: 0 }}>
                  <div className={`avatar ${msg.role}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isUser ? <User size={15} /> : <Sparkles size={15} />}
                  </div>
                  <div className="message-content">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>

                    {/* Render message images if any */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="message-images" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', marginBottom: '8px' }}>
                        {msg.images.map((img, idx) => (
                          <img 
                            key={idx}
                            src={img.startsWith('data:') ? img : `http://localhost:5000/${img}`} 
                            alt="Attached attachment" 
                            style={{ maxWidth: '240px', maxHeight: '160px', borderRadius: '8px', border: '1px solid var(--border-color)', objectFit: 'cover', cursor: 'pointer' }}
                          />
                        ))}
                      </div>
                    )}
                    
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="citations-container">
                        <div className="citations-title">
                          {mode === 'web' ? 'Web References (Click to view text)' : 'Library Sources (Click to view text)'}
                        </div>
                        <div className="citations-list">
                          {getGroupedCitations(msg.citations).map((c, i) => (
                            <a 
                              key={i}
                              href="#"
                              onClick={(e) => handleCitationClick(e, c)}
                              className="citation-chip"
                              title="Click to view retrieved context text snippets"
                            >
                              {c.sourceType === 'pdf' && <FileDown size={12} style={{ color: '#f87171' }} />}
                              {c.sourceType === 'link' && <LinkIcon size={12} style={{ color: '#60a5fa' }} />}
                              {c.sourceType === 'note' && <FileText size={12} style={{ color: '#34d399' }} />}
                              {c.sourceType === 'web' && <Globe size={12} style={{ color: '#a855f7' }} />}
                              <span>[{i + 1}] {truncateTitle(c.sourceTitle, 22)}</span>
                              {c.sourceType !== 'web' && (
                                <span style={{ fontSize: '10.5px', opacity: 0.7, fontWeight: 500 }}>
                                  ({Math.round(c.similarity * 100)}%)
                                </span>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Speaker (TTS) & Performance Metrics Badge */}
                    {msg.role === 'assistant' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon tts-btn"
                          onClick={(e) => handleSpeak(e, msg.id || index, msg.content)}
                          title={speakingMessageId === (msg.id || index) ? "Stop speaking" : "Speak response aloud (Text-to-Speech)"}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            display: 'flex',
                            gap: '4px',
                            alignItems: 'center',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderColor: speakingMessageId === (msg.id || index) ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.02)',
                            color: speakingMessageId === (msg.id || index) ? 'var(--accent-light)' : 'var(--text-muted)'
                          }}
                        >
                          {speakingMessageId === (msg.id || index) ? <VolumeX size={12} /> : <Volume2 size={12} />}
                          <span>{speakingMessageId === (msg.id || index) ? 'Stop' : 'Listen'}</span>
                        </button>

                        {msg.metrics && (
                          <div className="metrics-badge-container" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.02)',
                            width: 'fit-content'
                          }}
                          title={`Prompt eval: ${msg.metrics.promptEvalCount} tokens (${Math.round(msg.metrics.promptEvalDuration / 1e6)}ms) | Load: ${Math.round(msg.metrics.loadDuration / 1e6)}ms`}
                          >
                            <Info size={11} style={{ color: 'var(--accent-light)' }} />
                            <span>Speed: <strong>{((msg.metrics.evalCount / (msg.metrics.evalDuration / 1e9)) || 0).toFixed(1)} t/s</strong></span>
                            <span>•</span>
                            <span>Tokens: {msg.metrics.evalCount}</span>
                            <span>•</span>
                            <span>Inference: {((msg.metrics.evalDuration / 1e9) || 0).toFixed(2)}s</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {loading && (
          <div className="message-bubble assistant" style={{ margin: 0 }}>
            <div className="avatar assistant">
              <Sparkles size={15} />
            </div>
            <div className="message-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="status-dot online" style={{ animation: 'pulse 1s infinite alternate' }} />
                <span className="doc-meta">
                  {mode === 'web' ? 'Searching the web and synthesizing...' : `Thinking & analyzing using ${chatModel}...`}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-controls-wrapper">
        {pendingImage && (
          <div className="pending-image-preview-bar" style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            padding: '8px 12px',
            borderRadius: '10px',
            marginBottom: '10px',
            gap: '12px',
            width: 'fit-content',
            animation: 'scaleIn 0.2s ease-out'
          }}>
            <div style={{ position: 'relative' }}>
              <img 
                src={pendingImage.base64} 
                alt="Upload preview" 
                style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X size={10} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>{pendingImage.file.name}</span>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Image attached to query</span>
            </div>
          </div>
        )}


        {mode !== 'local' && itemsCount > 0 && (
          query.toLowerCase().includes('resume') || 
          query.toLowerCase().includes('pdf') || 
          query.toLowerCase().includes('document') || 
          query.toLowerCase().includes('library') || 
          query.toLowerCase().includes('uploaded')
        ) && (
          <div className="mode-reminder-banner" style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            color: '#c7d2fe',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12.5px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'scaleIn 0.2s ease-out'
          }}>
            <span>💡</span>
            <span>Tip: Select <strong>Local Library</strong> mode below to query your uploaded files.</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="chat-input-bar">
          {/* Add file button */}
          <button
            type="button"
            className="btn btn-secondary btn-icon add-file-chat-btn"
            onClick={() => chatFileInputRef.current?.click()}
            disabled={loading || loadingMessages}
            title="Attach a PDF, image, or text document directly"
          >
            <Plus size={16} />
          </button>
          
          <input 
            type="file"
            ref={chatFileInputRef}
            style={{ display: 'none' }}
            accept=".pdf,image/*,.txt,.md"
            onChange={handleChatFileChange}
          />

          <input 
            type="text"
            className="chat-input"
            placeholder={
              mode === 'local' 
                ? "Search local knowledge library..." 
                : mode === 'web'
                  ? "Search the web for real-time information..."
                  : "Ask anything (Direct LLM chat)..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading || loadingMessages}
          />


          <button 
            type="submit" 
            className="btn btn-primary btn-icon" 
            disabled={loading || loadingMessages || !query.trim()}
            style={{ padding: '8px 12px' }}
          >
            <Send size={14} />
          </button>
        </form>
        
        <div className="mode-selector-wrapper">
          <div className="mode-selector">
            <button
              type="button"
              className={`mode-btn ${mode === 'none' ? 'active' : ''}`}
              onClick={() => setMode('none')}
              disabled={loading || loadingMessages}
              title="Chat directly with Ollama offline LLM"
            >
              <Eye size={13} />
              <span>Direct Chat</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === 'local' ? 'active' : ''} ${itemsCount === 0 ? 'disabled' : ''}`}
              onClick={() => itemsCount > 0 && setMode('local')}
              disabled={itemsCount === 0 || loading || loadingMessages}
              title={itemsCount === 0 ? "Add files to Library first to enable Local RAG" : "Search local PDFs, bookmarks, and notes"}
            >
              <Server size={13} />
              <span>Local Library</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === 'web' ? 'active' : ''}`}
              onClick={() => setMode('web')}
              disabled={loading || loadingMessages}
              title="Search the internet in real-time"
            >
              <Globe size={13} />
              <span>Web Search</span>
            </button>
          </div>

          <div className="rag-status-text">
            {mode === 'none' && 'Offline Direct Chat'}
            {mode === 'local' && `Local RAG enabled (${itemsCount} items)`}
            {mode === 'web' && 'Online Web RAG enabled (Real-time)'}
          </div>
        </div>
      </div>

      {/* Interactive Citation Text Viewer Modal */}
      {activeCitation && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeCitation.sourceType === 'pdf' && <FileDown size={16} style={{ color: '#f87171' }} />}
                {activeCitation.sourceType === 'link' && <LinkIcon size={16} style={{ color: '#60a5fa' }} />}
                {activeCitation.sourceType === 'note' && <FileText size={16} style={{ color: '#34d399' }} />}
                {activeCitation.sourceType === 'web' && <Globe size={16} style={{ color: '#a855f7' }} />}
                <h3 className="modal-title" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {activeCitation.sourceTitle}
                </h3>
              </div>
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={() => setActiveCitation(null)}
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '350px', overflowY: 'auto', padding: '16px 0', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {activeCitation.chunks ? (
                activeCitation.chunks.map((chunk, idx) => (
                  <div key={idx} style={{ marginBottom: '14px', background: 'rgba(0, 0, 0, 0.2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Retrieved Context Snippet #{idx + 1}</span>
                      {chunk.similarity && chunk.sourceType !== 'web' && (
                        <span style={{ background: 'rgba(99, 102, 241, 0.08)', color: 'var(--accent-light)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                          Score: {Math.round(chunk.similarity * 100)}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      "{chunk.text}"
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                  "{activeCitation.text}"
                </div>
              )}
              
              {activeCitation.sourceUrl && (
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ExternalLink size={12} style={{ color: 'var(--accent-light)' }} />
                  <a 
                    href={activeCitation.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{ color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    Open Source Link
                  </a>
                </div>
              )}
            </div>
            
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
              {activeCitation.similarity && activeCitation.similarity < 1 && (
                <span className="doc-meta" style={{ fontSize: '12px' }}>
                  Highest Similarity: <strong>{Math.round(activeCitation.similarity * 100)}%</strong>
                </span>
              )}
              <button className="btn btn-primary" onClick={() => setActiveCitation(null)} style={{ marginLeft: 'auto', padding: '6px 14px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

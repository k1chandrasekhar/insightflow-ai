import React, { useState, useEffect } from 'react';
import { MessageSquare, FolderOpen, Settings, Brain, Radio, Plus, Trash2, ChevronLeft, ChevronRight, Hash } from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  ollamaStatus,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  isSidebarCollapsed,
  setIsSidebarCollapsed
}) {

  // Live profile name loading and syncing
  const [profileName, setProfileName] = useState(
    localStorage.getItem('profile-name') || 'Chand'
  );

  useEffect(() => {
    const handleStorageChange = () => {
      setProfileName(localStorage.getItem('profile-name') || 'Chand');
    };
    // Sync when localStorage updates anywhere in the app
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleSessionClick = (id) => {
    setActiveTab('chat');
    onSelectSession(id);
  };

  const avatarLetter = profileName ? profileName.charAt(0).toUpperCase() : 'C';

  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <div style={{ width: '100%' }}>
        {/* Logo and Toggle Header */}
        <div className="logo-container" style={{ display: 'flex', flexDirection: isSidebarCollapsed ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="logo-icon">
              <Brain size={18} />
            </div>
            {!isSidebarCollapsed && <span className="logo-text">InsightFlow</span>}
          </div>
          <button 
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer', 
              padding: '4px', 
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: isSidebarCollapsed ? '6px' : '0'
            }}
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <button 
          className="btn btn-primary new-chat-btn" 
          onClick={onCreateSession}
          title={isSidebarCollapsed ? "Start new chat" : ""}
          style={{ width: '100%', marginBottom: '20px', borderRadius: '10px', padding: isSidebarCollapsed ? '0' : '10px', display: 'flex', justifyContent: 'center', gap: isSidebarCollapsed ? '0' : '8px' }}
        >
          <Plus size={isSidebarCollapsed ? 14 : 16} />
          {!isSidebarCollapsed && <span>New Chat</span>}
        </button>

        {/* Chat History Section */}
        {!isSidebarCollapsed && (
          <div className="chat-history-section">
            <div className="history-header">Recent Chats</div>
            <div className="history-list">
              {sessions.map(s => (
                <div 
                  key={s.id} 
                  className={`history-item ${activeTab === 'chat' && activeSessionId === s.id ? 'active' : ''}`}
                  onClick={() => handleSessionClick(s.id)}
                >
                  <MessageSquare size={13} className="item-icon" />
                  <span className="item-title" title={s.title}>{s.title}</span>
                  <button 
                    className="delete-session-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    title="Delete chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="empty-history-text">No previous chats</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ width: '100%' }}>
        {/* Navigation Links */}
        <nav className="nav-links" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            className={`nav-link ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
            title={isSidebarCollapsed ? "Document Library" : ""}
          >
            <FolderOpen size={15} />
            {!isSidebarCollapsed && <span>Library</span>}
          </button>
          
          <button 
            className={`nav-link ${activeTab === 'graph' ? 'active' : ''}`}
            onClick={() => setActiveTab('graph')}
            title={isSidebarCollapsed ? "Knowledge Graph" : ""}
          >
            <Hash size={15} />
            {!isSidebarCollapsed && <span>Graph</span>}
          </button>
        </nav>

        {/* Sidebar Footer & Connection Badge */}
        {!isSidebarCollapsed && (
          <div className="sidebar-footer">
            <div className="ollama-status-badge">
              <Radio size={14} className={ollamaStatus.connected ? 'online' : 'offline'} />
              <div>
                <div style={{ fontWeight: 600 }}>Ollama Local</div>
                <div className="status-label" style={{ fontSize: '11px', color: ollamaStatus.connected ? '#10b981' : '#ef4444' }}>
                  {ollamaStatus.connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div className={`status-dot ${ollamaStatus.connected ? 'online' : 'offline'}`} />
            </div>
          </div>
        )}

        {/* User Profile Card (Unified settings portal) */}
        <div 
          className="user-profile-card"
          onClick={() => setActiveTab('settings')}
          title="Account & Settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: isSidebarCollapsed ? '6px 0' : '10px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            cursor: 'pointer',
            marginTop: '16px',
            justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
            width: '100%',
            transition: 'all 0.2s'
          }}
        >
          <div className="user-avatar" style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '12px',
            flexShrink: 0
          }}>
            {avatarLetter}
          </div>
          {!isSidebarCollapsed && (
            <div className="user-info" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span className="user-profile-name" style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{profileName}</span>
              <span className="user-profile-email" style={{ fontSize: '10.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '130px', fontWeight: 500 }}>
                Account & Settings
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

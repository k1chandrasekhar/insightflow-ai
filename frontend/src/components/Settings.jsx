import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Play, AlertCircle, RefreshCw, Database, Cpu, Power, User, Eye } from 'lucide-react';
import { pullOllamaModel, fetchActiveModels, loadOllamaModel, unloadOllamaModel } from '../utils/api';

export default function Settings({ 
  chatModel, 
  setChatModel, 
  embedModel, 
  setEmbedModel, 
  ollamaStatus, 
  refreshOllama,
  itemsCount,
  theme,
  setTheme
}) {
  const [newModelName, setNewModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);

  // Active loaded models in memory (RAM/VRAM)
  const [activeModels, setActiveModels] = useState([]);
  const [loadingActive, setLoadingActive] = useState(false);
  const [activeMsg, setActiveMsg] = useState('');
  const [selectedControlModel, setSelectedControlModel] = useState(chatModel || '');

  // User Profile Account Settings (persisted)
  const [username, setUsername] = useState(
    localStorage.getItem('profile-name') || 'Chand'
  );
  const [email, setEmail] = useState(
    localStorage.getItem('profile-email') || 'chand@example.com'
  );
  const [profileMsg, setProfileMsg] = useState('');

  const handlePullModel = async (e) => {
    e.preventDefault();
    if (!newModelName.trim()) return;

    setPulling(true);
    setStatusMsg(`Pulling model "${newModelName}"... This will take a few minutes. (Non-blocking, server is running)`);
    setIsError(false);

    try {
      await pullOllamaModel(newModelName.trim());
      setStatusMsg(`Success! Model "${newModelName}" is now downloaded.`);
      setNewModelName('');
      refreshOllama(); // Refresh models list
    } catch (err) {
      console.error(err);
      setIsError(true);
      setStatusMsg(`Error pulling model: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  const loadActiveModels = async () => {
    if (!ollamaStatus.connected) return;
    setLoadingActive(true);
    try {
      const data = await fetchActiveModels();
      setActiveModels(data.models || []);
    } catch (err) {
      console.error('Failed to get active models:', err);
    } finally {
      setLoadingActive(false);
    }
  };

  const handleStartModel = async () => {
    const targetModel = selectedControlModel || chatModel;
    if (!targetModel) {
      setActiveMsg('Please select a model to start.');
      return;
    }
    setActiveMsg(`Preloading model "${targetModel}" into system VRAM...`);
    try {
      await loadOllamaModel(targetModel);
      setActiveMsg(`🟢 Success! "${targetModel}" is now loaded in memory and ready for instant responses.`);
      loadActiveModels();
    } catch (err) {
      setActiveMsg(`❌ Error starting model: ${err.message}`);
    }
  };

  const handleStopModel = async (modelToStop) => {
    const targetModel = modelToStop || selectedControlModel || chatModel;
    if (!targetModel) {
      setActiveMsg('Please select a model to stop.');
      return;
    }
    setActiveMsg(`Unloading model "${targetModel}" from memory...`);
    try {
      await unloadOllamaModel(targetModel);
      setActiveMsg(`🔴 Success! "${targetModel}" has been ejected. RAM/VRAM resources are now free.`);
      loadActiveModels();
    } catch (err) {
      setActiveMsg(`❌ Error stopping model: ${err.message}`);
    }
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim()) {
      setProfileMsg('❌ Name and Email cannot be empty.');
      return;
    }
    localStorage.setItem('profile-name', username.trim());
    localStorage.setItem('profile-email', email.trim());
    setProfileMsg('✅ Profile settings saved successfully! (Reload to sync avatar)');
    
    // Refresh sidebar profile details immediately
    setTimeout(() => {
      window.dispatchEvent(new Event('storage'));
    }, 100);
  };

  useEffect(() => {
    if (ollamaStatus.connected) {
      loadActiveModels();
    }
  }, [ollamaStatus.connected, chatModel]);

  useEffect(() => {
    if (chatModel && !selectedControlModel) {
      setSelectedControlModel(chatModel);
    }
  }, [chatModel]);

  const models = ollamaStatus.models || [];

  const formatSize = (bytes) => {
    if (!bytes) return '0 GB';
    const gb = bytes / 1e9;
    return `${gb.toFixed(2)} GB`;
  };

  const formatExpiresAt = (expiryIso) => {
    if (!expiryIso) return '';
    try {
      const diffMs = new Date(expiryIso) - new Date();
      if (diffMs <= 0) return 'Expiring...';
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      return `Auto-unload in ${mins}m ${secs}s`;
    } catch (e) {
      return '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="header-bar">
        <h1 className="page-title">Settings</h1>
        <button 
          className="btn btn-secondary btn-icon" 
          onClick={() => { refreshOllama(); loadActiveModels(); }} 
          title="Refresh connection"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="settings-grid" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', paddingBottom: '20px' }}>
        
        {/* Account Profile Settings */}
        <div className="glass-panel settings-card">
          <h2 className="settings-card-title">
            <User size={18} style={{ color: 'var(--accent)' }} />
            <span>Account Profile Settings</span>
          </h2>
          
          <form onSubmit={handleSaveProfile} className="settings-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', background: 'rgba(255, 255, 255, 0.01)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '18px'
              }}>
                {username ? username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>{username}</div>
                <div style={{ fontSize: '11px', color: 'var(--accent-light)', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px', fontWeight: 600 }}>
                  Developer Tier (Local Free)
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Email Address</label>
              <input 
                type="email" 
                className="form-input" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }}>
              Save Profile Details
            </button>

            {profileMsg && (
              <div className="alert-box info" style={{ fontSize: '12px', marginTop: '12px', padding: '8px 12px' }}>
                {profileMsg}
              </div>
            )}
          </form>
        </div>

        {/* Theme and Appearance settings */}
        <div className="glass-panel settings-card">
          <h2 className="settings-card-title">
            <Eye size={18} style={{ color: 'var(--accent)' }} />
            <span>Appearance & Themes</span>
          </h2>
          
          <div className="settings-group">
            <div>
              <label className="form-label">Theme Mode</label>
              <select 
                className="form-select" 
                value={theme} 
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="dark-slate">Classic Dark (Midnight Slate)</option>
                <option value="amoled">Contrast Dark (AMOLED Black)</option>
                <option value="light">Glass Light (Vibrant Slate)</option>
              </select>
              <p className="doc-meta" style={{ marginTop: '4px' }}>Customizes app theme, borders, backgrounds, and custom properties dynamically.</p>
            </div>

            <div style={{ marginTop: '20px', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '6px' }}>Interface Customization Details</div>
              <div className="doc-meta" style={{ fontSize: '11px', lineHeight: 1.5 }}>
                Theme changes edit global CSS variables in real-time. AMOLED Black turns off background transparency to save battery, while Glass Light provides high readability.
              </div>
            </div>
          </div>
        </div>

        {/* Model Preferences */}
        <div className="glass-panel settings-card">
          <h2 className="settings-card-title">
            <SettingsIcon size={18} />
            <span>Model Preferences</span>
          </h2>
          
          <div className="settings-group">
            {ollamaStatus.connected ? (
              <>
                <div>
                  <label className="form-label">Active Chat LLM</label>
                  <select 
                    className="form-select" 
                    value={chatModel} 
                    onChange={(e) => setChatModel(e.target.value)}
                  >
                    {models.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({formatSize(m.size)})</option>
                    ))}
                    {models.length === 0 && <option value="">No models available</option>}
                  </select>
                  <p className="doc-meta" style={{ marginTop: '4px' }}>Used to synthesize answers using the retrieved chunks.</p>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label className="form-label">Active Embedding Model</label>
                  <select 
                    className="form-select" 
                    value={embedModel} 
                    onChange={(e) => setEmbedModel(e.target.value)}
                  >
                    {models.map(m => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                    {models.length === 0 && <option value="">No models available</option>}
                  </select>
                  <p className="doc-meta" style={{ marginTop: '4px' }}>
                    Used to generate vector embeddings. We recommend pulling <strong>nomic-embed-text</strong> for fast & accurate embeddings.
                  </p>
                </div>
              </>
            ) : (
              <div className="alert-box" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <AlertCircle size={16} />
                  <span>Ollama Offline</span>
                </div>
                <p style={{ marginTop: '6px' }}>Please make sure Ollama is running locally on your computer (typically on port 11434) and try refreshing.</p>
              </div>
            )}
          </div>
        </div>

        {/* Model RAM/VRAM Controller */}
        <div className="glass-panel settings-card">
          <h2 className="settings-card-title">
            <Cpu size={18} style={{ color: 'var(--accent)' }} />
            <span>LLM Hardware Memory Center</span>
          </h2>
          
          <div className="settings-group">
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="form-label" style={{ margin: 0 }}>Currently Loaded in RAM/VRAM:</span>
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={loadActiveModels} 
                disabled={loadingActive || !ollamaStatus.connected}
                style={{ padding: '2px 6px', fontSize: '11px', gap: '4px', marginLeft: 'auto' }}
              >
                <RefreshCw size={10} className={loadingActive ? 'spin' : ''} />
                Refresh Memory Status
              </button>
            </div>

            <div className="active-models-list" style={{ minHeight: '60px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px', padding: '10px', border: '1px solid var(--border-color)' }}>
              {activeModels.map(m => (
                <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'white' }}>{m.name}</div>
                    <div className="doc-meta" style={{ fontSize: '11px', display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <span>Size: {formatSize(m.size_vram)}</span>
                      <span>•</span>
                      <span>{formatExpiresAt(m.expires_at)}</span>
                    </div>
                  </div>
                  <button 
                    className="btn btn-secondary btn-icon"
                    onClick={() => handleStopModel(m.name)}
                    style={{ padding: '6px', color: '#f87171', background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                    title="Stop and unload from VRAM"
                  >
                    <Power size={13} />
                  </button>
                </div>
              ))}
              {activeModels.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0', fontStyle: 'italic' }}>
                  No models are currently running. Hardware resources are free.
                </div>
              )}
            </div>

            {ollamaStatus.connected && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <label className="form-label">Control Model Status</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <select 
                    className="form-select" 
                    value={selectedControlModel} 
                    onChange={(e) => setSelectedControlModel(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    {models.map(m => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => handleStartModel()} 
                    className="btn btn-primary"
                    style={{ flex: 1, background: '#10b981', borderColor: '#10b981', display: 'flex', justifyContent: 'center', gap: '6px' }}
                  >
                    <Power size={14} />
                    <span>Run (Load)</span>
                  </button>
                  <button 
                    onClick={() => handleStopModel()} 
                    className="btn btn-secondary"
                    style={{ flex: 1, borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', justifyContent: 'center', gap: '6px' }}
                  >
                    <Power size={14} />
                    <span>Stop (Unload)</span>
                  </button>
                </div>
              </div>
            )}

            {activeMsg && (
              <div className="alert-box info" style={{ fontSize: '12px', marginTop: '12px', padding: '8px 12px' }}>
                {activeMsg}
              </div>
            )}
          </div>
        </div>

        {/* Local Library Stats */}
        <div className="glass-panel settings-card">
          <h2 className="settings-card-title">
            <Database size={18} />
            <span>Local Library Stats</span>
          </h2>
          <div style={{ display: 'flex', gap: '40px', padding: '10px 0' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Indexed Documents</div>
              <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'white', marginTop: '4px' }}>
                {itemsCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Storage Type</div>
              <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'white', marginTop: '4px' }}>
                JSON
              </div>
            </div>
          </div>
        </div>

        {/* Pull Ollama Models */}
        <div className="glass-panel settings-card">
          <h2 className="settings-card-title">
            <Play size={18} />
            <span>Pull Ollama Models</span>
          </h2>
          <form onSubmit={handlePullModel} className="settings-group">
            <div>
              <label className="form-label">Model Name</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. nomic-embed-text or llama3" 
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  disabled={pulling || !ollamaStatus.connected}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={pulling || !newModelName.trim() || !ollamaStatus.connected}
                >
                  {pulling ? 'Pulling...' : 'Pull'}
                </button>
              </div>
            </div>

            {statusMsg && (
              <div className={`alert-box ${isError ? 'danger' : 'info'}`} style={isError ? { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5' } : {}}>
                {statusMsg}
              </div>
            )}
          </form>
        </div>

      </div>
    </div>
  );
}

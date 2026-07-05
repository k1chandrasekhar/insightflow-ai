import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { Info, FileText, Hash, Link as LinkIcon, FileDown, Search, HelpCircle, Image as ImageIcon } from 'lucide-react';

export default function KnowledgeGraph({ items }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null); // { id, label, type, items }
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ documents: 0, keywords: 0 });

  useEffect(() => {
    if (!containerRef.current || !items || items.length === 0) return;

    // 1. Build Nodes and Edges
    const nodes = [];
    const edges = [];
    const keywordMap = {}; // keyword -> array of item ids

    let docCount = 0;
    
    // Add document nodes
    items.forEach(item => {
      // Skip images if no keywords are extracted yet
      if (item.type === 'image' && !item.keywords) return;
      
      docCount++;
      nodes.push({
        id: `doc-${item.id}`,
        label: item.title.length > 20 ? item.title.slice(0, 17) + '...' : item.title,
        title: `Document: ${item.title}`,
        group: 'documents',
        shape: 'dot',
        size: 22,
        font: { color: '#ffffff', size: 12, face: 'Inter, sans-serif' },
        color: {
          background: '#8b5cf6',
          border: 'rgba(255,255,255,0.1)',
          highlight: { background: '#a78bfa', border: '#8b5cf6' }
        },
        shadow: { enabled: true, color: 'rgba(139, 92, 246, 0.2)', size: 10 }
      });

      // Track keywords
      const keywords = item.keywords || [];
      keywords.forEach(kw => {
        const cleanKw = kw.toLowerCase().trim();
        if (!keywordMap[cleanKw]) {
          keywordMap[cleanKw] = [];
        }
        keywordMap[cleanKw].push(item.id);
      });
    });

    let kwCount = 0;
    // Add keyword nodes and edges
    Object.entries(keywordMap).forEach(([kw, itemIds]) => {
      kwCount++;
      const kwNodeId = `kw-${kw}`;
      nodes.push({
        id: kwNodeId,
        label: kw,
        title: `Topic: ${kw} (${itemIds.length} references)`,
        group: 'keywords',
        shape: 'dot',
        size: 12 + Math.min(itemIds.length * 4, 15), // size scales with references!
        font: { color: '#e2e8f0', size: 11, face: 'Inter, sans-serif' },
        color: {
          background: '#0d9488',
          border: 'rgba(255,255,255,0.05)',
          highlight: { background: '#2dd4bf', border: '#0d9488' }
        },
        shadow: { enabled: true, color: 'rgba(13, 148, 136, 0.15)', size: 8 }
      });

      // Connect document nodes to this keyword node
      itemIds.forEach(itemId => {
        edges.push({
          from: `doc-${itemId}`,
          to: kwNodeId,
          color: { color: 'rgba(255, 255, 255, 0.1)', highlight: 'rgba(99, 102, 241, 0.4)' },
          width: 1
        });
      });
    });

    setStats({ documents: docCount, keywords: kwCount });

    // 2. Vis Network Configuration
    const data = { nodes, edges };
    const options = {
      nodes: {
        scaling: {
          min: 10,
          max: 30
        }
      },
      edges: {
        smooth: {
          type: 'continuous',
          forceDirection: 'none',
          roundness: 0.5
        }
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -26,
          centralGravity: 0.005,
          springLength: 90,
          springConstant: 0.18
        },
        maxVelocity: 146,
        solver: 'forceAtlas2Based',
        timestep: 0.35,
        stabilization: { iterations: 150, updateInterval: 25 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectable: true,
        selectConnectedEdges: true
      }
    };

    // Initialize Network
    const network = new Network(containerRef.current, data, options);
    networkRef.current = network;

    // Handle Selection Events
    network.on('selectNode', (params) => {
      const nodeId = params.nodes[0];
      if (!nodeId) return;

      if (nodeId.startsWith('doc-')) {
        const docId = nodeId.replace('doc-', '');
        const item = items.find(i => i.id === docId);
        if (item) {
          const docKeywords = item.keywords || [];
          setSelectedNode({
            id: nodeId,
            label: item.title,
            type: 'document',
            item: item,
            connected: docKeywords.map(kw => ({ id: `kw-${kw}`, label: kw }))
          });
        }
      } else if (nodeId.startsWith('kw-')) {
        const kw = nodeId.replace('kw-', '');
        const docIds = keywordMap[kw] || [];
        const connectedDocs = items.filter(i => docIds.includes(i.id));
        setSelectedNode({
          id: nodeId,
          label: kw,
          type: 'keyword',
          connected: connectedDocs
        });
      }
    });

    network.on('deselectNode', () => {
      setSelectedNode(null);
    });

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [items]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !networkRef.current) return;
    
    const queryLower = searchQuery.toLowerCase().trim();
    const network = networkRef.current;
    const allNodes = network.body.data.nodes.get();
    
    // Find matching node
    const match = allNodes.find(node => {
      const label = node.label || '';
      return label.toLowerCase().includes(queryLower);
    });

    if (match) {
      network.selectNodes([match.id]);
      network.focus(match.id, {
        scale: 1.2,
        animation: {
          duration: 1000,
          easingFunction: 'easeInOutQuad'
        }
      });
      
      // Manually trigger selection info
      if (match.id.startsWith('doc-')) {
        const docId = match.id.replace('doc-', '');
        const item = items.find(i => i.id === docId);
        if (item) {
          setSelectedNode({
            id: match.id,
            label: item.title,
            type: 'document',
            item: item,
            connected: (item.keywords || []).map(kw => ({ id: `kw-${kw}`, label: kw }))
          });
        }
      } else if (match.id.startsWith('kw-')) {
        const kw = match.id.replace('kw-', '');
        const connectedDocs = items.filter(i => (i.keywords || []).map(k => k.toLowerCase()).includes(kw));
        setSelectedNode({
          id: match.id,
          label: kw,
          type: 'keyword',
          connected: connectedDocs
        });
      }
    } else {
      alert(`No node matching "${searchQuery}" found.`);
    }
  };

  const handleSelectConnected = (nodeId) => {
    if (!networkRef.current) return;
    const network = networkRef.current;
    network.selectNodes([nodeId]);
    network.focus(nodeId, {
      scale: 1.2,
      animation: { duration: 800, easingFunction: 'easeInOutQuad' }
    });

    if (nodeId.startsWith('doc-')) {
      const docId = nodeId.replace('doc-', '');
      const item = items.find(i => i.id === docId);
      if (item) {
        setSelectedNode({
          id: nodeId,
          label: item.title,
          type: 'document',
          item: item,
          connected: (item.keywords || []).map(kw => ({ id: `kw-${kw}`, label: kw }))
        });
      }
    } else if (nodeId.startsWith('kw-')) {
      const kw = nodeId.replace('kw-', '');
      const connectedDocs = items.filter(i => (i.keywords || []).map(k => k.toLowerCase()).includes(kw));
      setSelectedNode({
        id: nodeId,
        label: kw,
        type: 'keyword',
        connected: connectedDocs
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="header-bar">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hash size={24} style={{ color: 'var(--accent)' }} />
          <span>Interactive Knowledge Graph</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="doc-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} />
            <span>Map of Documents & Topics</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden', paddingBottom: '20px' }}>
        
        {/* Graph Canvas */}
        <div style={{ flex: 3, position: 'relative', height: '100%' }}>
          {items.length === 0 ? (
            <div className="glass-panel empty-state" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <HelpCircle size={48} className="empty-icon" />
              <h3>Library is empty</h3>
              <p className="doc-meta" style={{ marginTop: '6px' }}>Import bookmarks, notes, or documents to construct your visual mind-map.</p>
            </div>
          ) : (
            <div 
              ref={containerRef} 
              className="glass-panel" 
              style={{ height: '100%', background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}
            />
          )}
        </div>

        {/* Info Sidebar */}
        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', minWidth: '300px' }}>
          
          {/* Node Search Bar */}
          {items.length > 0 && (
            <form onSubmit={handleSearch} className="glass-panel" style={{ padding: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search node title/topic..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
              />
              <button type="submit" className="btn btn-primary btn-icon" style={{ padding: '6px' }}>
                <Search size={14} />
              </button>
            </form>
          )}

          {/* Details Panel */}
          <div className="glass-panel" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedNode ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'white', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  Knowledge Base Overview
                </h3>
                
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Files Indexed</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-light)', marginTop: '2px' }}>{stats.documents}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Extracted Topics</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#2dd4bf', marginTop: '2px' }}>{stats.keywords}</div>
                  </div>
                </div>

                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', padding: '0 10px' }}>
                  <HelpCircle size={32} style={{ color: 'var(--text-muted)', alignSelf: 'center', marginBottom: '10px' }} />
                  <span>
                    Click a node on the canvas to inspect its relationships. Drag items to reposition, scroll to zoom, and search to highlight topics or files.
                  </span>
                </div>
              </div>
            ) : selectedNode.type === 'document' ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', padding: '6px', borderRadius: '6px' }}>
                    {selectedNode.item.type === 'pdf' && <FileDown size={16} />}
                    {selectedNode.item.type === 'link' && <LinkIcon size={16} />}
                    {selectedNode.item.type === 'note' && <FileText size={16} />}
                    {selectedNode.item.type === 'image' && <ImageIcon size={16} />}
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'white', margin: 0, wordBreak: 'break-all' }}>
                    {selectedNode.label}
                  </h3>
                </div>

                <div className="doc-meta" style={{ fontSize: '11px', marginBottom: '14px' }}>
                  Type: <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--accent-light)' }}>{selectedNode.item.type}</span>
                  {selectedNode.item.addedDate && ` • Added: ${new Date(selectedNode.item.addedDate).toLocaleDateString()}`}
                </div>

                {selectedNode.item.content && selectedNode.item.type !== 'image' && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Excerpt preview</div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', lineHeight: 1.5 }}>
                      "{selectedNode.item.content.length > 250 ? selectedNode.item.content.slice(0, 250) + '...' : selectedNode.item.content}"
                    </div>
                  </div>
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    Connected Topics ({selectedNode.connected.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedNode.connected.map(kw => (
                      <button 
                        key={kw.id} 
                        onClick={() => handleSelectConnected(kw.id)}
                        className="citation-chip" 
                        style={{ background: 'rgba(13, 148, 136, 0.08)', borderColor: 'rgba(13, 148, 136, 0.2)', color: '#2dd4bf', cursor: 'pointer', fontSize: '11px', padding: '4px 8px' }}
                      >
                        #{kw.label}
                      </button>
                    ))}
                    {selectedNode.connected.length === 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No topics extracted.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Selected Node is a Keyword/Topic
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <div style={{ background: 'rgba(13, 148, 136, 0.1)', color: '#2dd4bf', padding: '6px', borderRadius: '6px' }}>
                    <Hash size={16} />
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', margin: 0 }}>
                    Topic: {selectedNode.label}
                  </h3>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                    Associated Documents ({selectedNode.connected.length})
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedNode.connected.map(doc => (
                      <div 
                        key={doc.id} 
                        onClick={() => handleSelectConnected(`doc-${doc.id}`)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '10px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        className="hover-highlight"
                      >
                        <div style={{ color: doc.type === 'pdf' ? '#f87171' : doc.type === 'link' ? '#60a5fa' : '#34d399' }}>
                          {doc.type === 'pdf' && <FileDown size={14} />}
                          {doc.type === 'link' && <LinkIcon size={14} />}
                          {doc.type === 'note' && <FileText size={14} />}
                          {doc.type === 'image' && <ImageIcon size={14} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {doc.title}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                            {doc.type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Plus, Trash2, Link as LinkIcon, FileText, FileDown, FolderOpen, Image as ImageIcon } from 'lucide-react';

const truncateTitle = (title, maxLen = 24) => {
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

export default function DocumentLibrary({ items, onDeleteItem, onOpenAddModal }) {
  const [filter, setFilter] = useState('all');

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getExcerpt = (text) => {
    if (!text) return '';
    return text.length > 90 ? `${text.slice(0, 90).trim()}...` : text;
  };

  const getWordCountText = (item) => {
    if (item.type === 'image') return 'Image file';
    if (!item.content) return '';
    const words = item.content.trim().split(/\s+/).filter(Boolean).length;
    if (words === 0) return '';
    return `${words} words`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="header-bar">
        <h1 className="page-title">Library</h1>
        <button className="btn btn-primary" onClick={onOpenAddModal}>
          <Plus size={16} />
          <span>Add to Library</span>
        </button>
      </div>

      <div className="library-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Items
        </button>
        <button 
          className={`filter-btn ${filter === 'pdf' ? 'active' : ''}`}
          onClick={() => setFilter('pdf')}
        >
          PDFs
        </button>
        <button 
          className={`filter-btn ${filter === 'link' ? 'active' : ''}`}
          onClick={() => setFilter('link')}
        >
          Bookmarks
        </button>
        <button 
          className={`filter-btn ${filter === 'note' ? 'active' : ''}`}
          onClick={() => setFilter('note')}
        >
          Notes
        </button>
        <button 
          className={`filter-btn ${filter === 'image' ? 'active' : ''}`}
          onClick={() => setFilter('image')}
        >
          Images
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="glass-panel empty-state">
          <FolderOpen size={48} className="empty-icon" />
          <h3>No items in this section</h3>
          <p className="doc-meta" style={{ marginTop: '6px' }}>Click "Add to Library" above to import your first PDF, bookmark, or note.</p>
        </div>
      ) : (
        <div className="library-grid">
          {filteredItems.map(item => (
            <div key={item.id} className={`glass-panel doc-card ${item.type}`}>
              <div className="card-main">
                <div className="doc-header">
                  <div className="doc-type-icon">
                    {item.type === 'pdf' && <FileDown size={18} />}
                    {item.type === 'link' && <LinkIcon size={18} />}
                    {item.type === 'note' && <FileText size={18} />}
                    {item.type === 'image' && <ImageIcon size={18} />}
                  </div>
                  <span className="doc-meta">{formatDate(item.addedDate)}</span>
                </div>
                
                <h3 className="doc-title" title={item.title}>
                  {truncateTitle(item.title, 26)}
                </h3>

                {item.type === 'image' ? (
                  <div className="card-image-preview">
                    <img 
                      src={`http://localhost:5000/${item.filepath.replace(/\\/g, '/')}`} 
                      alt={item.title} 
                      className="card-img"
                    />
                  </div>
                ) : item.type === 'link' ? (
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="doc-link-display"
                    title={item.url}
                  >
                    {item.url}
                  </a>
                ) : (
                  <p className="doc-snippet-text">
                    {getExcerpt(item.content)}
                  </p>
                )}
              </div>

              <div className="doc-footer">
                <div className="doc-badge-stat">
                  <span className={`doc-type-badge badge-${item.type}`}>
                    {item.type === 'link' ? 'bookmark' : item.type}
                  </span>
                  <span className="doc-word-count">
                    {getWordCountText(item)}
                  </span>
                </div>
                
                <button 
                  className="delete-card-btn" 
                  onClick={() => onDeleteItem(item.id)}
                  title="Delete item"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

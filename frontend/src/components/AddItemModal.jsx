import React, { useState, useRef } from 'react';
import { X, Upload, Link, FileText, FileDown } from 'lucide-react';
import { addItem, uploadFile } from '../utils/api';

export default function AddItemModal({ isOpen, onClose, onAddSuccess, embedModel }) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('pdf'); // 'pdf' means file upload here
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Note / Bookmark state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');

  // File state
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setUrl('');
    setSelectedFile(null);
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateFile = (file) => {
    const isImage = file.type.startsWith('image/');
    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    const isAllowed = allowedTypes.includes(file.type) || isImage || file.name.endsWith('.txt') || file.name.endsWith('.md');
    
    if (!isAllowed) {
      setError('Unsupported file type. Please upload a PDF, image, or text file (.txt/.md).');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (activeTab === 'pdf') {
        if (!selectedFile) {
          setError('Please select a file first.');
          setLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', selectedFile);
        await uploadFile(formData);
      } else {
        if (!title.trim() || !content.trim()) {
          setError('Title and Content are required.');
          setLoading(false);
          return;
        }

        const payload = {
          title: title.trim(),
          content: content.trim(),
          type: activeTab
        };

        if (activeTab === 'link') {
          payload.url = url.trim();
        }

        await addItem(payload);
      }

      onAddSuccess();
      handleClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during submission.');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setError('');
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setError('');
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content">
        <div className="modal-header">
          <h2 className="modal-title">Add to Library</h2>
          <button className="btn btn-secondary btn-icon" onClick={handleClose} disabled={loading} style={{ padding: '4px', borderRadius: '50%' }}>
            <X size={16} />
          </button>
        </div>

        <div className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'pdf' ? 'active' : ''}`}
            onClick={() => { setActiveTab('pdf'); setError(''); }}
            disabled={loading}
          >
            <FileDown size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            File Upload
          </button>
          <button 
            className={`tab-btn ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => { setActiveTab('link'); setError(''); }}
            disabled={loading}
          >
            <Link size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Bookmark
          </button>
          <button 
            className={`tab-btn ${activeTab === 'note' ? 'active' : ''}`}
            onClick={() => { setActiveTab('note'); setError(''); }}
            disabled={loading}
          >
            <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Note
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert-box danger" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            {activeTab === 'pdf' && (
              <div 
                className={`upload-zone ${dragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".pdf,image/*,.txt,.md" 
                  style={{ display: 'none' }}
                />
                <Upload size={32} className="upload-icon" />
                {selectedFile ? (
                  <div>
                    <p className="upload-text" style={{ color: 'white', fontWeight: 600 }}>{selectedFile.name}</p>
                    <p className="upload-subtext">Click or drag another file to replace</p>
                  </div>
                ) : (
                  <div>
                    <p className="upload-text">Click or drag file here to upload</p>
                    <p className="upload-subtext">Supported formats: PDF, Image, Text (.txt/.md)</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'link' && (
              <>
                <div className="form-group">
                  <label className="form-label">Article/Webpage Title</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. LLM RAG Guide" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Source URL</label>
                  <input 
                    type="url" 
                    className="form-input" 
                    placeholder="https://example.com/rag-guide" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Article Text Content (Optional)</label>
                  <textarea 
                    className="form-input" 
                    placeholder="Paste the webpage content manually, OR leave blank to auto-scrape the text directly from the URL!" 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
              </>
            )}

            {activeTab === 'note' && (
              <>
                <div className="form-group">
                  <label className="form-label">Note Title</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Study Notes: Neural Networks" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Note Content (Markdown supported)</label>
                  <textarea 
                    className="form-input" 
                    placeholder="Write your markdown note here..." 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Uploading & Processing...' : 'Add to Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

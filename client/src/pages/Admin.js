import React, { useState } from 'react';
import { Upload, BookOpen, Layers, BarChart2, Lock } from 'lucide-react';
import { API_URL } from '../utils/apiConfig';
import './Admin.css';

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [sections, setSections] = useState([]);
  const [sectionForm, setSectionForm] = useState({ title: '', route: '', keywords: '', layout: 'scroll' });
  const [sectionEdits, setSectionEdits] = useState({});
    
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    description: '',
    category: '',
    coverFile: null,
    readingTime: '',
    rating: '',
    pdf: null,
    pdfParts: [], // Array of { partNumber, file }
    isTrending: false
  });
  const [books, setBooks] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('books');

  const MAX_PDF_PARTS = 10;

  const handleLogin = (e) => {
    e.preventDefault();
    if (adminPassword.trim()) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Please enter the admin password');
    }
  };

  
  
  
  
  
  React.useEffect(() => {
    if (isAuthenticated) {
      fetchBooks();
      fetchSections();
    }
  }, [isAuthenticated]);

  const fetchSections = async () => {
    try {
      const ts = Date.now();
      const response = await fetch(`${API_URL || ''}/api/sections?_ts=${ts}`, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) throw new Error('Unexpected response type');
      const data = await response.json();
      setSections(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching sections:', err);
      setSections([]);
    }
  };

  const handleCreateSection = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_URL || ''}/api/admin/sections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({
          title: sectionForm.title,
          route: sectionForm.route,
          keywords: sectionForm.keywords,
          layout: sectionForm.layout
        })
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j.error || msg;
          }
        } catch {}
        throw new Error(msg);
      }

      await response.json();
      setSuccess('Section created');
      setSectionForm({ title: '', route: '', keywords: '', layout: 'scroll' });
      fetchSections();
    } catch (err) {
      console.error('Create section error:', err);
      setError(err.message || 'Failed to create section');
    } finally {
      setLoading(false);
    }
  };


  const handleSaveSection = async (section) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const edit = sectionEdits[section.id] || {};
      const payload = {
        title: edit.title !== undefined ? edit.title : section.title,
        route: edit.route !== undefined ? edit.route : section.route,
        keywords: edit.keywords !== undefined ? edit.keywords : (Array.isArray(section.keywords) ? section.keywords.join(', ') : ''),
        layout: edit.layout !== undefined ? edit.layout : (section.layout || 'scroll')
      };

      const response = await fetch(`${API_URL || ''}/api/admin/sections/${encodeURIComponent(section.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j.error || msg;
          }
        } catch {}
        throw new Error(msg);
      }

      await response.json();
      setSuccess('Section updated');
      setSectionEdits((prev) => {
        const next = { ...prev };
        delete next[section.id];
        return next;
      });
      fetchSections();
    } catch (err) {
      console.error('Update section error:', err);
      setError(err.message || 'Failed to update section');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSection = async (section) => {
    if (!window.confirm('Delete this section?')) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_URL || ''}/api/admin/sections/${encodeURIComponent(section.id)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-admin-password': adminPassword
        }
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j.error || msg;
          }
        } catch {}
        throw new Error(msg);
      }

      await response.json();
      setSuccess('Section deleted');
      fetchSections();
    } catch (err) {
      console.error('Delete section error:', err);
      setError(err.message || 'Failed to delete section');
    } finally {
      setLoading(false);
    }
  };

  const fetchBooks = async () => {
    setListLoading(true);
    try {
      const response = await fetch(`${API_URL || ''}/api/books`, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) throw new Error('Unexpected response type');
      const data = await response.json();
      setBooks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching books:', err);
    } finally {
      setListLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };


  const handleCoverFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({
        ...prev,
        coverFile: e.target.files[0]
      }));
    }
  };

  const handleEdit = (book) => {
    setEditingId(book.id);
    setFormData({
      title: book.title || '',
      author: book.author || '',
      description: book.description || '',
      category: book.category || '',
      telegramLink: book.telegramLink || '',
      coverFile: null,
      readingTime: book.readingTime || '',
      rating: book.rating || '',
      pdf: null,
      pdfParts: book.pdfParts ? book.pdfParts.map((p, i) => ({ partNumber: p.partNumber || i + 1, file: null })) : [],
      isTrending: !!book.isTrending
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this book?')) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_URL || ''}/api/admin/books/${id}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'x-admin-password': adminPassword
        }
      });
      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j.error || msg;
          }
        } catch {}
        throw new Error(msg);
      }
      await response.json();
      setSuccess('Book deleted');
      fetchBooks();
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTrending = async (book) => {
    try {
      const response = await fetch(`${API_URL || ''}/api/admin/books/${book.id}/trending`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ isTrending: !book.isTrending })
      });
      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j.error || msg;
          }
        } catch {}
        throw new Error(msg);
      }
      await response.json();
      setSuccess(`Trending ${!book.isTrending ? 'enabled' : 'disabled'}`);
      fetchBooks();
    } catch (err) {
      console.error('Trending toggle error:', err);
      setError(err.message || 'Failed to update trending status');
    }
  };

  const handlePdfFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({
        ...prev,
        pdf: e.target.files[0]
      }));
    }
  };

  const validateFields = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = 'Title is required';
    if (!formData.author.trim()) errors.author = 'Author is required';
    if (!formData.category) errors.category = 'Category is required';
    
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateFields();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Please fill in all required fields');
      return;
    }

    const hasParts =
      formData.pdfParts.length > 0 &&
      formData.pdfParts.some((p) => p.file);
    
    setLoading(true);
    setError('');
    setSuccess('');
    setFieldErrors({});

    try {
      const formDataToSend = new FormData();
      
      // Add single PDF if provided
      if (formData.pdf) formDataToSend.append('pdf', formData.pdf);
      
      // Add PDF parts if provided (for comics)
      if (hasParts) {
        formData.pdfParts
          .filter((p) => p.file && p.partNumber <= MAX_PDF_PARTS)
          .forEach((part) => {
            formDataToSend.append(`pdfPart${part.partNumber}`, part.file);
          });
        formDataToSend.append('hasParts', 'true');
        const count = formData.pdfParts.filter((p) => p.file && p.partNumber <= MAX_PDF_PARTS).length;
        formDataToSend.append('partsCount', count.toString());
      }
      
      if (formData.coverFile) formDataToSend.append('coverImage', formData.coverFile);
      formDataToSend.append('title', formData.title);
      formDataToSend.append('author', formData.author);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('readingTime', formData.readingTime);
      formDataToSend.append('rating', formData.rating);
      formDataToSend.append('isTrending', formData.isTrending);

      const url = editingId ? `${API_URL || ''}/api/admin/books/${editingId}` : `${API_URL || ''}/api/admin/books`;
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'x-admin-password': adminPassword
        },
        body: formDataToSend
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j.error || msg;
          }
        } catch {}
        throw new Error(msg);
      }

      await response.json();

      setSuccess(editingId ? 'Book updated successfully!' : 'Book uploaded successfully!');
      setFormData({
        title: '',
        author: '',
        description: '',
        category: '',
        coverFile: null,
        readingTime: '',
        rating: '',
        pdf: null,
        pdfParts: [],
        isTrending: false
      });
      setEditingId(null);
      fetchBooks();
    } catch (err) {
      console.error('Save error:', err);
      setError(err.message || 'Save failed. Check server logs or Backblaze configuration.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-container">
        <div className="admin-login-card">
          <div className="login-icon">
            <Lock size={48} />
          </div>
          <h2>Admin Login</h2>
          <p>Enter the admin password to manage books</p>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <input
                type="password"
                placeholder="Admin Password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="form-input"
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn-primary">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-content">
        {/* Tabs */}
        <div className="admin-tabs">
          <button
            type="button"
            className={`admin-tab ${activeTab === 'books' ? 'active' : ''}`}
            onClick={() => setActiveTab('books')}
          >
            <BookOpen size={20} />
            Books
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === 'sections' ? 'active' : ''}`}
            onClick={() => setActiveTab('sections')}
          >
            <Layers size={20} />
            Sections
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={20} />
            Analytics
          </button>
        </div>

        {activeTab === 'books' && (
          <>
            <div className="admin-header">
              <h1>
                <BookOpen size={32} />
                {editingId ? 'Edit Book' : 'Upload New Book'}
              </h1>
          <p>
            {editingId
              ? 'Update the book details. Upload new files only if you want to replace them.'
              : 'Fill in the book details and upload the PDF file'}
          </p>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f4f8', borderRadius: '4px', fontSize: '0.9rem' }}>
            <strong>📚 Category Guide:</strong>
            <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
              <li><strong>ရသစာပေ</strong> → Shows in "ရသစာပေများ" section</li>
              <li><strong>အောင်မြင်ရေး</strong> → Shows in "အောင်မြင်ရေးစာပေများ" section</li>
              <li><strong>ရုပ်ပြ</strong> → Shows in "ရုပ်ပြစာအုပ်များ" section</li>
              <li><strong>ဝတ္ထုတို</strong> → Shows in "ဝတ္ထုတိုများ" section</li>
              <li><strong>သုတ</strong> → Shows in "သုတစာပေများ" section</li>
              <li><strong>ကဗျာ</strong> → Shows in "ကဗျာစာအုပ်များ" section</li>
              <li><strong>ဘာသာပြန်</strong> → Shows in "ဘာသာပြန်စာအုပ်များ" section</li>
              <li><strong>ဘာသာရေး</strong> → Shows in "ဘာသာရေးစာအုပ်များ" section</li>
            </ul>
          </div>
        </div>

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="admin-form">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="title">Title *</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className={`form-input ${fieldErrors.title ? 'error' : ''}`}
                required
                placeholder="Enter book title"
              />
              {fieldErrors.title && <small className="field-error">{fieldErrors.title}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="author">Author *</label>
              <input
                type="text"
                id="author"
                name="author"
                value={formData.author}
                onChange={handleInputChange}
                className={`form-input ${fieldErrors.author ? 'error' : ''}`}
                required
                placeholder="Enter author name"
              />
              {fieldErrors.author && <small className="field-error">{fieldErrors.author}</small>}
            </div>

            <div className="form-group full-width">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="form-textarea"
                rows="4"
                placeholder="Enter book description"
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Category *</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className={`form-input ${fieldErrors.category ? 'error' : ''}`}
                required
              >
                <option value="">အမျိုးအစားရွေးပါ...</option>
                <optgroup label="ပင်မစာမျက်နှာ အပိုင်းများ">
                  {sections && sections.length > 0 ? (
                    sections
                      .filter((s) => s && s.route)
                      .map((s) => (
                        <option key={s.id || s.route} value={s.route}>
                          {s.title || s.route}
                        </option>
                      ))
                  ) : (
                    <>
                      <option value="ရသစာပေ">တာရာပွကြီး</option>
                      <option value="အောင်မြင်ရေး">အောင်မြင်ရေးစာပေများ</option>
                      <option value="ရုပ်ပြ">မြိုင်ရာဇာ တွတ်ပီ </option>
                      <option value="ဝတ္ထုတို">ဘိုဘို</option>
                      <option value="ကိုတင့် ကိုရွှေထူး">ကိုတင့် ကိုရွှေထူး</option>
                      <option value="ကာတွန်းနှင့်ရုပ်ပြများ">ကာတွန်းနှင့်ရုပ်ပြများ</option>
                      <option value="သုတ">သုတစာပေများ</option>
                      <option value="ကဗျာ">ကဗျာစာအုပ်များ</option>
                      <option value="ဘာသာပြန်">ဘာသာပြန်စာအုပ်များ</option>
                      <option value="ဘာသာရေး">ဘာသာရေးစာပေများ</option>
                    </>
                  )}
                </optgroup>
                <optgroup label="အခြားအမျိုးအစားများ (အင်္ဂလိပ်)">
                  <option value="fiction">Fiction</option>
                  <option value="literature">Literature</option>
                  <option value="romance">Romance</option>
                  <option value="drama">Drama</option>
                  <option value="horror">Horror</option>
                  <option value="mystery">Mystery</option>
                  <option value="science fiction">Science Fiction</option>
                  <option value="fantasy">Fantasy</option>
                  <option value="non-fiction">Non-Fiction</option>
                  <option value="poetry">Poetry</option>
                  <option value="comic">Comic</option>
                </optgroup>
              </select>
              {fieldErrors.category && <small className="field-error">{fieldErrors.category}</small>}
              <small className="form-hint">
                Select a category to organize your book. Books with Burmese categories will appear in their corresponding sections on the home page.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="coverFile">Cover Image (optional)</label>
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="coverFile"
                  name="coverFile"
                  accept="image/*"
                  onChange={handleCoverFileChange}
                  className="file-input"
                />
                <label htmlFor="coverFile" className="file-label">
                  <Upload size={20} />
                  {formData.coverFile ? formData.coverFile.name : 'Choose cover image (JPG, PNG, etc.)'}
                </label>
              </div>
              <small className="form-hint">
                Leave empty to auto-generate a cover.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="readingTime">Reading Time</label>
              <input
                type="text"
                id="readingTime"
                name="readingTime"
                value={formData.readingTime}
                onChange={handleInputChange}
                className="form-input"
                placeholder="e.g., 4h 30m"
              />
            </div>

            <div className="form-group">
              <label htmlFor="rating">Rating</label>
              <input
                type="number"
                id="rating"
                name="rating"
                value={formData.rating}
                onChange={handleInputChange}
                className="form-input"
                min="0"
                max="5"
                step="0.1"
                placeholder="0-5"
              />
            </div>

            <div className="form-group">
              <label htmlFor="isTrending">Trending</label>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="isTrending"
                  name="isTrending"
                  checked={formData.isTrending}
                  onChange={(e) => setFormData(prev => ({ ...prev, isTrending: e.target.checked }))}
                />
                <span>Show in Trending section</span>
              </div>
            </div>

            <div className="form-group full-width">
              <label htmlFor="pdf">PDF File *</label>
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="pdf"
                  name="pdf"
                  accept=".pdf"
                  onChange={handlePdfFileChange}
                  className={`file-input ${fieldErrors.pdf ? 'error' : ''}`}
                  required={false}
                />
                <label htmlFor="pdf" className="file-label">
                  <Upload size={20} />
                  {formData.pdf ? formData.pdf.name : 'Choose PDF file (or use Parts below)'}
                </label>
              </div>
              {fieldErrors.pdf && <small className="field-error">{fieldErrors.pdf}</small>}
              <small className="form-hint">
                Optional. You can leave this empty if you are only using Telegram links.
              </small>
            </div>

            <div className="form-group full-width">
              <label>PDF Parts (Online Reading)</label>
              <div className="pdf-parts-upload">
                <div className="parts-list">
                  {formData.pdfParts.map((part, index) => (
                    <div key={index} className="part-item">
                      <span className="part-number">Part {part.partNumber}</span>
                      <span className="part-file-name">{part.file ? part.file.name : 'No file'}</span>
                      <button
                        type="button"
                        className="btn-remove-part"
                        onClick={() => {
                          const newParts = formData.pdfParts.filter((_, i) => i !== index);
                          newParts.forEach((p, i) => { p.partNumber = i + 1; });
                          setFormData(prev => ({ ...prev, pdfParts: newParts }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-add-part"
                  onClick={() => {
                    if (formData.pdfParts.length >= MAX_PDF_PARTS) return;
                    const partNumber = formData.pdfParts.length + 1;
                    setFormData(prev => ({
                      ...prev,
                      pdfParts: [...prev.pdfParts, { partNumber, file: null }]
                    }));
                  }}
                >
                  + Add Part {formData.pdfParts.length + 1}
                </button>
                {formData.pdfParts.length > 0 &&
                  formData.pdfParts.map((part, index) => (
                    <div key={index} className="part-file-input">
                      <label htmlFor={`partFile${index}`} className="part-file-label">
                        Part {part.partNumber} PDF:
                      </label>
                      <input
                        type="file"
                        id={`partFile${index}`}
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const newParts = [...formData.pdfParts];
                            newParts[index].file = file;
                            setFormData(prev => ({ ...prev, pdfParts: newParts }));
                          }
                        }}
                        className="file-input"
                      />
                    </div>
                  ))}
              </div>
              <small className="form-hint">
                Upload multiple PDF files as Part 1, Part 2, etc. (Max {MAX_PDF_PARTS} parts). Leave single PDF field empty if using parts.
              </small>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => setIsAuthenticated(false)}
              className="btn-secondary"
            >
              Logout
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading
                ? editingId ? 'Saving...' : 'Uploading...'
                : editingId ? 'Save Changes' : 'Upload Book'}
            </button>
          </div>
        </form>

        <div className="admin-header" style={{ marginTop: '2rem' }}>
          <h2>Manage Books</h2>
          <p>Edit, delete, or toggle trending status.</p>
        </div>

        {listLoading ? (
          <div>Loading books...</div>
        ) : (
          <div className="books-table">
            <div className="books-table-header">
              <div>Title</div>
              <div>Author</div>
              <div>Category</div>
              <div>Trending</div>
              <div>Actions</div>
            </div>
            {books.map((book) => (
              <div className="books-table-row" key={book.id}>
                <div className="cell title">{book.title}</div>
                <div className="cell">{book.author}</div>
                <div className="cell">{book.category}</div>
                <div className="cell">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={!!book.isTrending}
                      onChange={() => handleToggleTrending(book)}
                    />
                    <span className="slider" />
                  </label>
                </div>
                <div className="cell actions">
                  <button type="button" className="btn-secondary" onClick={() => handleEdit(book)}>
                    Edit
                  </button>
                  <button type="button" className="btn-danger" onClick={() => handleDelete(book.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {books.length === 0 && <div className="empty-row">No books yet</div>}
          </div>
        )}
          </>
        )}

        {activeTab === 'analytics' && (
          <>
            <div className="admin-header">
              <h1>
                <BarChart2 size={32} />
                Analytics
              </h1>
              <p>View your website visits in Google Analytics (GA4).</p>
            </div>

            <div className="admin-form">
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => window.open('https://analytics.google.com/analytics/web/', '_blank', 'noreferrer')}
                >
                  Open Google Analytics
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'sections' && (
          <>
            <div className="admin-header">
              <h1>
                <Layers size={32} />
                Manage Sections
              </h1>
              <p>Create new sections and edit section names shown on the home page.</p>
            </div>

            {success && (
              <div className="success-message">
                {success}
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSection} className="admin-form">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="sectionTitle">Section Name *</label>
                  <input
                    id="sectionTitle"
                    type="text"
                    className="form-input"
                    value={sectionForm.title}
                    onChange={(e) => setSectionForm((p) => ({ ...p, title: e.target.value }))}
                    required
                    placeholder="e.g., သုတစာပေများ"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="sectionRoute">Route / Category Value *</label>
                  <input
                    id="sectionRoute"
                    type="text"
                    className="form-input"
                    value={sectionForm.route}
                    onChange={(e) => setSectionForm((p) => ({ ...p, route: e.target.value }))}
                    required
                    placeholder="e.g., သုတ"
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="sectionKeywords">Keywords (comma separated)</label>
                  <input
                    id="sectionKeywords"
                    type="text"
                    className="form-input"
                    value={sectionForm.keywords}
                    onChange={(e) => setSectionForm((p) => ({ ...p, keywords: e.target.value }))}
                    placeholder="e.g., education, knowledge, သုတ"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="sectionLayout">Layout</label>
                  <select
                    id="sectionLayout"
                    className="form-input"
                    value={sectionForm.layout}
                    onChange={(e) => setSectionForm((p) => ({ ...p, layout: e.target.value }))}
                  >
                    <option value="scroll">Scroll</option>
                    <option value="grid">Grid</option>
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setIsAuthenticated(false)}
                  className="btn-secondary"
                >
                  Logout
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Add Section'}
                </button>
              </div>
            </form>

            <div className="admin-header" style={{ marginTop: '2rem' }}>
              <h2>All Sections</h2>
              <p>Edit section name/title then click Save.</p>
            </div>

            <div className="books-table">
              <div className="books-table-header">
                <div>Title</div>
                <div>Route</div>
                <div>Keywords</div>
                <div>Layout</div>
                <div>Actions</div>
              </div>

              {(sections || []).map((s) => {
                const edit = sectionEdits[s.id] || {};
                const keywordsStr = Array.isArray(s.keywords) ? s.keywords.join(', ') : '';
                const layoutValue = s.layout || 'scroll';
                return (
                  <div className="books-table-row" key={s.id || s.route}>
                    <div className="cell title">
                      <input
                        type="text"
                        className="form-input"
                        value={edit.title !== undefined ? edit.title : (s.title || '')}
                        onChange={(e) =>
                          setSectionEdits((prev) => ({
                            ...prev,
                            [s.id]: { ...(prev[s.id] || {}), title: e.target.value }
                          }))
                        }
                      />
                    </div>
                    <div className="cell">
                      <input
                        type="text"
                        className="form-input"
                        value={edit.route !== undefined ? edit.route : (s.route || '')}
                        onChange={(e) =>
                          setSectionEdits((prev) => ({
                            ...prev,
                            [s.id]: { ...(prev[s.id] || {}), route: e.target.value }
                          }))
                        }
                      />
                    </div>
                    <div className="cell">
                      <input
                        type="text"
                        className="form-input"
                        value={edit.keywords !== undefined ? edit.keywords : keywordsStr}
                        onChange={(e) =>
                          setSectionEdits((prev) => ({
                            ...prev,
                            [s.id]: { ...(prev[s.id] || {}), keywords: e.target.value }
                          }))
                        }
                      />
                    </div>
                    <div className="cell">
                      <select
                        className="form-input"
                        value={edit.layout !== undefined ? edit.layout : layoutValue}
                        onChange={(e) =>
                          setSectionEdits((prev) => ({
                            ...prev,
                            [s.id]: { ...(prev[s.id] || {}), layout: e.target.value }
                          }))
                        }
                      >
                        <option value="scroll">Scroll</option>
                        <option value="grid">Grid</option>
                      </select>
                    </div>
                    <div className="cell actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleSaveSection(s)}
                        disabled={loading}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => handleDeleteSection(s)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {(!sections || sections.length === 0) && (
                <div className="empty-row">No sections yet</div>
              )}
            </div>
          </>
        )}

              </div>
    </div>
  );
};

export default Admin;


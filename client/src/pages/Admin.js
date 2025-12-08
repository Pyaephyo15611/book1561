import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, BookOpen, Lock, FileText } from 'lucide-react';
import './Admin.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
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
  const [blogs, setBlogs] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingBlogId, setEditingBlogId] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('books');
  
  const [blogFormData, setBlogFormData] = useState({
    title: '',
    excerpt: '',
    description: '',
    category: 'GENERAL',
    image: null,
    date: new Date().toISOString().split('T')[0]
  });

  // SEO Title Analyzer
  const analyzeTitle = (title) => {
    if (!title) return { score: 0, feedback: [] };
    
    const feedback = [];
    let score = 0;
    const length = title.length;
    
    // Length check (50-60 chars optimal for search results)
    if (length >= 50 && length <= 60) {
      score += 30;
      feedback.push({ type: 'success', text: `✓ Perfect length (${length} chars) - Will display fully in search results` });
    } else if (length >= 40 && length < 50) {
      score += 20;
      feedback.push({ type: 'warning', text: `⚠ Good length (${length} chars) but 50-60 is optimal` });
    } else if (length > 60 && length <= 70) {
      score += 15;
      feedback.push({ type: 'warning', text: `⚠ Title may be truncated in search (${length} chars, max 60 recommended)` });
    } else if (length > 70) {
      feedback.push({ type: 'error', text: `✗ Too long (${length} chars) - Will be cut off in search results` });
    } else {
      feedback.push({ type: 'error', text: `✗ Too short (${length} chars) - Aim for 50-60 characters` });
    }
    
    // Keyword check
    const words = title.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    if (uniqueWords.size >= 3) {
      score += 20;
      feedback.push({ type: 'success', text: '✓ Contains multiple keywords' });
    } else {
      feedback.push({ type: 'warning', text: '⚠ Consider adding more relevant keywords' });
    }
    
    // Power words check
    const powerWords = ['best', 'top', 'ultimate', 'complete', 'guide', 'how', 'why', 'what', 'new', 'latest', 'free', 'tips', 'secrets', 'proven'];
    const hasPowerWord = powerWords.some(word => title.toLowerCase().includes(word));
    if (hasPowerWord) {
      score += 15;
      feedback.push({ type: 'success', text: '✓ Contains engaging power words' });
    } else {
      feedback.push({ type: 'info', text: '💡 Consider adding power words (best, guide, tips, etc.)' });
    }
    
    // Question format
    if (title.includes('?') || title.includes('How') || title.includes('Why') || title.includes('What')) {
      score += 10;
      feedback.push({ type: 'success', text: '✓ Question format increases click-through rate' });
    }
    
    // Numbers
    if (/\d/.test(title)) {
      score += 10;
      feedback.push({ type: 'success', text: '✓ Numbers in titles attract more clicks' });
    }
    
    // Clarity
    if (title.length > 20 && !title.includes('...')) {
      score += 15;
      feedback.push({ type: 'success', text: '✓ Clear and descriptive title' });
    }
    
    return { score: Math.min(score, 100), feedback };
  };

  const navigate = useNavigate();

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
      fetchBlogs();
    }
  }, [isAuthenticated]);

  const fetchBooks = async () => {
    setListLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/books`);
      const data = await response.json();
      setBooks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching books:', err);
    } finally {
      setListLoading(false);
    }
  };

  const fetchBlogs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/blogs`);
      const data = await response.json();
      setBlogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching blogs:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
      const response = await fetch(`${API_URL}/api/admin/books/${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': adminPassword
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Delete failed');
      }
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
      const response = await fetch(`${API_URL}/api/admin/books/${book.id}/trending`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ isTrending: !book.isTrending })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Update failed');
      }
      setSuccess(`Trending ${!book.isTrending ? 'enabled' : 'disabled'}`);
      fetchBooks();
    } catch (err) {
      console.error('Trending toggle error:', err);
      setError(err.message || 'Failed to update trending status');
    }
  };

  const handleBlogInputChange = (e) => {
    const { name, value } = e.target;
    setBlogFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBlogImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setBlogFormData(prev => ({
        ...prev,
        image: e.target.files[0]
      }));
    }
  };

  const handleBlogEdit = (blog) => {
    setEditingBlogId(blog.id);
    setBlogFormData({
      title: blog.title || '',
      excerpt: blog.excerpt || blog.description || '',
      description: blog.description || '',
      category: blog.category || 'GENERAL',
      image: null,
      date: blog.date || blog.createdAt ? new Date(blog.date || blog.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBlogDelete = async (id) => {
    if (!window.confirm('Delete this blog post?')) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/admin/blogs/${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': adminPassword
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Delete failed');
      }
      setSuccess('Blog deleted');
      fetchBlogs();
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBlogSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!blogFormData.title) {
      setError('Please enter a title');
      setLoading(false);
      return;
    }

    try {
      const formDataToSend = new FormData();
      if (blogFormData.image) formDataToSend.append('image', blogFormData.image);
      formDataToSend.append('title', blogFormData.title);
      formDataToSend.append('excerpt', blogFormData.excerpt);
      formDataToSend.append('description', blogFormData.description);
      formDataToSend.append('category', blogFormData.category);
      formDataToSend.append('date', blogFormData.date);

      const url = editingBlogId ? `${API_URL}/api/admin/blogs/${editingBlogId}` : `${API_URL}/api/admin/blogs`;
      const method = editingBlogId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'x-admin-password': adminPassword
        },
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Save failed');
      }

      setSuccess(editingBlogId ? 'Blog updated successfully!' : 'Blog created successfully!');
      setBlogFormData({
        title: '',
        excerpt: '',
        description: '',
        category: 'GENERAL',
        image: null,
        date: new Date().toISOString().split('T')[0]
      });
      setEditingBlogId(null);
      fetchBlogs();
    } catch (err) {
      console.error('Save error:', err);
      setError(err.message || 'Save failed. Check server logs or Backblaze configuration.');
    } finally {
      setLoading(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Check if PDF or parts are provided
    const isComic = formData.category === 'ရုပ်ပြ' || formData.category === 'comic' || formData.category === 'graphic';
    const hasParts = isComic && formData.pdfParts.length > 0 && formData.pdfParts.some(p => p.file);
    const hasSinglePdf = formData.pdf;

    if (!hasSinglePdf && !hasParts && !editingId) {
      setError(isComic ? 'Please upload PDF parts or a single PDF file' : 'Please select a PDF file');
      setLoading(false);
      return;
    }

    if (isComic && hasParts && hasSinglePdf) {
      setError('Please use either PDF parts OR a single PDF file, not both');
      setLoading(false);
      return;
    }

    try {
      const formDataToSend = new FormData();
      
      // Add single PDF if provided
      if (formData.pdf) formDataToSend.append('pdf', formData.pdf);
      
      // Add PDF parts if provided (for comics)
      if (hasParts) {
        formData.pdfParts.forEach((part, index) => {
          if (part.file) {
            formDataToSend.append(`pdfPart${part.partNumber}`, part.file);
          }
        });
        formDataToSend.append('hasParts', 'true');
        formDataToSend.append('partsCount', formData.pdfParts.filter(p => p.file).length.toString());
      }
      
      if (formData.coverFile) formDataToSend.append('coverImage', formData.coverFile);
      formDataToSend.append('title', formData.title);
      formDataToSend.append('author', formData.author);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('readingTime', formData.readingTime);
      formDataToSend.append('rating', formData.rating);
      formDataToSend.append('isTrending', formData.isTrending);

      const url = editingId ? `${API_URL}/api/admin/books/${editingId}` : `${API_URL}/api/admin/books`;
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'x-admin-password': adminPassword
        },
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Save failed');
      }

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
            className={`admin-tab ${activeTab === 'blogs' ? 'active' : ''}`}
            onClick={() => setActiveTab('blogs')}
          >
            <FileText size={20} />
            Blogs
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
                className="form-input"
                required
                placeholder="Enter book title"
              />
            </div>

            <div className="form-group">
              <label htmlFor="author">Author *</label>
              <input
                type="text"
                id="author"
                name="author"
                value={formData.author}
                onChange={handleInputChange}
                className="form-input"
                required
                placeholder="Enter author name"
              />
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
                className="form-input"
                required
              >
                <option value="">Select a category...</option>
                <optgroup label="Home Page Sections (Burmese)">
                  <option value="ရသစာပေ">ရသစာပေများ (Literature/Arts)</option>
                  <option value="အောင်မြင်ရေး">အောင်မြင်ရေးစာပေများ (Success/Self-help)</option>
                  <option value="ရုပ်ပြ">ရုပ်ပြစာအုပ်များ (Comics)</option>
                  <option value="ဝတ္ထုတို">ဝတ္ထုတိုများ (Short Stories)</option>
                  <option value="သုတ">သုတစာပေများ (Non-fiction/Knowledge)</option>
                  <option value="ကဗျာ">ကဗျာစာအုပ်များ (Poetry)</option>
                  <option value="ဘာသာပြန်">ဘာသာပြန်စာအုပ်များ (Translated Books)</option>
                  <option value="ဘာသာရေး">ဘာသာရေးစာအုပ်များ (Religious Books)</option>
                </optgroup>
                <optgroup label="Other Categories (English)">
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
              <label htmlFor="pdf">PDF File {!(formData.category === 'ရုပ်ပြ' || formData.category === 'comic' || formData.category === 'graphic') ? '*' : ''}</label>
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="pdf"
                  name="pdf"
                  accept=".pdf"
                  onChange={handlePdfFileChange}
                  className="file-input"
                  required={!editingId && !(formData.category === 'ရုပ်ပြ' || formData.category === 'comic' || formData.category === 'graphic')}
                />
                <label htmlFor="pdf" className="file-label">
                  <Upload size={20} />
                  {formData.pdf ? formData.pdf.name : 'Choose PDF file (or use Parts below for comics)'}
                </label>
              </div>
              <small className="form-hint">
                {formData.category === 'ရုပ်ပြ' || formData.category === 'comic' || formData.category === 'graphic' 
                  ? 'Upload a single PDF file, OR use the Parts section below for comics/manga with multiple parts.'
                  : 'Upload the book PDF file. Required for all books.'}
              </small>
            </div>

            {/* PDF Parts Upload for Comics */}
            {(formData.category === 'ရုပ်ပြ' || formData.category === 'comic' || formData.category === 'graphic') && (
              <div className="form-group full-width">
                <label>PDF Parts (for Comics/Manga) *</label>
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
                            // Renumber parts
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
                      const partNumber = formData.pdfParts.length + 1;
                      setFormData(prev => ({
                        ...prev,
                        pdfParts: [...prev.pdfParts, { partNumber, file: null }]
                      }));
                    }}
                  >
                    + Add Part {formData.pdfParts.length + 1}
                  </button>
                  {formData.pdfParts.length > 0 && formData.pdfParts.map((part, index) => (
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
                  Upload multiple PDF files as Part 1, Part 2, etc. Leave single PDF field empty if using parts.
                </small>
              </div>
            )}
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

        {activeTab === 'blogs' && (
          <>
            <div className="admin-header">
              <h1>
                <FileText size={32} />
                {editingBlogId ? 'Edit Blog' : 'Create New Blog'}
              </h1>
              <p>
                {editingBlogId
                  ? 'Update the blog details. Upload new image only if you want to replace it.'
                  : 'Fill in the blog details and upload an image'}
              </p>
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

            <form onSubmit={handleBlogSubmit} className="admin-form">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="blog-title">
                    Title * 
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                      ({blogFormData.title.length} characters)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="blog-title"
                    name="title"
                    value={blogFormData.title}
                    onChange={handleBlogInputChange}
                    className="form-input"
                    required
                    placeholder="Enter SEO-friendly blog title (50-60 characters optimal)"
                    maxLength={70}
                  />
                  {blogFormData.title && (
                    <div className="seo-title-analyzer">
                      <div className="seo-score">
                        <strong>SEO Score: </strong>
                        <span className={`score-value score-${analyzeTitle(blogFormData.title).score >= 70 ? 'good' : analyzeTitle(blogFormData.title).score >= 50 ? 'medium' : 'poor'}`}>
                          {analyzeTitle(blogFormData.title).score}/100
                        </span>
                      </div>
                      <div className="seo-feedback">
                        {analyzeTitle(blogFormData.title).feedback.map((item, idx) => (
                          <div key={idx} className={`feedback-item feedback-${item.type}`}>
                            {item.text}
                          </div>
                        ))}
                      </div>
                      <div className="seo-tips">
                        <strong>💡 SEO Title Best Practices:</strong>
                        <ul>
                          <li>Keep titles between 50-60 characters for full display in search results</li>
                          <li>Include your main keyword near the beginning</li>
                          <li>Use numbers, questions, or power words (Best, Guide, Tips, How, Why)</li>
                          <li>Make it compelling and click-worthy</li>
                          <li>Avoid generic titles - be specific</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group full-width">
                  <label htmlFor="blog-excerpt">Excerpt</label>
                  <textarea
                    id="blog-excerpt"
                    name="excerpt"
                    value={blogFormData.excerpt}
                    onChange={handleBlogInputChange}
                    className="form-textarea"
                    rows="2"
                    placeholder="Short excerpt (shown in blog card)"
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="blog-description">Description</label>
                  <textarea
                    id="blog-description"
                    name="description"
                    value={blogFormData.description}
                    onChange={handleBlogInputChange}
                    className="form-textarea"
                    rows="6"
                    placeholder="Full blog description/content"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="blog-category">Category</label>
                  <select
                    id="blog-category"
                    name="category"
                    value={blogFormData.category}
                    onChange={handleBlogInputChange}
                    className="form-input"
                  >
                    <option value="GENERAL">GENERAL</option>
                    <option value="WORLD-CUP-2018">WORLD-CUP-2018</option>
                    <option value="NEWS">NEWS</option>
                    <option value="SPORTS">SPORTS</option>
                    <option value="TECHNOLOGY">TECHNOLOGY</option>
                    <option value="LIFESTYLE">LIFESTYLE</option>
                    <option value="EDUCATION">EDUCATION</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="blog-date">Date</label>
                  <input
                    type="date"
                    id="blog-date"
                    name="date"
                    value={blogFormData.date}
                    onChange={handleBlogInputChange}
                    className="form-input"
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="blog-image">Blog Image</label>
                  <div className="file-upload-wrapper">
                    <input
                      type="file"
                      id="blog-image"
                      name="image"
                      accept="image/*"
                      onChange={handleBlogImageChange}
                      className="file-input"
                    />
                    <label htmlFor="blog-image" className="file-label">
                      <Upload size={20} />
                      {blogFormData.image ? blogFormData.image.name : 'Choose blog image (JPG, PNG, etc.)'}
                    </label>
                  </div>
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
                    ? editingBlogId ? 'Saving...' : 'Creating...'
                    : editingBlogId ? 'Save Changes' : 'Create Blog'}
                </button>
              </div>
            </form>

            <div className="admin-header" style={{ marginTop: '2rem' }}>
              <h2>Manage Blogs</h2>
              <p>Edit or delete blog posts.</p>
            </div>

            <div className="books-table">
              <div className="books-table-header">
                <div>Title</div>
                <div>Category</div>
                <div>Date</div>
                <div>Actions</div>
              </div>
              {blogs.map((blog) => (
                <div className="books-table-row" key={blog.id}>
                  <div className="cell title">{blog.title}</div>
                  <div className="cell">{blog.category || 'GENERAL'}</div>
                  <div className="cell">{blog.date || new Date(blog.createdAt || Date.now()).toLocaleDateString()}</div>
                  <div className="cell actions">
                    <button type="button" className="btn-secondary" onClick={() => handleBlogEdit(blog)}>
                      Edit
                    </button>
                    <button type="button" className="btn-danger" onClick={() => handleBlogDelete(blog.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {blogs.length === 0 && <div className="empty-row">No blogs yet</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;


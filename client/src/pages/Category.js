import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { getCoverImageUrl, getDefaultCoverImage } from '../utils/coverImage';
import { API_URL } from '../utils/apiConfig';
import './Home.css';
import './Category.css';

const Category = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/books`);
        setBooks(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Error fetching books:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, []);

  const filtered = books
    .filter((b) => (b.category || '').toLowerCase() === decodeURIComponent(name || '').toLowerCase())
    .filter((b) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        b.title?.toLowerCase().includes(q) ||
        b.author?.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'author':
          return (a.author || '').localeCompare(b.author || '');
        case 'recent':
        default:
          return 0;
      }
    });

  return (
    <div className="home-page">
      <main className="main-content">
        <section className="section">
          <div className="container">
            <div className="cat-header">
              <div className="cat-title">
                <button className="btn btn-outline" onClick={() => navigate(-1)}>
                  <ArrowLeft size={18} /> Back
                </button>
                <div>
                  <span className="section-eyebrow">Category</span>
                  <h2 className="section-title">{decodeURIComponent(name || '')}</h2>
                </div>
              </div>
              <div className="cat-actions">
                <div className="cat-search">
                  <input
                    type="text"
                    placeholder="Search in this category..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="cat-filters">
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="recent">Most recent</option>
                    <option value="title">Title A–Z</option>
                    <option value="author">Author A–Z</option>
                  </select>
                  <div className="view-toggle">
                    <button
                      className={view === 'grid' ? 'active' : ''}
                      onClick={() => setView('grid')}
                      aria-label="Grid view"
                    >▦</button>
                    <button
                      className={view === 'list' ? 'active' : ''}
                      onClick={() => setView('list')}
                      aria-label="List view"
                    >≣</button>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="no-results">
                <div className="loader" />
                <p>Loading books...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="no-results">
                <BookOpen size={48} />
                <h3>No books found</h3>
                <p>No books in this category yet.</p>
              </div>
            ) : (
              <div className={view === 'grid' ? 'cat-grid' : 'cat-list'}>
                {filtered.map((book) => (
                  <div
                    key={book.id}
                    className="cat-card"
                    onClick={() => navigate(`/book/${book.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/book/${book.id}`)}
                  >
                    <div className="cat-cover">
                      <img
                        src={getCoverImageUrl(book)}
                        alt={book.title}
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = getDefaultCoverImage(book);
                        }}
                      />
                    </div>
                    <div className="cat-meta">
                      <h3 className="cat-title-text">{book.title || 'Untitled'}</h3>
                      <button
                        className="cat-author"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (book.author) navigate(`/author/${encodeURIComponent(book.author)}`);
                        }}
                      >
                        {book.author || 'Unknown Author'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Category;


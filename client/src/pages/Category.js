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
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/sections`);
        setSections(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Error fetching sections:', error);
        setSections([]);
      }
    };
    fetchSections();
  }, []);

  const normalizeCategory = (value) => {
    return decodeURIComponent(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/(စာပေများ|စာအုပ်များ|များ)$/u, '')
      .toLowerCase();
  };

  const categoryMatches = (bookCategoryRaw, routeCategoryRaw) => {
    const bookCategory = normalizeCategory(bookCategoryRaw);
    const routeCategory = normalizeCategory(routeCategoryRaw);

    if (!bookCategory || !routeCategory) return false;

    return bookCategory === routeCategory;
  };

  const filtered = books
    .filter((b) => categoryMatches(b.category, name))
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

  useEffect(() => {
    setPage(1);
  }, [name, query, sortBy, view]);

  const PAGE_SIZE = view === 'list' ? 10 : window.innerWidth <= 576 ? 8 : 18;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [name, safePage]);

  const getPageNumbers = () => {
    const pages = [];
    const maxButtons = 7;
    if (totalPages <= maxButtons) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }

    pages.push(1);
    const start = Math.max(2, safePage - 2);
    const end = Math.min(totalPages - 1, safePage + 2);

    if (start > 2) pages.push('…');
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < totalPages - 1) pages.push('…');

    pages.push(totalPages);
    return pages;
  };

  const routeKey = decodeURIComponent(name || '');
  const matchedSection = sections.find((s) => normalizeCategory(s?.route) === normalizeCategory(routeKey));
  const displayCategoryName = matchedSection?.title || routeKey;

  return (
    <div className="home-page category-page">
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
                  <h2 className="section-title">{displayCategoryName}</h2>
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
              <>
                <div className={view === 'grid' ? 'cat-grid' : 'cat-list'}>
                  {paginated.map((book) => (
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

                {totalPages > 1 ? (
                  <div className="cat-pagination">
                    <button
                      type="button"
                      className="cat-page-btn"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    >
                      Prev
                    </button>

                    <div className="cat-page-numbers" aria-label="Pagination">
                      {getPageNumbers().map((p, idx) =>
                        p === '…' ? (
                          <span key={`dots-${idx}`} className="cat-page-dots">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={p === safePage ? 'cat-page-number active' : 'cat-page-number'}
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </button>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      className="cat-page-btn"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Category;


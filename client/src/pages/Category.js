import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
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
  const [page, setPage] = useState(1);

  const getDefaultBannerUrl = (sectionLike) => {
    const seed = String(sectionLike?.id || sectionLike?.route || sectionLike?.title || 'category');
    const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    // Real natural book-themed photos (Unsplash). Deterministic pick per section.
    // If you ever want different photos, just swap/extend this list.
    const banners = [
      'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1600&h=420&q=80',
      'https://images.unsplash.com/photo-1524578271613-d550eacf6090?auto=format&fit=crop&w=1600&h=420&q=80'
    ];

    return banners[hash % banners.length];
  };

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

  const filtered = books.filter((b) => categoryMatches(b.category, name));

  useEffect(() => {
    setPage(1);
  }, [name]);

  const PAGE_SIZE = window.innerWidth <= 576 ? 8 : 18;
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
  const bannerUrl = matchedSection?.bannerImageUrl || matchedSection?.bannerImage || getDefaultBannerUrl(matchedSection || { title: displayCategoryName, route: routeKey });

  return (
    <div className="home-page category-page">
      <main className="main-content">
        <section className="section">
          <div className="container">
            {bannerUrl ? (
              <div className="cat-banner">
                <img src={bannerUrl} alt={displayCategoryName} loading="lazy" />
              </div>
            ) : null}

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
                <div className={'cat-grid'}>
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
                        src={getCoverImageUrl(book) || getDefaultCoverImage(book)}
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


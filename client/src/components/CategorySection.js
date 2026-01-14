import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCoverImageUrl } from '../utils/coverImage';
import BookSkeleton from './BookSkeleton';
import './CategorySection.css';

const CategorySection = ({ title, books, categoryRoute, loading, layout = 'scroll', isNewSection = false }) => {
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const isGrid = layout === 'grid';
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const scrollByAmount = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(320, Math.floor(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  // Always show section, even if empty
  return (
    <section className={`section trending-books ${isGrid ? 'is-grid' : 'is-scroll'}`}>
      <div className="container">
        <div className="trending-header">
          <div
            className="trending-title"
            onClick={() => navigate(`/category/${encodeURIComponent(categoryRoute)}`)}
            style={{ cursor: 'pointer' }}
          >
            <span>{title}</span>
            <button
              type="button"
              className="trending-view"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/category/${encodeURIComponent(categoryRoute)}`);
              }}
            >
              (အားလုံးကြည့်မယ်)
            </button>
          </div>

          {!isGrid ? (
            <div className="trending-controls" aria-label="Scroll controls">
              <button
                type="button"
                className="trend-arrow"
                onClick={() => scrollByAmount(-1)}
                aria-label="Scroll left"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="trend-arrow"
                onClick={() => scrollByAmount(1)}
                aria-label="Scroll right"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
        </div>
        {loading ? (
          isGrid ? (
            <div className="trending-grid">
              {Array.from({ length: 8 }).map((_, index) => (
                <BookSkeleton key={index} />
              ))}
            </div>
          ) : (
            <div className="trending-row-scroll" ref={scrollRef}>
              <div className="trending-row">
                {Array.from({ length: window.innerWidth <= 480 ? 6 : 8 }).map((_, index) => (
                  <BookSkeleton key={index} />
                ))}
              </div>
            </div>
          )
        ) : books.length > 0 ? (
          isGrid ? (
            <div className="trending-grid">
              {books.slice(0, 8).map((book, index) => (
                <motion.div
                  key={book.id || index}
                  className="trending-card deco-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() =>
                    isMobile
                      ? navigate(`/category/${encodeURIComponent(categoryRoute)}`)
                      : navigate(`/book/${book.id}`)
                  }
                  style={{ cursor: 'pointer' }}
                >
                  <div className="deco-corner deco-top deco-left"></div>
                  <div className="deco-corner deco-top deco-right"></div>
                  <div className="deco-corner deco-bottom deco-left"></div>
                  <div className="deco-corner deco-bottom deco-right"></div>
                  <div className="trending-cover">
                    {getCoverImageUrl(book) ? (
                      <img
                        src={getCoverImageUrl(book)}
                        alt={book.title}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="trending-info">
                    <p className="trending-book-title">{book.title || 'Untitled'}</p>
                    <p
                      className="trending-book-author"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMobile) {
                          navigate(`/category/${encodeURIComponent(categoryRoute)}`);
                          return;
                        }
                        if (book.author) {
                          navigate(`/author/${encodeURIComponent(book.author)}`);
                        }
                      }}
                      style={{ cursor: book.author ? 'pointer' : 'default' }}
                    >
                      {book.author || 'Unknown Author'}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="trending-row-scroll" ref={scrollRef}>
              <div className="trending-row">
                {books.map((book, index) => (
                  <motion.div
                    key={book.id || index}
                    className="trending-card deco-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => navigate(`/book/${book.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="deco-corner deco-top deco-left"></div>
                    <div className="deco-corner deco-top deco-right"></div>
                    <div className="deco-corner deco-bottom deco-left"></div>
                    <div className="deco-corner deco-bottom deco-right"></div>
                    <div className="trending-cover">
                      {getCoverImageUrl(book) ? (
                        <img
                          src={getCoverImageUrl(book)}
                          alt={book.title}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : null}
                    </div>
                    <p className="trending-book-title">{book.title || 'Untitled'}</p>
                    <p
                      className="trending-book-author"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (book.author) {
                          navigate(`/author/${encodeURIComponent(book.author)}`);
                        }
                      }}
                      style={{ cursor: book.author ? 'pointer' : 'default' }}
                    >
                      {book.author || 'Unknown Author'}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="no-results" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            <p>No books in this category yet.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default CategorySection;



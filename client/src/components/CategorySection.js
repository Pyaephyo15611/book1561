import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getCoverImageUrl } from '../utils/coverImage';
import BookSkeleton from './BookSkeleton';
import './CategorySection.css';

const CategorySection = ({ title, books, categoryRoute, loading, isNewSection = false }) => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  
  const BOOKS_PER_PAGE = isNewSection ? 10 : window.innerWidth <= 480 ? 6 : 7; // New: 10 books, Mobile: 2x3=6, Desktop: 1x7=7
  const totalPages = Math.ceil(books.length / BOOKS_PER_PAGE);
  
  const startIndex = (currentPage - 1) * BOOKS_PER_PAGE;
  const endIndex = startIndex + BOOKS_PER_PAGE;
  const currentBooks = books.slice(startIndex, endIndex);
  
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Always show section, even if empty
  return (
    <section className="section trending-books">
      <div className="container">
        <div className="trending-header">
          <div className="trending-title">
            <span>{title}</span>
            <button
              type="button"
              className="trending-view"
              onClick={() => navigate(`/category/${encodeURIComponent(categoryRoute)}`)}
            >
              (view all)
            </button>
          </div>
        </div>
        {loading ? (
          <div className={`trending-grid ${isNewSection ? '' : 'grid-2x3'}`}>
            {Array.from({ length: BOOKS_PER_PAGE }).map((_, index) => (
              <BookSkeleton key={index} />
            ))}
          </div>
        ) : books.length > 0 ? (
          <>
            <div className={`trending-grid ${isNewSection ? '' : 'grid-2x3'}`}>
              {currentBooks.map((book, index) => (
                <motion.div
                  key={book.id || index}
                  className="trending-card deco-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
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
            
            {/* Pagination Controls */}
            {!isNewSection && totalPages > 1 && (
              <div className="pagination-controls">
                <button 
                  className="pagination-btn"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  ←
                </button>
                <span className="pagination-info">
                  {currentPage} / {totalPages}
                </span>
                <button 
                  className="pagination-btn"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  →
                </button>
              </div>
            )}
          </>
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



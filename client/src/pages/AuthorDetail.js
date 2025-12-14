import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft, User } from 'lucide-react';
import { getCoverImageUrl, getDefaultCoverImage } from '../utils/coverImage';
import { API_URL } from '../utils/apiConfig';
import './Home.css';

const AuthorDetail = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const authorName = decodeURIComponent(name || '');

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/books`);
        const allBooks = Array.isArray(response.data) ? response.data : [];
        
        // Filter books by author (case-insensitive)
        const filtered = allBooks.filter(
          (b) => (b.author || '').trim().toLowerCase() === authorName.toLowerCase()
        );
        
        setBooks(filtered);
      } catch (error) {
        console.error('Error fetching books:', error);
        setBooks([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchBooks();
  }, [authorName]);

  return (
    <div className="home-page">
      <main className="main-content">
        <section className="section">
          <div className="container">
            <div className="section-header category-header">
              <button className="btn btn-outline" onClick={() => navigate('/authors')}>
                <ArrowLeft size={18} /> Back to Authors
              </button>
              <div>
                <span className="section-eyebrow">Author</span>
                <h2 className="section-title">{authorName}</h2>
                <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>
                  {books.length} {books.length === 1 ? 'book' : 'books'} by this author
                </p>
              </div>
            </div>

            {loading ? (
              <div className="no-results">
                <div className="loader" />
                <p>Loading books...</p>
              </div>
            ) : books.length === 0 ? (
              <div className="no-results">
                <BookOpen size={48} />
                <h3>No books found</h3>
                <p>No books by {authorName} yet.</p>
              </div>
            ) : (
              <div className="trending-grid">
                {books.map((book) => (
                  <div
                    key={book.id}
                    className="trending-card"
                    onClick={() => navigate(`/book/${book.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="trending-cover">
                      <img
                        src={getCoverImageUrl(book)}
                        alt={book.title}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = getDefaultCoverImage(book);
                        }}
                      />
                    </div>
                    <p className="trending-book-title">{book.title || 'Untitled'}</p>
                    <p className="trending-book-author">{book.author || 'Unknown Author'}</p>
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

export default AuthorDetail;


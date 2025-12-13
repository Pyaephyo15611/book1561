import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { getCoverImageUrl, getDefaultCoverImage } from '../utils/coverImage';
import './Home.css';

// Get API URL and convert HTTP to HTTPS if page is loaded over HTTPS (fixes mixed content error)
let API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && API_URL.startsWith('http://')) {
  API_URL = API_URL.replace('http://', 'https://');
}

const Category = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const filtered = books.filter(
    (b) => (b.category || '').toLowerCase() === decodeURIComponent(name || '').toLowerCase()
  );

  return (
    <div className="home-page">
      <main className="main-content">
        <section className="section">
          <div className="container">
            <div className="section-header category-header">
              <button className="btn btn-outline" onClick={() => navigate(-1)}>
                <ArrowLeft size={18} /> Back
              </button>
              <div>
                <span className="section-eyebrow">Category</span>
                <h2 className="section-title">{decodeURIComponent(name || '')}</h2>
              </div>
            </div>

            {loading ? (
              <div className="no-results">
                <div className="spinner" />
                <p>Loading books...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="no-results">
                <BookOpen size={48} />
                <h3>No books found</h3>
                <p>No books in this category yet.</p>
              </div>
            ) : (
              <div className="trending-grid">
                {filtered.map((book) => (
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

export default Category;


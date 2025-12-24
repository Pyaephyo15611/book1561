import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { User, BookOpen } from 'lucide-react';
import { API_URL } from '../utils/apiConfig';
import './Home.css';

const AuthorList = () => {
  const navigate = useNavigate();
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuthors = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/books`);
        const books = Array.isArray(response.data) ? response.data : [];
        
        // Extract unique authors with book counts
        const authorMap = new Map();
        books.forEach(book => {
          if (book.author && book.author.trim()) {
            const authorName = book.author.trim();
            if (authorMap.has(authorName)) {
              authorMap.set(authorName, authorMap.get(authorName) + 1);
            } else {
              authorMap.set(authorName, 1);
            }
          }
        });
        
        // Convert to array and sort by name
        const authorsList = Array.from(authorMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setAuthors(authorsList);
      } catch (error) {
        console.error('Error fetching authors:', error);
        setAuthors([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAuthors();
  }, []);

  return (
    <div className="home-page author-page">
      <main className="main-content">
        <section className="section">
          <div className="container">
            <div className="section-header category-header">
              <button className="btn btn-outline" onClick={() => navigate('/')}>
                <User size={18} /> Back to Home
              </button>
              <div>
                <span className="section-eyebrow">Authors</span>
                <h2 className="section-title">All Authors</h2>
              </div>
            </div>

            {loading ? (
              <div className="no-results">
                <div className="loader" />
                <p>Loading authors...</p>
              </div>
            ) : authors.length === 0 ? (
              <div className="no-results">
                <BookOpen size={48} />
                <h3>No authors found</h3>
                <p>No authors available yet.</p>
              </div>
            ) : (
              <div className="authors-grid">
                {authors.map((author, index) => (
                  <div
                    key={index}
                    className="author-card"
                    onClick={() => navigate(`/author/${encodeURIComponent(author.name)}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="author-icon">
                      <User size={32} />
                    </div>
                    <h3 className="author-name">{author.name}</h3>
                    <p className="author-count">{author.count} {author.count === 1 ? 'book' : 'books'}</p>
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

export default AuthorList;


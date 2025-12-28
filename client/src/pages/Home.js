import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import axios from 'axios';
import {
  BookOpen,
  Facebook,
  Instagram,
  Twitter,
  Youtube
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getCoverImageUrl, getDefaultCoverImage } from '../utils/coverImage';
import CategorySection from '../components/CategorySection';
import BookSkeleton from '../components/BookSkeleton';
import { API_URL } from '../utils/apiConfig';
import './Home.css';
import bannerLogo from '../assets/logo.png';

console.log('API_URL configured as:', API_URL);

const Home = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const defaultCategorySections = [
    {
      title: 'ရသစာပေများ',
      keywords: ['literature', 'arts', 'ရသစာပေ', 'fiction', 'novel', 'story'],
      route: 'ရသစာပေ'
    },
    {
      title: 'အောင်မြင်ရေးစာပေများ',
      keywords: ['success', 'self-help', 'အောင်မြင်ရေး', 'motivation', 'business', 'achievement'],
      route: 'အောင်မြင်ရေး'
    },
    {
      title: 'ရုပ်ပြစာအုပ်များ',
      keywords: ['comic', 'ရုပ်ပြ', 'graphic', 'manga', 'cartoon'],
      route: 'ရုပ်ပြ'
    },
    {
      title: 'ဝတ္ထုတိုများ',
      keywords: ['short story', 'ဝတ္ထုတို', 'short', 'story collection'],
      route: 'ဝတ္ထုတို'
    },
    {
      title: 'သုတစာပေများ',
      keywords: ['non-fiction', 'knowledge', 'သုတ', 'education', 'reference', 'science', 'history'],
      route: 'သုတ'
    },
    {
      title: 'ကဗျာစာအုပ်များ',
      keywords: ['poetry', 'poem', 'ကဗျာ', 'verse'],
      route: 'ကဗျာ'
    },
    {
      title: 'ဘာသာပြန်စာအုပ်များ',
      keywords: ['translated', 'ဘာသာပြန်', 'translation'],
      route: 'ဘာသာပြန်'
    },
    {
      title: 'ဘာသာရေးစာအုပ်များ',
      keywords: ['religious', 'religion', 'ဘာသာရေး', 'spiritual', 'faith', 'buddhism', 'christian'],
      route: 'ဘာသာရေး'
    }
  ];
  const [categorySections, setCategorySections] = useState(defaultCategorySections);
  const newsBooksScrollRef = useRef(null);
  const lastFetchAtRef = useRef(0);

  const fetchBooks = useCallback(async () => {
    try {
      lastFetchAtRef.current = Date.now();
      let booksData = [];

      // Try API first with no timeout limit
      try {
        console.log('Fetching books from API...');
        const response = await axios.get(`${API_URL}/api/books`);
        booksData = response.data;
        console.log('API fetch successful, got', booksData.length, 'books');
      } catch (apiError) {
        console.log('API not available, trying Firestore fallback:', apiError.message);
        
        // Always try Firestore fallback when API fails
        try {
          console.log('Fetching books from Firestore...');
          const snapshot = await getDocs(collection(db, 'books'));
          snapshot.forEach((doc) => {
            booksData.push({
              id: doc.id,
              ...doc.data()
            });
          });
          console.log('Firestore fetch successful, got', booksData.length, 'books');
        } catch (fsErr) {
          console.error('Firestore fallback failed:', fsErr.message);
        }
      }

      if (booksData.length === 0) {
        console.warn('No books found from any source');
      }

      const enhancedBooks = booksData.map((book) => ({
        ...book,
        rating: book.rating || (Math.random() * 2 + 3).toFixed(1),
        pages: book.pages || book.pageCount || Math.floor(Math.random() * 200) + 150,
        readingTime: book.readingTime || `${Math.floor((book.pages || 200) / 2)} min read`
      }));

      setBooks(enhancedBooks);
      setFilteredBooks(enhancedBooks);

      try {
        localStorage.setItem('books_cache_v1', JSON.stringify(enhancedBooks));
      } catch (e) {
        console.warn('Failed to cache books:', e.message);
      }
    } catch (error) {
      console.error('Error fetching books:', error);
      setBooks([]);
      setFilteredBooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('books_cache_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBooks(parsed);
          setFilteredBooks(parsed);
          setLoading(false);
        }
      }
    } catch (e) {
      // ignore cache parse errors
    }

    fetchBooks();

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFetchAtRef.current < 10000) {
        return;
      }
      fetchBooks();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchBooks]);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/sections`);
        const data = response.data;
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data
            .filter((s) => s && s.title && s.route)
            .map((s) => ({
              title: s.title,
              route: s.route,
              keywords: Array.isArray(s.keywords) ? s.keywords : []
            }));
          if (normalized.length > 0) {
            setCategorySections(normalized);
          }
        }
      } catch (e) {
        setCategorySections(defaultCategorySections);
      }
    };
    fetchSections();
    // defaultCategorySections is a constant defined in render scope; safe to ignore per ESLint rules
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_URL]);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredBooks(books);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = books.filter((book) =>
      book.title?.toLowerCase().includes(term) ||
      book.author?.toLowerCase().includes(term) ||
      book.description?.toLowerCase().includes(term) ||
      book.category?.toLowerCase().includes(term)
    );
    setFilteredBooks(filtered);
  }, [searchTerm, books]);

  const displayBooks = filteredBooks.length > 0 ? filteredBooks : books;

  // Category mapping function to match books to categories
  const matchBookToCategory = (book, categoryKeywords) => {
    const bookCategory = (book.category || '').toLowerCase();
    return categoryKeywords.some(keyword => bookCategory.includes(keyword.toLowerCase()));
  };

  
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Structured Data for Homepage
  const homepageStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "BookStore",
    "url": siteUrl,
    "description": "Free online bookstore with thousands of ebooks. Read and download books online.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${siteUrl}/search/{search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <>
      <Helmet>
        <title>BookStore - Free Ebooks Online | Read & Download Books</title>
        <meta name="description" content="Discover thousands of free ebooks and digital books. Read online or download instantly. Browse fiction, non-fiction, literature, and more." />
        <meta name="keywords" content="free ebooks, online books, digital books, read books online, download books, bookstore, literature, fiction, non-fiction" />
        <link rel="canonical" href={siteUrl} />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:title" content="BookStore - Free Ebooks Online" />
        <meta property="og:description" content="Discover thousands of free ebooks and digital books. Read online or download instantly." />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="BookStore - Free Ebooks Online" />
        <meta name="twitter:description" content="Discover thousands of free ebooks and digital books." />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(homepageStructuredData)}
        </script>
      </Helmet>

      <div className="home-page">
        {/* Manybooks-style hero */}
        <header className="hero banner-hero">
          <div className="hero-bg" aria-hidden="true">
            <div className="hero-overlay"></div>
          </div>
          <div className="container banner-column">
            <div className="banner-media">
              <img
                src={bannerLogo}
                alt="Logo"
                className="banner-image"
              />
            </div>
            <motion.div
              className="banner-inner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="title-large">အခမဲ့ အီးဘုတ်တွေကို အလွယ်တကူ ဖတ်ရှုလိုက်ပါ</h1>
              <p className="text-base font-normal">
                စာအုပ်အမျိုးအစားစုံကို အွန်လိုင်းမှာ ဖတ်ရှုနိုင်သလို ဒေါင်းလုဒ်လည်း လုပ်နိုင်ပါတယ်။ မိမိနှစ်သက်ရာ စာအုပ်ကို ယနေ့ပဲ စတင်ရှာဖွေလိုက်ပါ။
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.scrollTo({ top: document.querySelector('.news-books')?.offsetTop - 90, behavior: 'smooth' })}
              >
                စာအုပ်တွေကို ကြည့်မယ်
              </button>
            </motion.div>
            <div className="banner-social" aria-label="Social links">
              <button type="button" className="banner-social-link" aria-label="Facebook">
                <Facebook size={18} />
              </button>
              <button type="button" className="banner-social-link" aria-label="Instagram">
                <Instagram size={18} />
              </button>
              <button type="button" className="banner-social-link" aria-label="Twitter">
                <Twitter size={18} />
              </button>
              <button type="button" className="banner-social-link" aria-label="YouTube">
                <Youtube size={18} />
              </button>
            </div>
          </div>
        </header>

      <main className="main-content">
        {/* Search bar and quick filters */}
        <section className="section search-section">
          <div className="container">
            <div className="input-container">
              <input
                className="input"
                name="text"
                type="text"
                placeholder="Search for books..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    navigate(`/search/${encodeURIComponent(searchTerm.trim())}`);
                  }
                }}
              />
            </div>
          </div>
        </section>

        {/* News Books Section with horizontal scroll */}
        <section className="section news-books">
          <div className="container">
            <div className="trending-header">
              <div className="trending-title">
                <span>NEWS BOOKS</span>
                <button
                  type="button"
                  className="trending-view"
                  onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                >
                  (view all)
                </button>
              </div>
              <div className="trending-nav">
                <button 
                  className="trend-arrow" 
                  type="button" 
                  aria-label="Scroll left"
                  onClick={() => {
                    if (newsBooksScrollRef.current) {
                      newsBooksScrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
                    }
                  }}
                >
                  ‹
                </button>
                  <button
                  className="trend-arrow" 
                    type="button"
                  aria-label="Scroll right"
                  onClick={() => {
                    if (newsBooksScrollRef.current) {
                      newsBooksScrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                    }
                  }}
                  >
                  ›
                  </button>
              </div>
            </div>

            {displayBooks.length === 0 ? (
              loading ? (
                <div className="news-books-scroll" ref={newsBooksScrollRef}>
                  <div className="news-books-container">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <BookSkeleton key={index} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="no-results">
                  <BookOpen size={48} />
                  <h3>No books found</h3>
                  <p>Try a different search term or clear the search box.</p>
                </div>
              )
            ) : (
              <div className="news-books-scroll" ref={newsBooksScrollRef}>
                <div className="news-books-container">
                  {displayBooks
                    .slice(0, 8)
                    .filter((book) => book && book.id)
                    .map((book, index) => (
                    <motion.div
                      key={book.id}
                      className="news-book-card deco-card"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => navigate(`/book/${book.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="deco-corner deco-top deco-left"></div>
                      <div className="deco-corner deco-top deco-right"></div>
                      <div className="deco-corner deco-bottom deco-left"></div>
                      <div className="deco-corner deco-bottom deco-right"></div>
                      <div className="trending-cover">
                        <img
                          src={getCoverImageUrl(book)}
                          alt={book.title}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = getDefaultCoverImage(book);
                          }}
                          loading="lazy"
                        />
                      </div>
                      <p className="trending-book-title">{book.title || 'Untitled'}</p>
                      <p className="trending-book-author">{book.author || 'Unknown Author'}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Category Sections - Always show all sections */}
        {!searchTerm && (
          <>
            {categorySections.map((category) => {
              const categoryBooks = displayBooks.filter(book => 
                matchBookToCategory(book, category.keywords)
              );
              
              return (
                <CategorySection
                  key={category.title}
                  title={category.title}
                  books={categoryBooks}
                  categoryRoute={category.route}
                  loading={loading}
                />
              );
            })}
          </>
        )}

      </main>

      {/* Footer with Myanmar Language Navigation */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h3>ဆက်သွယ်ရန်</h3>
              <ul className="footer-links">
                <li><button className="footer-link" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>ပင်မစာမျက်နှာ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/')}>စာအုပ်များ</button></li>
                <li><button className="footer-link" onClick={() => window.scrollTo({top: document.querySelector('.news-books')?.offsetTop - 100, behavior: 'smooth'})}>စာအုပ်အသစ်များ</button></li>
                <li><button className="footer-link" onClick={() => window.scrollTo({top: document.querySelector('.news-books')?.offsetTop - 100, behavior: 'smooth'})}>ရေပန်းစားစာအုပ်များ</button></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h3>စာအုပ်အမျိုးအစားများ</h3>
              <ul className="footer-links">
                <li><button className="footer-link" onClick={() => navigate('/category/ရသစာပေ')}>ရသစာပေများ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/category/အောင်မြင်ရေး')}>အောင်မြင်ရေးစာပေများ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/category/ရုပ်ပြ')}>ရုပ်ပြစာအုပ်များ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/category/ဝတ္ထုတို')}>ဝတ္ထုတိုများ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/category/သုတ')}>သုတစာပေများ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/category/ကဗျာ')}>ကဗျာစာအုပ်များ</button></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h3>အကြောင်းအရာ</h3>
              <ul className="footer-links">
                <li><button className="footer-link" onClick={() => navigate('/')}>ကျွန်ုပ်တို့အကြောင်း</button></li>
                <li><button className="footer-link" onClick={() => navigate('/')}>ဆက်သွယ်ရန်</button></li>
                <li><button className="footer-link" onClick={() => navigate('/')}>မူဝါဒများ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/')}>ကိုယ်ရေးလုံခြုံမှု</button></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h3>အခြားသော</h3>
              <ul className="footer-links">
                <li><button className="footer-link" onClick={() => navigate('/')}>အကူအညီ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/')}>မေးခွန်းများ</button></li>
                <li><button className="footer-link" onClick={() => navigate('/')}>သတင်းစကား</button></li>
              </ul>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} BookStore. မူပိုင်ခွင့်အားလုံး လုံခြုံပါသည်။</p>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
};

export default Home;


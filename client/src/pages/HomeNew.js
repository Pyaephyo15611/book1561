import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import {
  BookOpen,
  Search,
  Star,
  ChevronRight,
  Download,
  Heart,
  Share2,
  Menu,
  X,
  Moon,
  Sun,
  User,
  LogIn,
  Home as HomeIcon,
  BookOpenCheck,
  Bookmark,
  BookText,
  Clock,
  Filter,
  Grid,
  List,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  BookmarkMinus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Home.css';

// Get API URL and convert HTTP to HTTPS if page is loaded over HTTPS (fixes mixed content error)
let API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && API_URL.startsWith('http://')) {
  API_URL = API_URL.replace('http://', 'https://');
}

// Categories for the book store
const categories = [
  'Fiction', 'Mystery', 'Romance', 'Science Fiction', 'Fantasy',
  'Biography', 'History', 'Self-Help', 'Business', 'Technology',
  'Science', 'Health', 'Travel', 'Cooking', 'Poetry'
];

// Generate a default cover image URL for books without covers
function getDefaultCoverImage(book) {
  const title = (book.title || 'Book').substring(0, 20).replace(/\s+/g, '+');
  const author = (book.author || 'Author').substring(0, 15).replace(/\s+/g, '+');
  
  const gradients = [
    { from: '667eea', to: '764ba2' },
    { from: 'f093fb', to: '4facfe' },
    { from: '4facfe', to: '00f2fe' },
    { from: '43e97b', to: '38f9d7' },
    { from: 'fa709a', to: 'fee140' },
    { from: '30cfd0', to: '330867' },
    { from: 'a8edea', to: 'fed6e3' },
    { from: 'ff9a9e', to: 'fecfef' }
  ];
  
  const hash = (book.id || book.title || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradient = gradients[hash % gradients.length];
  
  const svg = `<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#${gradient.from};stop-opacity:1" /><stop offset="100%" style="stop-color:#${gradient.to};stop-opacity:1" /></linearGradient></defs><rect width="400" height="600" fill="url(#grad)"/><text x="50%" y="45%" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${title}</text><text x="50%" y="55%" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">${author}</text></svg>`;
  
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Format reading time
const formatReadingTime = (minutes) => {
  if (minutes < 1) return 'Less than a minute';
  if (minutes < 60) return `${Math.ceil(minutes)} min read`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins > 0 ? `${mins}m` : ''} read`;
};

const Home = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [featuredBooks, setFeaturedBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const [booksPerPage] = useState(12);
  const [readingProgress, setReadingProgress] = useState({});
  const [savedBooks, setSavedBooks] = useState(new Set());
  const searchInputRef = useRef(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    category: 'All',
    language: 'All',
    format: 'All',
    sort: 'recent',
    query: ''
  });

  // Fetch books on component mount
  useEffect(() => {
    fetchBooks();
    loadReadingProgress();
    loadSavedBooks();
    
    const handleFocus = () => {
      fetchBooks();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const fetchBooks = async () => {
    try {
      let booksData = [];
      
      // Try API first
      try {
        const response = await axios.get(`${API_URL}/api/books`);
        booksData = response.data;
      } catch (apiError) {
        console.log('API not available, trying Firestore directly');
        const booksSnapshot = await getDocs(collection(db, 'books'));
        booksSnapshot.forEach(doc => {
          booksData.push({
            id: doc.id,
            ...doc.data()
          });
        });
      }
      
      if (booksData.length === 0) {
        console.warn('No books found');
      }
      
      // Add mock data if needed
      const now = new Date();
      const enhancedBooks = booksData.map(book => ({
        ...book,
        category: book.category || categories[Math.floor(Math.random() * categories.length)],
        rating: book.rating || (Math.random() * 3 + 2).toFixed(1),
        publishedDate: book.publishedDate || new Date(now - Math.random() * 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        pages: book.pages || Math.floor(Math.random() * 200) + 100,
        language: book.language || 'English',
        format: book.format || 'ePub',
        isFeatured: book.isFeatured || Math.random() > 0.7,
        readingTime: Math.floor(Math.random() * 120) + 30 // 30-150 minutes
      }));
      
      setBooks(enhancedBooks);
      setFilteredBooks(enhancedBooks);
      setFeaturedBooks(enhancedBooks.filter(book => book.isFeatured).slice(0, 5));
      
    } catch (error) {
      console.error('Error fetching books:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Load reading progress from localStorage
  const loadReadingProgress = () => {
    const savedProgress = localStorage.getItem('readingProgress');
    if (savedProgress) {
      setReadingProgress(JSON.parse(savedProgress));
    }
  };
  
  // Load saved books from localStorage
  const loadSavedBooks = () => {
    const saved = localStorage.getItem('savedBooks');
    if (saved) {
      setSavedBooks(new Set(JSON.parse(saved)));
    }
  };
  
  // Toggle saved status of a book
  const toggleSaveBook = (bookId) => {
    const newSavedBooks = new Set(savedBooks);
    if (newSavedBooks.has(bookId)) {
      newSavedBooks.delete(bookId);
    } else {
      newSavedBooks.add(bookId);
    }
    setSavedBooks(newSavedBooks);
    localStorage.setItem('savedBooks', JSON.stringify(Array.from(newSavedBooks)));
  };
  
  // Handle book click
  const handleBookClick = (bookId) => {
    // Update reading progress
    const newProgress = {
      ...readingProgress,
      [bookId]: {
        ...readingProgress[bookId],
        lastRead: new Date().toISOString(),
        progress: readingProgress[bookId]?.progress || 0
      }
    };
    setReadingProgress(newProgress);
    localStorage.setItem('readingProgress', JSON.stringify(newProgress));
    
    // Navigate to book reader
    navigate(`/read/${bookId}`);
  };
  
  // Get reading progress for a book
  const getBookProgress = (bookId) => {
    return readingProgress[bookId]?.progress || 0;
  };
  
  // Handle scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Filter and sort books
  useEffect(() => {
    let result = [...books];
    
    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(book =>
        book.title?.toLowerCase().includes(term) ||
        book.author?.toLowerCase().includes(term) ||
        book.description?.toLowerCase().includes(term) ||
        book.category?.toLowerCase().includes(term)
      );
    }
    
    // Apply category filter
    if (selectedCategory !== 'All') {
      result = result.filter(book => book.category === selectedCategory);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'author':
          return a.author.localeCompare(b.author);
        case 'rating':
          return parseFloat(b.rating) - parseFloat(a.rating);
        case 'recent':
        default:
          return new Date(b.publishedDate) - new Date(a.publishedDate);
      }
    });
    
    setFilteredBooks(result);
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, selectedCategory, sortBy, books]);
  
  // Get current books for pagination
  const indexOfLastBook = currentPage * booksPerPage;
  const indexOfFirstBook = indexOfLastBook - booksPerPage;
  const currentBooks = filteredBooks.slice(indexOfFirstBook, indexOfLastBook);
  const totalPages = Math.ceil(filteredBooks.length / booksPerPage);
  
  // Change page
  const paginate = (pageNumber) => setCurrentPage(pageNumber);
  
  // Toggle view mode
  const toggleViewMode = () => {
    setViewMode(prevMode => prevMode === 'grid' ? 'list' : 'grid');
  };

  const toggleTheme = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    document.documentElement.classList.toggle('dark', newDarkMode);
    localStorage.setItem('darkMode', newDarkMode);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  
  // Handle search form submission
  const handleSearch = (e) => {
    e.preventDefault();
    setSearchTerm(searchInputRef.current.value);
  };
  
  // Clear search
  const clearSearch = () => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
  };

  const displayBooks = filteredBooks.length > 0 ? currentBooks : [];

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setSearchTerm('');
    setSortBy('recent');
    setCurrentPage(1);

    const grid = document.querySelector('.books-grid');
    if (grid) {
      window.scrollTo({
        top: grid.offsetTop - 100,
        behavior: 'smooth',
      });
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading your books...</p>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      {/* Navigation Bar */}
      <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
        <div className="container">
          <Link to="/" className="logo">
            <BookOpenCheck className="logo-icon" />
            <span>BookReader</span>
          </Link>
          
          <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
            <form className="search-form" onSubmit={handleSearch}>
              <div className="search-input-container">
                <Search className="search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search books, authors, or categories..."
                  defaultValue={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" className="clear-search" onClick={clearSearch}>
                    <X size={16} />
                  </button>
                )}
                <button type="submit" className="search-button">Search</button>
              </div>
            </form>
            
            <div className="nav-actions">
              <button className="nav-link" onClick={() => navigate('/library')}>
                <BookOpen className="nav-icon" /> My Library
              </button>
              <button className="nav-link" onClick={() => navigate('/saved')}>
                <Bookmark className="nav-icon" /> Saved
              </button>
              <div className="theme-toggle-container">
                <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
                  {darkMode ? <Sun className="icon" /> : <Moon className="icon" />}
                </button>
              </div>
              <button className="btn btn-outline" onClick={() => navigate('/login')}>
                <LogIn className="icon" /> Sign In
              </button>
            </div>
          </div>
          
          <button className="mobile-menu-btn" onClick={toggleMenu} aria-label="Toggle menu">
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero">
        <div className="container">
          <motion.div 
            className="hero-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>Discover Your Next Favorite Book</h1>
            <p className="subtitle">
              Thousands of ebooks available for free. Read online or download to your device.
            </p>
            
            <div className="search-container">
              <div className="search-box">
                <Search className="search-icon" />
                <input
                  type="text"
                  placeholder="Search for books, authors, or categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <button className="search-btn">Search</button>
              </div>
              <div className="trending-tags">
                <span>Trending:</span>
                <a href="#fiction">Fiction</a>
                <a href="#romance">Romance</a>
                <a href="#thriller">Thriller</a>
                <a href="#biography">Biography</a>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Featured Books Section */}
        <section className="section featured-books">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Featured Books</h2>
              <button className="view-all">
                View All <ChevronRight className="icon" />
              </button>
            </div>
            
            {displayBooks.length > 0 ? (
              <div className="books-grid">
                {displayBooks.slice(0, 4).map((book, index) => (
  <motion.div 
    key={book.id} 
    className="book-card"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1 }}
    onClick={() => handleBookClick(book.id)}
    style={{ cursor: 'pointer' }}
  >
                    <div className="book-cover">
                      <img 
                        src={book.coverImage || getDefaultCoverImage(book)} 
                        alt={book.title}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = getDefaultCoverImage(book);
                        }}
                        style={{ cursor: 'default' }}
                      />
                      <div className="book-actions">
                        <button className="icon-btn" title="Add to favorites">
                          <Heart className="icon" />
                        </button>
                        <button className="icon-btn" title="Download">
                          <Download className="icon" />
                        </button>
                        <button className="icon-btn" title="Share">
                          <Share2 className="icon" />
                        </button>
                      </div>
                    </div>
                    <div className="book-details">
                      <h3 className="book-title">
                        {book.title || 'Untitled'}
                      </h3>
                      <p className="book-author">
                        {book.author || 'Unknown Author'}
                      </p>
                      <div className="book-meta">
                        <span className="rating">
                          <Star className="icon filled" /> {book.rating || '4.5'}
                        </span>
                        <span className="pages">
                          <BookOpen className="icon" /> {book.pages || 'N/A'}
                        </span>
                      </div>
                      <div className="book-tags">
                        <span className="tag">{book.category || 'Fiction'}</span>
                        <span className="tag free">FREE</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-results">
                <img src="/no-results.svg" alt="No results found" />
                <h3>No books found</h3>
                <p>We couldn't find any books matching your search. Try different keywords.</p>
                <button 
                  className="btn btn-outline" 
                  onClick={() => setSearchTerm('')}
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </section>

        {/* All Books Section */}
        {!searchTerm && displayBooks.length > 0 && (
          <section className="section all-books">
            <div className="container">
              <div className="section-header">
                <h2 className="section-title">All Books</h2>
                <button className="view-all" onClick={() => window.scrollTo({top: document.querySelector('.books-grid')?.offsetTop - 100, behavior: 'smooth'})}>
                  View All <ChevronRight className="icon" />
                </button>
              </div>
              
              <div className="books-grid">
                {displayBooks.map((book, index) => (
  <motion.div 
    key={book.id} 
    className="book-card"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.1 * (index % 4) }}
    onClick={() => handleBookClick(book.id)}
    style={{ cursor: 'pointer' }}
  >
                    <div className="book-cover">
            <img 
  src={book.coverImage || getDefaultCoverImage(book)} 
  alt={book.title}
  onError={(e) => {
    e.target.onerror = null;
    e.target.src = getDefaultCoverImage(book);
  }}
  style={{ pointerEvents: 'none' }}
/>
                      <div className="book-actions">
                        <button className="icon-btn" title="Add to favorites">
                          <Heart className="icon" />
                        </button>
                      </div>
                    </div>
                    <div className="book-details">
                      <h3 className="book-title">
                        {book.title || 'Untitled'}
                      </h3>
                      <p className="book-author">
                        {book.author || 'Unknown Author'}
                      </p>
                      <div className="book-meta">
                        <span className="rating">
                          <Star className="icon filled" /> {book.rating || '4.5'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <div className="logo">
                <BookOpenCheck className="logo-icon" />
                <span>BookStore</span>
              </div>
              <p className="footer-text">
                Your one-stop destination for free ebooks. Read online or download to your device.
              </p>
            </div>
            
            <div className="footer-section">
              <h3>Quick Links</h3>
              <ul className="footer-links">
                <li><button className="footer-link" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>Home</button></li>
                <li><button className="footer-link" onClick={() => window.scrollTo({top: document.querySelector('.books-grid')?.offsetTop - 100, behavior: 'smooth'})}>Browse Books</button></li>
                <li><button className="footer-link" onClick={() => window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})}>Categories</button></li>
                <li><button className="footer-link" onClick={() => window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})}>About Us</button></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h3>Categories</h3>
              <ul className="footer-links">
                <li>
                  <button
                    className="footer-link"
                    onClick={() => handleCategoryClick('Fiction')}
                  >
                    Fiction
                  </button>
                </li>
                <li>
                  <button
                    className="footer-link"
                    onClick={() => handleCategoryClick('Non-Fiction')}
                  >
                    Non-Fiction
                  </button>
                </li>
                <li>
                  <button
                    className="footer-link"
                    onClick={() => handleCategoryClick('Science Fiction')}
                  >
                    Science Fiction
                  </button>
                </li>
                <li>
                  <button
                    className="footer-link"
                    onClick={() => handleCategoryClick('Romance')}
                  >
                    Romance
                  </button>
                </li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h3>Newsletter</h3>
              <p className="footer-text">
                Subscribe to our newsletter for the latest books and updates.
              </p>
              <form className="newsletter-form">
                <input 
                  type="email" 
                  placeholder="Your email address" 
                  required 
                  className="newsletter-input"
                />
                <button type="submit" className="btn btn-primary">
                  Subscribe
                </button>
              </form>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} BookStore. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;

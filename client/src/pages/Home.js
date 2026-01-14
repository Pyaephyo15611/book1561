import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { collection, getDocs } from 'firebase/firestore/lite';
import { db } from '../firebase/config';
import { API_URL, apiGet } from '../utils/apiConfig';
import {
  Facebook,
  Instagram,
  Twitter,
  Youtube
} from 'lucide-react';
import CategorySection from '../components/CategorySection';
import './Home.css';
import bannerLogo from '../assets/logo.png';

console.log('API_URL configured as:', API_URL);

const Home = () => {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const defaultCategorySections = [
    {
      title: 'တာရာပွကြီး',
      keywords: ['literature', 'arts', 'ရသစာပေ', 'fiction', 'novel', 'story'],
      route: 'ရသစာပေ'
    },
    {
      title: 'အောင်မြင်ရေးစာပေများ',
      keywords: ['success', 'self-help', 'အောင်မြင်ရေး', 'motivation', 'business', 'achievement'],
      route: 'အောင်မြင်ရေး'
    },
    {
      title: 'မြိုင်ရာဇာ တွတ်ပီ ',
      keywords: ['comic', 'ရုပ်ပြ', 'graphic', 'manga', 'cartoon'],
      route: 'ရုပ်ပြ'
    },
    {
      title: 'ဘိုဘို',
      keywords: ['short story', 'ဝတ္ထုတို', 'short', 'story collection'],
      route: 'ဝတ္ထုတို'
    },
    {
      title: 'ကိုတင့် ကိုရွှေထူး',
      keywords: ['ကိုတင့်', 'ကိုရွှေထူး', 'tint', 'shwe htoo'],
      route: 'ကိုတင့် ကိုရွှေထူး'
    },
    {
      title: 'ကာတွန်းနှင့်ရုပ်ပြများ',
      keywords: ['ကာတွန်း', 'ရုပ်ပြ', 'comic', 'cartoon', 'graphic', 'manga'],
      route: 'ကာတွန်းနှင့်ရုပ်ပြများ'
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
  const lastFetchAtRef = useRef(0);

  const fetchBooks = useCallback(async () => {
    try {
      lastFetchAtRef.current = Date.now();
      let booksData = [];

      try {
        console.log('Fetching books from API...');
        const response = await apiGet('/api/books', {
          headers: { 'Accept': 'application/json' }
        });
        booksData = Array.isArray(response.data) ? response.data : [];
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

      // Sort books by creation date (newest first) or by ID if no date available
      const sortedBooks = enhancedBooks.sort((a, b) => {
        // Try to sort by createdAt timestamp first
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        // Fallback to sorting by ID (assuming newer IDs are larger)
        if (a.id && b.id) {
          return b.id.localeCompare(a.id);
        }
        // Final fallback to maintain original order
        return 0;
      });

      setBooks(sortedBooks);
      setFilteredBooks(sortedBooks);

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
        let data = [];

        const response = await apiGet('/api/sections', {
          params: { _ts: Date.now() }
        });
        data = response.data;

        if (Array.isArray(data) && data.length > 0) {
          const normalized = data
            .filter((s) => s && s.title && s.route)
            .map((s) => ({
              title: String(s.title || '').trim(),
              route: String(s.route || '').trim(),
              layout: s?.layout === 'grid' ? 'grid' : 'scroll',
              keywords: Array.isArray(s.keywords)
                ? s.keywords
                : typeof s.keywords === 'string'
                  ? s.keywords
                      .split(',')
                      .map((k) => k.trim())
                      .filter(Boolean)
                  : []
            }));
          if (normalized.length > 0) {
            setCategorySections(normalized);
          }
        }
      } catch (e) {
        // Don't wipe out a previously loaded sections list (that causes "shows then disappears").
        // Only fall back to defaults if we don't have any sections yet.
        setCategorySections((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : defaultCategorySections));
      }
    };
    fetchSections();
    // defaultCategorySections is a constant defined in render scope; safe to ignore per ESLint rules
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_URL]);

  const displayBooks = filteredBooks.length > 0 ? filteredBooks : books;

  // Category mapping function to match books to categories
  const normalizeCategory = (value) => {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  };

  const matchBookToExactCategoryRoute = (book, categoryRoute) => {
    return normalizeCategory(book?.category) === normalizeCategory(categoryRoute);
  };

  
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Structured Data for Homepage
  const homepageStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Digitalcomic.site",
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
        <title>Digitalcomic.site</title>
        <meta name="description" content="Discover thousands of free ebooks and digital books. Read online or download instantly. Browse fiction, non-fiction, literature, and more." />
        <meta name="keywords" content="free ebooks, online books, digital books, read books online, download books, bookstore, literature, fiction, non-fiction" />
        <link rel="canonical" href={siteUrl} />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:title" content="Digitalcomic.site" />
        <meta property="og:description" content="Discover thousands of free ebooks and digital books. Read online or download instantly." />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Digitalcomic.site" />
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
                onClick={() => window.scrollTo({ top: document.querySelector('.trending-books')?.offsetTop - 90, behavior: 'smooth' })}
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
        {/* Category Sections - Show filtered results when searching */}
        <>
          {categorySections.map((category) => {
            const categoryBooks = displayBooks.filter((book) => {
              if (
                matchBookToExactCategoryRoute(book, category?.route) ||
                matchBookToExactCategoryRoute(book, category?.title)
              ) {
                return true;
              }

              return false;
            });
            
            // Hide empty sections after loading.
            // Keep visible during loading so skeletons can render.
            if (!loading && categoryBooks.length === 0) {
              return null;
            }

            return (
              <CategorySection
                key={category.route || category.title}
                title={category.title}
                books={categoryBooks}
                categoryRoute={category.route}
                layout={category.layout}
                loading={loading}
              />
            );
          })}
        </>

      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            <p>&copy; 2026 BookStore. မူပိုင်ခွင့်အားလုံး လုံခြုံပါသည်။</p>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
};

export default Home;


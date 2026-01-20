import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
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
import promoImage from '../assets/lf (2).webp';

console.log('API_URL configured as:', API_URL);

const Home = () => {
  const [loading] = useState(false);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const navigate = useNavigate();
  const promo = {
    enabled: true,
    badgeText: 'FEATURED TITLE',
    title: 'Dandadan manga(eng)',
    description:
      'အစမှဖတ် နောက်ဆုံးမှစဖတ်. Like Follow. အကျဉ်းချုပ်. သရဲတွေကိုမယုံတဲ့ကောင်လေးKen Takakuraနဲ့ aliensတွေကိုမယုံတဲ့ကောင်မလေး Momo Ayase..သူတိုရဲ့နားလည်မှုထက်သာလွန်တဲ့ထူးဆန်းမှုမျိုးကိုကြုံတွေ့လာရတဲ့အခါ',
    imageUrl: promoImage,
    linkUrl: 'https://t.me/digitalcomicsite'
  };

  const handlePromoNavigate = useCallback(
    (url) => {
      const next = String(url || '').trim();
      if (!next) return;

      if (/^https?:\/\//i.test(next)) {
        window.open(next, '_blank', 'noopener,noreferrer');
        return;
      }

      navigate(next);
    },
    [navigate]
  );
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
  const [sectionBooksByKey, setSectionBooksByKey] = useState({});
  const [sectionLoadingByKey, setSectionLoadingByKey] = useState({});
  const [sectionErrorByKey, setSectionErrorByKey] = useState({});
  const sectionFetchedRef = useRef({});
  const sectionObserverRef = useRef(null);
  const sectionNodeByKeyRef = useRef({});

  const fetchSectionBooks = useCallback(async (section) => {
    const key = section?.route || section?.title;
    if (!key) return;
    if (sectionFetchedRef.current[key]) return;

    sectionFetchedRef.current[key] = true;
    setSectionLoadingByKey((prev) => ({ ...prev, [key]: true }));
    setSectionErrorByKey((prev) => ({ ...prev, [key]: '' }));

    try {
      const keywords = Array.isArray(section?.keywords) ? section.keywords : [];
      const limit = section?.layout === 'grid' ? 8 : 24;
      const resp = await apiGet('/api/sections/books', {
        params: {
          route: section?.route || '',
          title: section?.title || '',
          keywords: keywords.join(','),
          limit,
          _ts: Date.now()
        }
      });

      const data = Array.isArray(resp.data) ? resp.data : [];
      setSectionBooksByKey((prev) => ({ ...prev, [key]: data }));
    } catch (e) {
      sectionFetchedRef.current[key] = false;
      setSectionErrorByKey((prev) => ({ ...prev, [key]: e?.message || 'Failed to load section books' }));
      setSectionBooksByKey((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setSectionLoadingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = entry.target?.getAttribute('data-section-key');
          if (!key) continue;
          const section = categorySections.find((s) => (s?.route || s?.title) === key);
          if (section) {
            fetchSectionBooks(section);
          }
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.01 }
    );

    sectionObserverRef.current = observer;
    const nodes = Object.values(sectionNodeByKeyRef.current);
    nodes.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => {
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
    };
  }, [categorySections, fetchSectionBooks]);

  // Structured Data for Homepage
  const homepageStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Digitalcomic.site",
    "url": "https://digitalcomic.site",
    "description": "Free online bookstore with thousands of ebooks. Read and download books online.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://digitalcomic.site/search/{search_term_string}",
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

      {promo?.enabled && (
        <section className="promo-section">
          <div className="container">
            <div
              className="promo-card"
              role="link"
              tabIndex={0}
              onClick={() => handlePromoNavigate(promo.linkUrl)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePromoNavigate(promo.linkUrl);
                }
              }}
            >
              <div className="promo-media">
                {promo.imageUrl && <img className="promo-image" src={promo.imageUrl} alt={promo.title || 'Promo'} />}
                {promo.badgeText && <div className="promo-badge">{promo.badgeText}</div>}
              </div>

              <div className="promo-content">
                {promo.title && <h2 className="promo-title">{promo.title}</h2>}
                {promo.description && <p className="promo-description">{promo.description}</p>}
              </div>
            </div>
          </div>
        </section>
      )}

    <main className="main-content">
      {/* Category Sections - Show filtered results when searching */}
      <>
        {categorySections.map((category) => {
          const key = category.route || category.title;
          const categoryBooks = key && Array.isArray(sectionBooksByKey[key]) ? sectionBooksByKey[key] : [];
          const isSectionLoading = key ? Boolean(sectionLoadingByKey[key]) : false;
          const sectionError = key ? String(sectionErrorByKey[key] || '') : '';

          // Hide empty sections after loading.
          // Keep visible during loading so skeletons can render.
          if (!isSectionLoading && !sectionError && categoryBooks.length === 0 && sectionFetchedRef.current[key]) {
            return null;
          }

          return (
            <div
              key={key}
              data-section-key={key}
              ref={(node) => {
                if (!key) return;

                const prev = sectionNodeByKeyRef.current[key];
                sectionNodeByKeyRef.current[key] = node;

                const observer = sectionObserverRef.current;
                if (!observer) return;

                if (prev && prev !== node) {
                  try {
                    observer.unobserve(prev);
                  } catch {
                    // ignore
                  }
                }

                if (node) {
                  try {
                    observer.observe(node);
                  } catch {
                    // ignore
                  }
                }
              }}
            >
              <CategorySection
                title={category.title}
                books={categoryBooks}
                categoryRoute={category.route}
                layout={category.layout}
                loading={isSectionLoading || loading}
              />
            </div>
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

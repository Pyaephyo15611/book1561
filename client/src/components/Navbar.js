import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { LogOut, Search as SearchIcon, User, X } from 'lucide-react';
import './Navbar.css';
import logo from '../assets/logo3.png';
import { apiGet } from '../utils/apiConfig';

const Navbar = ({ user }) => {
  const navigate = useNavigate();
  const desktopSearchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const userMenuRef = useRef(null);
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSignOut = async () => {
    const shouldSignOut = window.confirm('Sign out of your account?');
    if (!shouldSignOut) return;
    try {
      await signOut(auth);
      setUserMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Sign out failed. Please try again.');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMobileSearch = () => {
    const next = !mobileSearchOpen;
    setMobileSearchOpen(next);
    if (!next) {
      setIsSearchOpen(false);
    }
    window.setTimeout(() => {
      if (!next) return;
      const input = mobileSearchInputRef.current || desktopSearchInputRef.current;
      if (input) input.focus();
    }, 50);
  };

  useEffect(() => {
    let didCancel = false;
    const fetchBooks = async () => {
      try {
        const response = await apiGet('/api/books', {
          params: { _ts: Date.now() }
        });
        if (!didCancel) {
          setBooks(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        if (!didCancel) setBooks([]);
      }
    };

    fetchBooks();

    const handleFocus = () => {
      fetchBooks();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      didCancel = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const searchSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];

    return books
      .filter((b) => b && b.id)
      .filter((b) => {
        const title = (b.title || '').toLowerCase();
        const author = (b.author || '').toLowerCase();
        const category = (b.category || '').toLowerCase();
        return title.includes(term) || author.includes(term) || category.includes(term);
      })
      .slice(0, 8);
  }, [books, searchTerm]);

  const submitSearch = () => {
    const term = searchTerm.trim();
    if (!term) return;
    setIsSearchOpen(false);
    setMobileSearchOpen(false);
    navigate(`/search/${encodeURIComponent(term)}`);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img src={logo} alt="Digitalcomic.site logo" className="navbar-logo-img" />
          <span className="navbar-logo-text">Digitalcomic.site</span>
        </Link>

        <div className="navbar-search">
          <div className="amazon-search">
            <span className="amazon-search-leading" aria-hidden="true">
              <SearchIcon size={18} />
            </span>
            <input
              className="amazon-search-input"
              ref={desktopSearchInputRef}
              type="text"
              placeholder="Search for books..."
              value={searchTerm}
              onChange={(e) => {
                const next = e.target.value;
                setSearchTerm(next);
                setIsSearchOpen(!!next.trim());
              }}
              onFocus={() => {
                if (searchTerm.trim()) setIsSearchOpen(true);
              }}
              onBlur={() => {
                window.setTimeout(() => setIsSearchOpen(false), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  submitSearch();
                }
              }}
            />

            <button
              type="button"
              className="amazon-search-btn"
              onClick={submitSearch}
              aria-label="Search"
            >
              <SearchIcon size={18} />
            </button>

            <button
              type="button"
              className="amazon-search-close"
              onClick={() => {
                setMobileSearchOpen(false);
                setIsSearchOpen(false);
              }}
              aria-label="Close search"
            >
              <X size={18} />
            </button>
          </div>

          {isSearchOpen && searchSuggestions.length > 0 ? (
            <div className="navbar-search-suggestions" role="listbox" aria-label="Search suggestions">
              {searchSuggestions.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="navbar-search-suggestion"
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchTerm('');
                    setMobileSearchOpen(false);
                    navigate(`/book/${b.id}`);
                  }}
                >
                  <span className="navbar-search-suggestion-title">{b.title || 'Untitled'}</span>
                  <span className="navbar-search-suggestion-meta">
                    {(b.author || 'Unknown Author')}{b.category ? ` • ${b.category}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="navbar-actions">
          <button
            className="mobile-search-toggle"
            type="button"
            onClick={toggleMobileSearch}
            aria-label="Toggle search"
          >
            {mobileSearchOpen ? <X size={22} /> : <SearchIcon size={22} />}
          </button>

          {user ? (
            <div className="navbar-user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="navbar-button navbar-user-trigger"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="User menu"
              >
                <User size={20} />
              </button>

              {userMenuOpen ? (
                <div className="navbar-user-dropdown" role="menu" aria-label="User menu">
                  <button
                    type="button"
                    className="navbar-user-item"
                    onClick={handleSignOut}
                    role="menuitem"
                  >
                    <LogOut size={18} />
                    <span>Logout</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Link to="/login" className="navbar-button navbar-auth-button">
              Sign In
            </Link>
          )}
        </div>
      </div>

      <div className={mobileSearchOpen ? 'navbar-mobile-search-panel open' : 'navbar-mobile-search-panel'}>
        <div className="amazon-search">
          <span className="amazon-search-leading" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <input
            className="amazon-search-input"
            ref={mobileSearchInputRef}
            type="text"
            placeholder="Search for books..."
            value={searchTerm}
            onChange={(e) => {
              const next = e.target.value;
              setSearchTerm(next);
              setIsSearchOpen(!!next.trim());
            }}
            onFocus={() => {
              if (searchTerm.trim()) setIsSearchOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setIsSearchOpen(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchTerm.trim()) {
                submitSearch();
              }
            }}
          />
        </div>

        {isSearchOpen && searchSuggestions.length > 0 ? (
          <div className="navbar-search-suggestions" role="listbox" aria-label="Search suggestions">
            {searchSuggestions.map((b) => (
              <button
                key={b.id}
                type="button"
                className="navbar-search-suggestion"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchTerm('');
                  setMobileSearchOpen(false);
                  navigate(`/book/${b.id}`);
                }}
              >
                <span className="navbar-search-suggestion-title">{b.title || 'Untitled'}</span>
                <span className="navbar-search-suggestion-meta">
                  {(b.author || 'Unknown Author')}{b.category ? ` • ${b.category}` : ''}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
};

export default Navbar;


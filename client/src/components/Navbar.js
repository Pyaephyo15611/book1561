import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { LogOut, Menu, Search as SearchIcon, X } from 'lucide-react';
import axios from 'axios';
import './Navbar.css';
import logo from '../assets/logo3.png';
import { API_URL } from '../utils/apiConfig';

const Navbar = ({ user }) => {
  const navigate = useNavigate();
  const desktopSearchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const handleSignOut = async () => {
    const shouldSignOut = window.confirm('Sign out of your account?');
    if (!shouldSignOut) return;
    try {
      await signOut(auth);
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Sign out failed. Please try again.');
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

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
        const response = await axios.get(`${API_URL}/api/books`, {
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
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    navigate(`/search/${encodeURIComponent(term)}`);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo" onClick={() => setMobileMenuOpen(false)}>
          <img src={logo} alt="BookStore logo" className="navbar-logo-img" />
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
                    setMobileMenuOpen(false);
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

          <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Toggle menu">
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        <div className={`navbar-menu ${mobileMenuOpen ? 'open' : ''}`}>
          <Link to="/authors" className="navbar-link" onClick={() => setMobileMenuOpen(false)}>
            Authors
          </Link>
          <Link to="/admin" className="navbar-link" onClick={() => setMobileMenuOpen(false)}>
            Admin
          </Link>
          {user ? (
            <>
              <span className="navbar-user">
                {user.displayName || user.email?.split('@')[0] || 'User'}
              </span>
              <button onClick={handleSignOut} className="navbar-button">
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="navbar-button" onClick={() => setMobileMenuOpen(false)}>
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
                  setMobileMenuOpen(false);
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


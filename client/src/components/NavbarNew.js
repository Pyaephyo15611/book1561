import React from 'react';
import { Link } from 'react-router-dom';
import { Home, BookOpen, Menu, X, Moon, Sun, User, LogIn } from 'lucide-react';

const Navbar = ({ user, darkMode, onToggleDarkMode }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
      <div className="container">
        <Link to="/" className="logo" onClick={closeMenu}>
          <BookOpen className="logo-icon" />
          <span>BookStore</span>
        </Link>
        
        <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
          <Link to="/" className="nav-link" onClick={closeMenu}>
            <Home className="nav-icon" /> Home
          </Link>
          <Link to="/browse" className="nav-link" onClick={closeMenu}>
            <BookOpen className="nav-icon" /> Browse
          </Link>
          
          <div className="nav-actions">
            <button 
              className="theme-toggle" 
              onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="icon" /> : <Moon className="icon" />}
            </button>
            
            {user ? (
              <Link to="/profile" className="btn btn-outline" onClick={closeMenu}>
                <User className="icon" /> Profile
              </Link>
            ) : (
              <Link to="/login" className="btn btn-outline" onClick={closeMenu}>
                <LogIn className="icon" /> Sign In
              </Link>
            )}
            
            {user?.uid === process.env.REACT_APP_ADMIN_UID && (
              <Link to="/admin" className="btn btn-primary" onClick={closeMenu}>
                Admin Panel
              </Link>
            )}
          </div>
        </div>
        
        <button 
          className="mobile-menu-btn" 
          onClick={toggleMenu}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;

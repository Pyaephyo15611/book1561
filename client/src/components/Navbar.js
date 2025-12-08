import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { LogOut, BookOpen, Menu, X } from 'lucide-react';
import './Navbar.css';

const Navbar = ({ user }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo" onClick={() => setMobileMenuOpen(false)}>
          <BookOpen size={24} />
          <span>BookStore</span>
        </Link>
        {/* Search bar moved to Home page above trending section */}
        <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Toggle menu">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className={`navbar-menu ${mobileMenuOpen ? 'open' : ''}`}>
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
    </nav>
  );
};

export default Navbar;


import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Send } from 'lucide-react';
import { auth, db } from './firebase/config';
import { doc, getDoc } from 'firebase/firestore/lite';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import BookDetail from './pages/BookDetail';
import BlogDetail from './pages/BlogDetail';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Category from './pages/Category';
import Search from './pages/Search';
import AuthorList from './pages/AuthorList';
import AuthorDetail from './pages/AuthorDetail';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [telegramUrl, setTelegramUrl] = useState('https://t.me/your_channel');
  const [telegramText, setTelegramText] = useState('Telegram ကို Join လုပ်ပါ');

  useEffect(() => {
    const syncTelegramUrl = () => {
      try {
        const saved = localStorage.getItem('app_settings_telegram_url');
        if (saved && typeof saved === 'string') {
          setTelegramUrl(saved);
        }

        const savedText = localStorage.getItem('app_settings_telegram_text');
        if (savedText && typeof savedText === 'string') {
          setTelegramText(savedText);
        }
      } catch {
        // ignore
      }
    };

    syncTelegramUrl();

    const handleStorage = (e) => {
      if (e.key === 'app_settings_telegram_url') {
        syncTelegramUrl();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('telegramUrlUpdated', syncTelegramUrl);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('telegramUrlUpdated', syncTelegramUrl);
    };
  }, []);

  const handleTelegramClick = async (e) => {
    e.preventDefault();

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(telegramUrl);
      }
    } catch {
      // ignore
    }

    window.open(telegramUrl, '_blank', 'noreferrer');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        let displayName = firebaseUser.displayName;
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.name) {
            displayName = data.name;
          }
        }

        const augmentedUser = {
          ...firebaseUser,
          displayName,
        };

        setUser(augmentedUser);
      } catch (error) {
        console.error('Error loading user profile:', error);
        setUser(firebaseUser);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <Router
      future={{
        v7_startTransition: true,
      }}
    >
      <div className="App">
        <Navbar user={user} />
        <div className="telegram-global-wrap">
          <div className="container">
            <a className="telegram-global" href={telegramUrl} onClick={handleTelegramClick} rel="noreferrer">
              <span className="telegram-global-text">{telegramText}</span>
            </a>
          </div>
        </div>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/blog/:id" element={<BlogDetail />} />
          <Route 
            path="/login" 
            element={user ? <Navigate to="/" /> : <Login />} 
          />
          <Route path="/admin" element={<Admin user={user} />} />
          <Route path="/category/:name" element={<Category />} />
          <Route path="/search/:term" element={<Search />} />
          <Route path="/authors" element={<AuthorList />} />
          <Route path="/author/:name" element={<AuthorDetail />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

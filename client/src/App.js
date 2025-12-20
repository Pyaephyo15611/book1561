import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import BookDetail from './pages/BookDetail';
import BlogDetail from './pages/BlogDetail';
import B2Reader from './pages/B2Reader';
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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/blog/:id" element={<BlogDetail />} />
          <Route path="/read/:id" element={<B2Reader />} />
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

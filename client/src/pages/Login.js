import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore/lite';
import { auth, db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader } from 'lucide-react';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  
  const googleProvider = new GoogleAuthProvider();

  const formatAuthError = (error) => {
    if (!error || !error.code) return 'Something went wrong. Please try again.';

    switch (error.code) {
      case 'auth/user-disabled':
        return 'Your account has been disabled. Please contact support.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please try again.';
      case 'auth/email-already-in-use':
        return 'This email is already registered. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      default:
        return 'Unable to sign in. Please check your details and try again.';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Optionally set the display name for nicer UI later
        if (name.trim()) {
          try {
            await updateProfile(user, { displayName: name.trim() });
          } catch (profileError) {
            console.error('Error updating profile:', profileError);
          }
        }

        // Create or update a Firestore user document
        const userRef = doc(db, 'users', user.uid);
        await setDoc(
          userRef,
          {
            name: name.trim() || null,
            email: user.email,
            createdAt: new Date().toISOString()
          },
          { merge: true }
        );
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Ensure user document exists on sign in as well
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            name: user.displayName || null,
            email: user.email,
            createdAt: new Date().toISOString()
          });
        }
      }
      navigate('/');
    } catch (error) {
      console.error('Auth error:', error);
      setError(formatAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');

    try {
      // Add additional scopes if needed
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Create or update user document in Firestore
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || null,
          email: user.email,
          photoURL: user.photoURL || null,
          createdAt: new Date().toISOString(),
          provider: 'google'
        });
      } else {
        // Update existing user with latest info
        await setDoc(userRef, {
          name: user.displayName || userSnap.data().name,
          email: user.email,
          photoURL: user.photoURL || userSnap.data().photoURL,
          lastLogin: new Date().toISOString()
        }, { merge: true });
      }

      navigate('/');
    } catch (error) {
      console.error('Google sign-in error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed. Please try again.');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Popup was blocked. Please allow popups for this site and try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for Google sign-in. Please contact support.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setError('Google sign-in is not enabled. Please use email/password instead.');
      } else if (error.code === 'auth/invalid-credential') {
        setError('Invalid credentials. Please try again or use email/password sign-in.');
      } else {
        setError(error.message || 'Failed to sign in with Google. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>{isSignUp ? 'SIGN UP' : 'LOGIN'}</h1>

        {error && (
          <div className="error-message">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="input-group">
              <label htmlFor="name">NAME</label>
              <input
                type="text"
                id="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">EMAIL</label>
            <input
              type="email"
              id="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">PASSWORD</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading || googleLoading}>
            {loading ? (
              <>
                <Loader className="spinning" size={20} />
                <span>Please wait...</span>
              </>
            ) : (
              <span>{isSignUp ? 'SIGN UP' : 'SIGN IN'}</span>
            )}
          </button>
        </form>

        <div className="divider">OR</div>

        <div className="social-login">
          <button
            type="button"
            className="social-btn"
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading}
            aria-label="Sign in with Google"
          >
            {googleLoading ? <Loader className="spinning" size={20} /> : 'G'}
          </button>
        </div>

        <div className="login-footer">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="link-button"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;

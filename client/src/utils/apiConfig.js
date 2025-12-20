// Simple API URL configuration
// IMPORTANT: In Netlify, set REACT_APP_API_URL to use HTTPS (e.g., https://minibook-z3t6.onrender.com)
// This avoids mixed content errors when the frontend is served over HTTPS

// In development, CRA proxy will forward /api to http://localhost:5000
// Use relative URLs to avoid hardcoded ports. For production, set REACT_APP_API_URL.
const baseUrlEnv = process.env.REACT_APP_API_URL;
const API_URL = baseUrlEnv && baseUrlEnv.trim()
  ? baseUrlEnv.trim().replace(/\/$/, '')
  : '';

console.log('🔌 API Config - Using API URL:', API_URL || '(relative)');

export { API_URL };


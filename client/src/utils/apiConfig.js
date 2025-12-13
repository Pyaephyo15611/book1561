// Simple API URL configuration
// IMPORTANT: In Netlify, set REACT_APP_API_URL to use HTTPS (e.g., https://minibook-z3t6.onrender.com)
// This avoids mixed content errors when the frontend is served over HTTPS

const baseUrlEnv = process.env.REACT_APP_API_URL;
const API_URL = baseUrlEnv && baseUrlEnv.trim()
  ? baseUrlEnv.trim().replace(/\/$/, '') // Remove trailing slash
  : 'http://localhost:5000';

export { API_URL };


import axios from 'axios';

// Simple API URL configuration
// IMPORTANT: In Netlify, set REACT_APP_API_URL to use HTTPS (e.g., https://minibook-z3t6.onrender.com)
// This avoids mixed content errors when the frontend is served over HTTPS

// In development, CRA proxy will forward /api to http://localhost:5000
// Use relative URLs to avoid hardcoded ports. For production, set REACT_APP_API_URL.
const baseUrlEnv = process.env.REACT_APP_API_URL;
const API_URL = (baseUrlEnv && baseUrlEnv.trim())
  ? baseUrlEnv.trim().replace(/\/$/, '')
  : (process.env.NODE_ENV === 'production' ? 'https://minibook-z3t6.onrender.com' : '');

const renderFallbackEnv = process.env.REACT_APP_RENDER_FALLBACK_BASE;
const RENDER_FALLBACK_BASE = (renderFallbackEnv && renderFallbackEnv.trim())
  ? renderFallbackEnv.trim().replace(/\/$/, '')
  : 'https://minibook-z3t6.onrender.com';

const DEFAULT_TIMEOUT_MS = 15000;

console.log('🔌 API Config - Using API URL:', API_URL || '(relative)');

const joinUrl = (base, path) => {
  if (!path) return base || '';
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

export const apiGet = async (path, config = {}) => {
  const timeout = typeof config.timeout === 'number' ? config.timeout : DEFAULT_TIMEOUT_MS;
  const bases = (API_URL && API_URL.trim())
    ? [API_URL, '', RENDER_FALLBACK_BASE]
    : ['', RENDER_FALLBACK_BASE];
  let lastErr;

  for (const base of bases) {
    try {
      const resp = await axios.get(joinUrl(base, path), {
        ...config,
        timeout,
        headers: {
          Accept: 'application/json',
          ...(config.headers || {})
        }
      });

      // If we accidentally hit the frontend host (Netlify/Vercel) with a relative /api call,
      // we may get back index.html (content-type text/html). In that case, fall back.
      const contentType = String(resp?.headers?.['content-type'] || '').toLowerCase();
      const looksLikeJson = contentType.includes('application/json') || typeof resp.data === 'object';
      if (!looksLikeJson) {
        throw new Error(`Non-JSON response from ${joinUrl(base, path)} (${contentType || 'unknown content-type'})`);
      }

      return resp;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr;
};

export { API_URL, RENDER_FALLBACK_BASE, DEFAULT_TIMEOUT_MS };

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Generate a default cover image URL for books without covers
export function getDefaultCoverImage(book) {
  const title = (book.title || 'Book').substring(0, 20).replace(/\s+/g, '+');
  const author = (book.author || 'Author').substring(0, 15).replace(/\s+/g, '+');

  const gradients = [
    { from: '667eea', to: '764ba2' },
    { from: 'f093fb', to: '4facfe' },
    { from: '4facfe', to: '00f2fe' },
    { from: '43e97b', to: '38f9d7' },
    { from: 'fa709a', to: 'fee140' },
    { from: '30cfd0', to: '330867' },
    { from: 'a8edea', to: 'fed6e3' },
    { from: 'ff9a9e', to: 'fecfef' }
  ];

  const hash = (book.id || book.title || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradient = gradients[hash % gradients.length];

  const svg = `<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#${gradient.from};stop-opacity:1" /><stop offset="100%" style="stop-color:#${gradient.to};stop-opacity:1" /></linearGradient></defs><rect width="400" height="600" fill="url(#grad)"/><text x="50%" y="45%" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${title}</text><text x="50%" y="55%" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">${author}</text></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Helper function to get proper cover image URL (returns null if no cover image)
export function getCoverImageUrl(book) {
  if (!book || !book.coverImage || book.coverImage.trim() === '') {
    return null;
  }

  if (book.cdnCoverUrl) {
    return book.cdnCoverUrl;
  }

  const coverImage = book.coverImage.trim();
  
  // If it's already a full URL (http/https), use it as is
  if (coverImage.startsWith('http://') || coverImage.startsWith('https://')) {
    return coverImage;
  }
  
  // If it's a relative path starting with /uploads, construct full URL
  if (coverImage.startsWith('/uploads')) {
    const baseUrl = API_URL.endsWith('/api') ? API_URL.replace('/api', '') : API_URL.replace('/api/', '');
    return `${baseUrl}${coverImage}`;
  }
  
  // If it's a B2 filename or other format, use the proxy endpoint
  if (book.id) {
    const baseUrl = API_URL.endsWith('/api') ? API_URL.replace('/api', '') : API_URL.replace('/api/', '');
    return `${baseUrl}/api/books/${book.id}/cover`;
  }
  
  // No cover image available
  return null;
}


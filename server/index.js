const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const B2 = require('backblaze-b2');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy (needed for Render/Heroku/etc to get correct protocol)
app.set('trust proxy', true);

// Helper function to get the correct protocol (force HTTPS in production)
const getProtocol = (req) => {
  // Check X-Forwarded-Proto header first (set by proxies/load balancers)
  const forwardedProto = req.get('x-forwarded-proto');
  if (forwardedProto === 'https') {
    return 'https';
  }
  // In production (Render), force HTTPS
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return 'https';
  }
  // Otherwise use the request protocol
  return req.protocol;
};

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploads folder locally for cover images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// No local file serving - all files are in Cloudinary (images) and Backblaze B2 (PDFs)
// (Legacy local files in 'uploads' are served above)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

// Simple admin password authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// JSON file for storing book metadata
const BOOKS_FILE = path.join(__dirname, 'books.json');
const BLOGS_FILE = path.join(__dirname, 'blogs.json');

// Initialize books.json if it doesn't exist
async function initBooksFile() {
  try {
    await fs.access(BOOKS_FILE);
  } catch {
    await fs.writeFile(BOOKS_FILE, JSON.stringify([], null, 2));
    console.log('📝 Created books.json file');
  }
}

// Initialize blogs.json if it doesn't exist
async function initBlogsFile() {
  try {
    await fs.access(BLOGS_FILE);
  } catch {
    await fs.writeFile(BLOGS_FILE, JSON.stringify([], null, 2));
    console.log('📝 Created blogs.json file');
  }
}

initBooksFile();
initBlogsFile();

const hasB2Credentials =
  process.env.B2_APPLICATION_KEY_ID &&
  process.env.B2_APPLICATION_KEY &&
  process.env.B2_BUCKET_ID;

// Cloudinary configuration
const hasCloudinaryCredentials =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (hasCloudinaryCredentials) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary credentials loaded');
} else {
  console.warn(
    '⚠️  WARNING: Cloudinary credentials not fully configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET for CDN image/PDF hosting.'
  );
}

const b2 = hasB2Credentials
  ? new B2({
      applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
      applicationKey: process.env.B2_APPLICATION_KEY
    })
  : null;

const CDN_URL_TTL_SECONDS = parseInt(process.env.CDN_URL_TTL_SECONDS || '3600', 10);

let timeOffset = 0;
async function syncTime() {
  try {
    // Fetch a reliable time source (Google) to calculate local clock drift
    const response = await axios.head('https://www.google.com');
    if (response.headers.date) {
      const serverDate = new Date(response.headers.date);
      const localDate = new Date();
      timeOffset = serverDate.getTime() - localDate.getTime();
      console.log(`⏱️  Time sync: Local clock is ${timeOffset > 0 ? 'behind' : 'ahead'} by ${Math.abs(timeOffset) / 1000}s`);
    }
  } catch (error) {
    console.warn('⚠️  Time sync failed, using local time:', error.message);
  }
}
// Sync time on startup
syncTime();

let b2Authorized = false;
let b2AuthData = null;

async function ensureB2Authorized() {
  if (!b2) {
    throw new Error('Backblaze B2 credentials are not configured.');
  }

  if (!b2Authorized) {
    try {
      const authResponse = await b2.authorize();
      if (!authResponse || !authResponse.data) {
        throw new Error('Failed to authorize with Backblaze B2');
      }
      b2Authorized = true;
      b2AuthData = authResponse.data;
      console.log('✅ B2 authorized successfully');
    } catch (error) {
      console.error('B2 Authorization Error:', error.message || error);
      throw new Error(`B2 authorization failed: ${error.message || 'Check your credentials'}`);
    }
  }
}

// Helper: upload buffer to Cloudinary (image or raw for PDFs)
function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    if (!hasCloudinaryCredentials) {
      return resolve(null);
    }

    const uploadOptions = {
      folder: process.env.CLOUDINARY_FOLDER || 'bookstore',
      resource_type: 'image',
      ...options
    };

    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        console.warn('⚠️  Cloudinary upload failed:', error.message || error);
        return resolve(null); // Do not hard fail; just skip Cloudinary
      }
      resolve(result);
    });

    uploadStream.end(buffer);
  });
}

function encodeB2Path(fileName) {
  return fileName
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function toCloudinaryContextValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\|/g, ' ');
}

function buildCloudinaryCustomContext({ title, author, description, category, readingTime, rating, isTrending }) {
  return {
    title: toCloudinaryContextValue(title),
    author: toCloudinaryContextValue(author),
    description: toCloudinaryContextValue(description),
    category: toCloudinaryContextValue(category),
    readingTime: toCloudinaryContextValue(readingTime),
    rating: rating ? String(rating) : '0',
    isTrending: isTrending ? 'true' : 'false'
  };
}

function buildCloudinaryContextString(custom) {
  return Object.entries(custom)
    .map(([k, v]) => `${k}=${toCloudinaryContextValue(v)}`)
    .join('|');
}

function getB2DownloadBaseUrl() {
  if (process.env.B2_CDN_BASE_URL) return process.env.B2_CDN_BASE_URL.replace(/\/+$/, '');
  if (b2AuthData?.downloadUrl) return b2AuthData.downloadUrl;
  if (process.env.B2_BUCKET_ID) return `https://f${process.env.B2_BUCKET_ID}.backblazeb2.com`;
  return null;
}

async function getB2CdnUrl(fileName) {
  if (!hasB2Credentials || !fileName || !process.env.B2_BUCKET_NAME) {
    return null;
  }

  await ensureB2Authorized();

  const auth = await b2.getDownloadAuthorization({
    bucketId: process.env.B2_BUCKET_ID,
    fileNamePrefix: encodeB2Path(fileName), // Ensure prefix matches encoded path
    validDurationInSeconds: CDN_URL_TTL_SECONDS
  });

  const token = auth?.data?.authorizationToken;
  const baseUrl = getB2DownloadBaseUrl();

  if (!token || !baseUrl) {
    console.warn('⚠️  Unable to build CDN URL - missing token or base URL');
    return null;
  }

  const encodedPath = encodeB2Path(fileName);
  const bucketName = process.env.B2_BUCKET_NAME;

  return `${baseUrl}/file/${bucketName}/${encodedPath}?Authorization=${encodeURIComponent(token)}`;
}

async function uploadPdfToB2(fileBuffer, fileName, mimeType) {
  try {
    await ensureB2Authorized();
    
    // Get upload URL for the bucket
    const uploadUrlResponse = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID
    });

    if (!uploadUrlResponse || !uploadUrlResponse.data) {
      throw new Error('Failed to get upload URL from Backblaze B2');
    }

    // Upload the file
    const uploadResponse = await b2.uploadFile({
      uploadUrl: uploadUrlResponse.data.uploadUrl,
      uploadAuthToken: uploadUrlResponse.data.authorizationToken,
      fileName: fileName,
      data: fileBuffer,
      mime: mimeType || 'application/pdf'
    });

    if (!uploadResponse || !uploadResponse.data) {
      throw new Error('Failed to upload file to Backblaze B2');
    }

    return uploadResponse.data.fileName;
  } catch (error) {
    b2Authorized = false;
    console.error('B2 Upload Error:', error.message || error);
    throw new Error(`Backblaze upload failed: ${error.message || 'Unknown error'}`);
  }
}

// Helper function to construct Backblaze B2 public URL (S3-style endpoint)
// Returns a proxy URL through our server for reliability (works with private buckets)
function getB2PublicUrl(fileName) {
  // Use proxy endpoint instead of direct B2 URL for better reliability
  // This works even if the bucket is private
  // The actual URL will be constructed when the image is requested
  return fileName; // Return just the filename, we'll use proxy endpoint
}

// Helper function to upload books.json to Backblaze B2
async function uploadBooksJsonToB2(booksData) {
  if (!hasB2Credentials) {
    console.error('❌ B2 credentials not configured - cannot upload books.json');
    return false;
  }
  
  try {
    await ensureB2Authorized();
    const jsonString = JSON.stringify(booksData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf8');
    const fileName = 'data/books.json';
    
    console.log(`📤 Attempting to upload books.json (${booksData.length} books) to Backblaze...`);
    
    const uploadUrlResponse = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID
    });
    
    if (!uploadUrlResponse || !uploadUrlResponse.data) {
      throw new Error('Failed to get upload URL from Backblaze B2');
    }
    
    const uploadResponse = await b2.uploadFile({
      uploadUrl: uploadUrlResponse.data.uploadUrl,
      uploadAuthToken: uploadUrlResponse.data.authorizationToken,
      fileName: fileName,
      data: jsonBuffer,
      mime: 'application/json'
    });
    
    if (!uploadResponse || !uploadResponse.data) {
      throw new Error('Upload response was empty');
    }
    
    console.log(`✅ Successfully uploaded books.json to Backblaze: ${fileName} (${booksData.length} books)`);
    return true;
  } catch (error) {
    console.error('❌ FAILED to upload books.json to Backblaze:', error.message);
    console.error('   Error details:', error);
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    return false;
  }
}

// Helper function to download books.json from Backblaze B2
async function downloadBooksJsonFromB2() {
  if (!hasB2Credentials) {
    return null;
  }
  
  try {
    await ensureB2Authorized();
    const fileName = 'data/books.json';
    
    // List files to find books.json and get its fileId
    const listResponse = await b2.listFileNames({
      bucketId: process.env.B2_BUCKET_ID,
      startFileName: fileName,
      maxFileCount: 10
    });
    
    // Find the exact file
    const fileInfo = listResponse?.data?.files?.find(
      file => file.fileName === fileName
    );
    
    if (!fileInfo || !fileInfo.fileId) {
      return null;
    }
    
    // Download the file using downloadFileById
    const downloadResponse = await b2.downloadFileById({
      fileId: fileInfo.fileId
    });
    
    if (!downloadResponse || !downloadResponse.data) {
      return null;
    }
    
    // Convert buffer to string and parse JSON
    const jsonString = Buffer.isBuffer(downloadResponse.data) 
      ? downloadResponse.data.toString('utf8')
      : downloadResponse.data;
    const books = JSON.parse(jsonString);
    console.log(`✅ Downloaded ${books.length} books from Backblaze`);
    return books;
  } catch (error) {
    // File might not exist yet, that's okay
    if (error.message && (error.message.includes('not found') || error.message.includes('No such file'))) {
      return null;
    }
    console.warn('⚠️  Failed to download books.json from Backblaze:', error.message);
    return null;
  }
}

// Helper functions for books - use Backblaze B2 for persistence
async function getBooks() {
  // Prefer Backblaze B2 persistence (works on ephemeral hosts like Render)
  if (hasB2Credentials) {
    const b2Books = await downloadBooksJsonFromB2();
    if (Array.isArray(b2Books)) {
      console.log(`✅ Loaded ${b2Books.length} books from Backblaze data/books.json`);
      return b2Books;
    }
  }

  // Next try local books.json for complete metadata
  try {
    const data = await fs.readFile(BOOKS_FILE, 'utf8');
    const books = JSON.parse(data);
    console.log(`✅ Read ${books.length} books from local books.json`);
    return books;
  } catch (error) {
    console.warn('⚠️ books.json not found or corrupted, falling back to Cloudinary:', error.message);

    // Fallback: Build book list dynamically from Cloudinary (covers) and Backblaze B2 (PDFs)
    const result = [];

    if (!hasCloudinaryCredentials) {
      console.warn('⚠️ Cloudinary not configured; cannot list books without books.json. Returning empty list.');
      return result;
    }

    try {
      // Determine covers folder used when uploading (see POST /api/admin/books)
      const coversFolder = (process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/book-covers` : 'bookstore/book-covers');

      // List cover assets; each cover is uploaded with public_id like `${coversFolder}/cover-${bookId}`
      const resourcesResp = await cloudinary.api.resources({
        type: 'upload',
        prefix: `${coversFolder}/cover-`,
        max_results: 500,
        context: true
      });

      const covers = resourcesResp?.resources || [];

      // For each cover, derive bookId and then discover PDFs on B2 by prefix
      for (const r of covers) {
        const publicId = r.public_id; // e.g., bookstore/book-covers/cover-<bookId>
        const lastSegment = publicId.split('/').pop();
        const bookId = lastSegment.startsWith('cover-') ? lastSegment.substring('cover-'.length) : lastSegment;

        // Read metadata from Cloudinary context if available
        const ctx = (r.context && r.context.custom) ? r.context.custom : {};
        const title = ctx.title || '';
        const author = ctx.author || '';
        const description = ctx.description || '';
        const category = ctx.category || 'General';
        const readingTime = ctx.readingTime || 'Flexible';
        const rating = ctx.rating ? Number(ctx.rating) : 0;
        const isTrending = ctx.isTrending === 'true' || ctx.isTrending === true;

        // Discover PDFs on Backblaze
        let b2FileName = null;
        let pdfParts = null;
        if (hasB2Credentials) {
          try {
            await ensureB2Authorized();
            const prefix = `books/${bookId}/`;
            let startFileName = prefix;
            let done = false;
            const files = [];
            while (!done) {
              const resp = await b2.listFileNames({
                bucketId: process.env.B2_BUCKET_ID,
                startFileName,
                maxFileCount: 1000
              });
              const batch = resp?.data?.files || [];
              for (const f of batch) {
                if (f.fileName.startsWith(prefix)) files.push(f);
              }
              startFileName = resp?.data?.nextFileName || '';
              done = !startFileName || !startFileName.startsWith(prefix);
            }

            const partFiles = files.filter(f => f.fileName.includes('/parts/') && f.fileName.toLowerCase().endsWith('.pdf'))
                                   .sort((a, b) => a.fileName.localeCompare(b.fileName));
            if (partFiles.length > 0) {
              let partNumber = 1;
              pdfParts = partFiles.map(f => ({
                partNumber: partNumber++,
                b2FileName: f.fileName,
                fileName: f.fileName
              }));
            } else {
              const single = files.find(f => f.fileName.toLowerCase().endsWith('.pdf'));
              if (single) b2FileName = single.fileName;
            }
          } catch (e) {
            console.warn('⚠️ Failed to list PDFs on B2 for', bookId, e.message || e);
          }
        }

        result.push({
          id: bookId,
          title,
          author,
          description,
          category,
          readingTime,
          rating,
          isTrending,
          createdAt: r.created_at || null,
          updatedAt: r.created_at || null,
          coverImage: r.secure_url,
          cloudinaryCoverUrl: r.secure_url,
          b2FileName,
          pdfParts
        });
      }
    } catch (err) {
      console.error('Error building book list from providers:', err.message || err);
    }

    return result;
  }
}

async function saveBooks(books) {
  try {
    console.log('💾 DEBUG: saveBooks called with books count:', books.length);
    console.log('💾 DEBUG: books.json path:', BOOKS_FILE);
    const jsonString = JSON.stringify(books, null, 2);
    console.log('💾 DEBUG: JSON string length:', jsonString.length);
    
    await fs.writeFile(BOOKS_FILE, jsonString);
    console.log(`✅ DEBUG: Successfully saved ${books.length} books to books.json`);

    if (hasB2Credentials) {
      const uploaded = await uploadBooksJsonToB2(books);
      console.log(`📤 DEBUG: Upload books.json to Backblaze result: ${uploaded}`);
    }
    
    // Verify the write
    const verifyData = await fs.readFile(BOOKS_FILE, 'utf8');
    const verifyBooks = JSON.parse(verifyData);
    console.log('💾 DEBUG: Verification - books in file after save:', verifyBooks.length);
    
    return true;
  } catch (error) {
    console.error('❌ DEBUG: Error saving books:', error);
    throw error;
  }
}

// Helper functions for blogs JSON file
async function getBlogs() {
  try {
    const data = await fs.readFile(BLOGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading blogs:', error);
    return [];
  }
}

async function saveBlogs(blogs) {
  try {
    await fs.writeFile(BLOGS_FILE, JSON.stringify(blogs, null, 2));
  } catch (error) {
    console.error('Error saving blogs:', error);
    throw error;
  }
}

// Middleware to verify admin password
function verifyAdminPassword(req, res, next) {
  const password = req.headers['x-admin-password'] || req.body.adminPassword;
  
  if (!password) {
    return res.status(401).json({ error: 'Admin password required' });
  }
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  
  next();
}

// Serve cover image - Moved to later in the file (around line 1500) to use proxy logic
// app.get('/api/books/:id/cover', ...);

// Get all books
app.get('/api/books', async (req, res) => {
  try {
    // Disable caching to avoid stale lists
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const books = await getBooks();
    
    // Transform book data to ensure consistent response format
    const booksWithUrls = books.map(book => {
      // Create a clean response object with only necessary fields
      const response = {
        id: book.id,
        title: book.title,
        author: book.author,
        description: book.description,
        category: book.category,
        readingTime: book.readingTime,
        rating: book.rating || 0,
        isTrending: book.isTrending || false,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        // Use Cloudinary URL if available, otherwise use the coverImage
        coverImage: book.cloudinaryCoverUrl || book.coverImage,
        // Include the Cloudinary URL separately for backward compatibility
        cloudinaryCoverUrl: book.cloudinaryCoverUrl,
        // Include B2 file name for PDFs
        b2FileName: book.b2FileName,
        // Include PDF parts if they exist
        pdfParts: book.pdfParts
      };

      return response;
    });
    
    res.json(booksWithUrls);
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ error: 'Failed to fetch books', details: error.message });
  }
});

// Get book by ID
app.get('/api/books/:id', async (req, res) => {
  try {
    // Disable caching for single book too
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // Transform cover image URL to use proxy endpoint if it's from B2
    const protocol = getProtocol(req);
    const bookResponse = { ...book };

    // Prefer Cloudinary cover URL if available
    if (book.cloudinaryCoverUrl) {
      bookResponse.coverImage = book.cloudinaryCoverUrl;
    } else if (book.b2CoverFileName || (book.coverImage && !book.coverImage.startsWith('/') && !book.coverImage.startsWith('http'))) {
      // It's a B2 filename, use proxy endpoint
      bookResponse.coverImage = `${protocol}://${req.get('host')}/api/books/${req.params.id}/cover`;
    } else if (book.coverImage && book.coverImage.startsWith('/uploads')) {
      // Local file, use direct URL
      bookResponse.coverImage = `${protocol}://${req.get('host')}${book.coverImage}`;
    }
    // If coverImage is already a full URL (http/https), keep it as is
    
    res.json(bookResponse);
  } catch (error) {
    console.error('Error fetching book:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// Get signed CDN URLs (Backblaze uses Cloudflare CDN)
app.get('/api/books/:id/cdn', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find((b) => b.id === req.params.id);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (!hasB2Credentials || !process.env.B2_BUCKET_NAME) {
      return res.json({
        cdnPdfUrl: null,
        cdnCoverUrl: null,
        parts: [],
        ttlSeconds: CDN_URL_TTL_SECONDS,
        message: 'Backblaze B2 credentials are missing; CDN URLs disabled'
      });
    }

    const response = {
      cdnPdfUrl: null,
      cdnCoverUrl: null,
      parts: [],
      ttlSeconds: CDN_URL_TTL_SECONDS
    };

    // PDF (single file)
    if (!book.pdfParts || book.pdfParts.length === 0) {
      const fileName = book.b2FileName || book.fileName;
      response.cdnPdfUrl = fileName ? await getB2CdnUrl(fileName) : null;
    } else {
      // PDF parts
      const partsWithCdn = [];
      for (const part of book.pdfParts.sort((a, b) => a.partNumber - b.partNumber)) {
        const cdnUrl = part.b2FileName ? await getB2CdnUrl(part.b2FileName) : null;
        partsWithCdn.push({ ...part, cdnUrl });
      }
      response.parts = partsWithCdn;
      response.cdnPdfUrl = partsWithCdn[0]?.cdnUrl || null;
    }

    // Cover image
    const coverFileName =
      book.b2CoverFileName ||
      (book.coverImage &&
      !book.coverImage.startsWith('/') &&
      !book.coverImage.startsWith('http')
        ? book.coverImage
        : null);

    response.cdnCoverUrl = coverFileName ? await getB2CdnUrl(coverFileName) : null;

    res.json(response);
  } catch (error) {
    console.error('Error building CDN URLs:', error);
    res.status(500).json({ error: 'Failed to generate CDN URLs', details: error.message });
  }
});

// Admin upload endpoint
// Files go directly to Cloudinary (images) and Backblaze B2 (PDFs)
app.post(
  '/api/admin/books',
  verifyAdminPassword,
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfPart1' }, { name: 'pdfPart2' }, { name: 'pdfPart3' },
    { name: 'pdfPart4' }, { name: 'pdfPart5' }, { name: 'pdfPart6' },
    { name: 'pdfPart7' }, { name: 'pdfPart8' }, { name: 'pdfPart9' },
    { name: 'pdfPart10' }
  ]),
  async (req, res) => {
    try {
      console.log('🔍 DEBUG: Admin upload request received');
      console.log('🔍 DEBUG: Request body:', req.body);
      console.log('🔍 DEBUG: Request files:', req.files ? Object.keys(req.files) : 'No files');
      
      const { title, author, description, category, readingTime, rating, isTrending, hasParts, partsCount } = req.body;

      console.log('🔍 DEBUG: Extracted fields:', { title, author, description, category, readingTime, rating, isTrending, hasParts, partsCount });

      if (!title || !author) {
        console.log('❌ DEBUG: Missing title or author');
        return res.status(400).json({ error: 'Title and author are required' });
      }

      console.log('📚 DEBUG: Getting current books...');
      const books = await getBooks();
      console.log(`📚 DEBUG: Current books count: ${books.length}`);
      
      const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`🆔 DEBUG: Generated bookId: ${bookId}`);

      let pdfParts = [];
      let b2PdfFileName = null;

      // Handle PDF parts (for comics)
      if (hasParts === 'true' && partsCount) {
        const partsCountNum = parseInt(partsCount);
        pdfParts = [];
        
        for (let i = 1; i <= partsCountNum; i++) {
          const partFile = req.files[`pdfPart${i}`]?.[0];
          if (partFile) {
            const sanitizedPartName = `part-${i}-${Date.now()}-${partFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            
            // Upload PDF part to Backblaze B2 (tolerate failures)
            try {
              const b2PartFileName = await uploadPdfToB2(
                partFile.buffer,
                `books/${bookId}/parts/${sanitizedPartName}.pdf`,
                partFile.mimetype || 'application/pdf'
              );
              console.log(`✅ Uploaded Part ${i} to Backblaze: ${b2PartFileName}`);
              pdfParts.push({
                partNumber: i,
                b2FileName: b2PartFileName,
                fileName: b2PartFileName
              });
            } catch (e) {
              console.warn(`⚠️  Failed to upload Part ${i} to Backblaze:`, e.message || e);
              // Skip this part, continue with metadata-only if needed
            }
          }
        }
      } else if (req.files['pdf']?.[0]) {
        // Handle single PDF file - upload to Backblaze B2
        const pdfFile = req.files['pdf'][0];
        const sanitizedPdfName = `book-${Date.now()}-${pdfFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        
        // Upload PDF to Backblaze B2 (tolerate failures)
        try {
          b2PdfFileName = await uploadPdfToB2(
            pdfFile.buffer,
            `books/${bookId}/${sanitizedPdfName}.pdf`,
            pdfFile.mimetype || 'application/pdf'
          );
          console.log('✅ Uploaded PDF to Backblaze:', b2PdfFileName);
        } catch (e) {
          console.warn('⚠️  Failed to upload PDF to Backblaze, continuing without attaching file:', e.message || e);
          b2PdfFileName = null;
        }
      } else if (!req.files['pdf'] && !hasParts) {
        // Allow metadata-only book creation regardless of B2 configuration
        console.warn('⚠️  Creating book without PDF (metadata-only).');
      }

      // Upload Cover Image to Cloudinary if provided and configured; else use fallback
      let cloudinaryCoverUrl = null;
      if (req.files['coverImage']?.[0] && hasCloudinaryCredentials) {
        const imageFile = req.files['coverImage'][0];
        // Use upload_stream instead of direct upload for buffers to avoid signature timestamp issues
        const customContext = buildCloudinaryCustomContext({
          title: title.trim(),
          author: author.trim(),
          description: description?.trim() || '',
          category: category?.trim() || 'General',
          readingTime: readingTime?.trim() || 'Flexible',
          rating,
          isTrending: isTrending === 'true'
        });
        const cloudinaryResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: process.env.CLOUDINARY_FOLDER ?
                `${process.env.CLOUDINARY_FOLDER}/book-covers` : 'bookstore/book-covers',
              public_id: `cover-${bookId}`,
              resource_type: 'image',
              format: 'webp',
              quality: 'auto:good',
              width: 600,
              crop: 'limit',
              timestamp: Math.floor((Date.now() + timeOffset) / 1000),
              context: {
                custom: customContext
              },
              transformation: [
                { width: 600, height: 900, crop: 'fill' },
                { quality: 'auto:good' }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(imageFile.buffer);
        });
        if (!cloudinaryResult?.secure_url) {
          throw new Error('Failed to upload cover image to Cloudinary');
        }
        cloudinaryCoverUrl = cloudinaryResult.secure_url;
        console.log('✅ Uploaded cover image to Cloudinary:', cloudinaryCoverUrl);
      } else if (req.files['coverImage']?.[0] && !hasCloudinaryCredentials) {
        // No Cloudinary: save nothing, but log
        console.warn('⚠️  Cover image provided but Cloudinary is not configured. Using default cover.');
      }

      // Choose cover image: Cloudinary result or default placeholder (public hosted fallback)
      const coverImageUrl = cloudinaryCoverUrl || 'https://via.placeholder.com/600x900.webp?text=Book+Cover';

      const bookData = {
        id: bookId,
        title: title.trim(),
        author: author.trim(),
        description: description?.trim() || '',
        category: category?.trim() || 'General',
        coverImage: coverImageUrl,
        readingTime: readingTime?.trim() || 'Flexible',
        rating: rating ? Number(rating) : 0,
        isTrending: isTrending === 'true',
        pdfParts: pdfParts.length > 0 ? pdfParts : null,
        b2FileName: pdfParts.length > 0 ? null : b2PdfFileName,
        fileName: pdfParts.length > 0 ? null : b2PdfFileName,
        storage: {
          cover: cloudinaryCoverUrl ? {
            provider: 'cloudinary',
            url: cloudinaryCoverUrl
          } : {
            provider: 'local',
            url: coverImageUrl
          },
          pdf: {
            provider: hasB2Credentials ? 'backblaze' : 'none',
            path: pdfParts.length > 0 ? pdfParts.map(p => p.b2FileName) : b2PdfFileName
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('📖 DEBUG: Created bookData:', JSON.stringify(bookData, null, 2));

      books.push(bookData);
      console.log(`📚 DEBUG: Books after push: ${books.length} items`);
      
      console.log('💾 DEBUG: Attempting to save books...');
      await saveBooks(books);
      console.log('✅ DEBUG: Save completed');
      
      res.status(201).json(bookData);
    } catch (error) {
      console.error('Error uploading book:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to upload book',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// Update book
app.put(
  '/api/admin/books/:id',
  verifyAdminPassword,
  upload.fields([{ name: 'pdf' }, { name: 'coverImage' }]),
  async (req, res) => {
    try {
      const { title, author, description, category, readingTime, rating, isTrending } = req.body;
      const books = await getBooks();
      const index = books.findIndex((b) => b.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Book not found' });
      }

      const book = books[index];

      // Update PDF if provided - upload directly to Backblaze B2 only
      if (req.files['pdf'] && req.files['pdf'][0]) {
        const pdfFile = req.files['pdf'][0];
        const sanitizedPdfName = `${Date.now()}-${pdfFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        let b2PdfFileName = null;
        if (hasB2Credentials) {
          try {
            const b2Name = `pdfs/${sanitizedPdfName}`;
            b2PdfFileName = await uploadPdfToB2(pdfFile.buffer, b2Name, pdfFile.mimetype || 'application/pdf');
            console.log('✅ Uploaded updated PDF to Backblaze:', b2PdfFileName);
          } catch (b2Error) {
            console.error('❌ Failed to upload updated PDF to Backblaze:', b2Error.message || b2Error);
            throw new Error(`Failed to upload PDF to Backblaze: ${b2Error.message}`);
          }
        } else {
          throw new Error('Backblaze B2 not configured - cannot store PDF files');
        }

        book.b2FileName = b2PdfFileName;
        book.fileName = b2PdfFileName;
      }

      // Update cover if provided - upload directly to Cloudinary only
      if (req.files['coverImage'] && req.files['coverImage'][0]) {
        const imageFile = req.files['coverImage'][0];
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        let cloudinaryCoverUrl = null;
        // Upload new cover to Cloudinary
        try {
          const customContext = buildCloudinaryCustomContext({
            title: title !== undefined ? title.trim() : book.title,
            author: author !== undefined ? author.trim() : book.author,
            description: description !== undefined ? description.trim() : book.description,
            category: category !== undefined ? (category.trim() || 'General') : book.category,
            readingTime: readingTime !== undefined ? readingTime.trim() : book.readingTime,
            rating: rating !== undefined ? rating : book.rating,
            isTrending: isTrending !== undefined ? (isTrending === 'true' || isTrending === true) : book.isTrending
          });
          // Use stream upload to avoid timestamp issues
          const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                resource_type: 'image',
                folder: (process.env.CLOUDINARY_FOLDER || 'bookstore') + '/covers',
                public_id: sanitizedImageName.replace(/\.[^.]+$/, ''),
                context: { custom: customContext },
                timestamp: Math.floor((Date.now() + timeOffset) / 1000) // Use synced time
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(imageFile.buffer);
          });

          if (result && result.secure_url) {
            cloudinaryCoverUrl = result.secure_url;
            console.log('✅ Uploaded updated cover image to Cloudinary:', cloudinaryCoverUrl);
          } else {
            throw new Error('Cloudinary upload returned no URL');
          }
        } catch (cloudErr) {
          console.error('❌ Failed to upload updated cover to Cloudinary:', cloudErr.message || cloudErr);
          throw new Error(`Failed to upload cover image to Cloudinary: ${cloudErr.message}`);
        }

        book.coverImage = cloudinaryCoverUrl;
        book.coverImageUrl = cloudinaryCoverUrl;
        book.cloudinaryCoverUrl = cloudinaryCoverUrl;
      }

      // Update simple fields
      if (title !== undefined) book.title = title.trim();
      if (author !== undefined) book.author = author.trim();
      if (description !== undefined) book.description = description.trim();
      if (category !== undefined) book.category = category.trim() || 'General';
      if (readingTime !== undefined) book.readingTime = readingTime.trim();
      if (rating !== undefined) book.rating = rating ? Number(rating) : null;
      if (isTrending !== undefined) book.isTrending = isTrending === 'true' || isTrending === true;

      // Persist updated metadata into Cloudinary context for the main cover asset
      if (hasCloudinaryCredentials) {
        try {
          const coversFolder = (process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/book-covers` : 'bookstore/book-covers');
          const coverPublicId = `${coversFolder}/cover-${req.params.id}`;
          const customContext = buildCloudinaryCustomContext({
            title: book.title,
            author: book.author,
            description: book.description,
            category: book.category,
            readingTime: book.readingTime,
            rating: book.rating,
            isTrending: book.isTrending
          });
          await cloudinary.uploader.explicit(coverPublicId, {
            type: 'upload',
            resource_type: 'image',
            context: buildCloudinaryContextString(customContext)
          });
        } catch (e) {
          console.warn('⚠️  Failed to update Cloudinary context for book cover:', e.message || e);
        }
      }

      books[index] = book;
      await saveBooks(books);
      res.json(book);
    } catch (error) {
      console.error('Error updating book:', error);
      res.status(500).json({ error: error.message || 'Failed to update book' });
    }
  }
);

// Backfill / update metadata without reuploading files
app.patch(
  '/api/admin/books/:id/metadata',
  verifyAdminPassword,
  async (req, res) => {
    try {
      const { title, author, description, category, readingTime, rating, isTrending } = req.body || {};

      const books = await getBooks();
      const index = books.findIndex((b) => b.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Book not found' });
      }

      const book = books[index];

      if (title !== undefined) book.title = String(title).trim();
      if (author !== undefined) book.author = String(author).trim();
      if (description !== undefined) book.description = String(description).trim();
      if (category !== undefined) book.category = String(category).trim() || 'General';
      if (readingTime !== undefined) book.readingTime = String(readingTime).trim();
      if (rating !== undefined) book.rating = rating ? Number(rating) : 0;
      if (isTrending !== undefined) book.isTrending = isTrending === 'true' || isTrending === true;

      book.updatedAt = new Date().toISOString();

      if (hasCloudinaryCredentials) {
        try {
          const coversFolder = (process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/book-covers` : 'bookstore/book-covers');
          const coverPublicId = `${coversFolder}/cover-${req.params.id}`;
          const customContext = buildCloudinaryCustomContext({
            title: book.title,
            author: book.author,
            description: book.description,
            category: book.category,
            readingTime: book.readingTime,
            rating: book.rating,
            isTrending: book.isTrending
          });
          await cloudinary.uploader.explicit(coverPublicId, {
            type: 'upload',
            resource_type: 'image',
            context: buildCloudinaryContextString(customContext)
          });
        } catch (e) {
          console.warn('⚠️  Failed to update Cloudinary context for book cover:', e.message || e);
        }
      }

      books[index] = book;
      await saveBooks(books);

      res.json(book);
    } catch (error) {
      console.error('Error updating book metadata:', error);
      res.status(500).json({ error: error.message || 'Failed to update book metadata' });
    }
  }
);

// Delete book
app.delete('/api/admin/books/:id', verifyAdminPassword, async (req, res) => {
  try {
    const books = await getBooks();
    const index = books.findIndex((b) => b.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const book = books[index];

    // Attempt to delete B2 files associated with this book
    const b2Result = { attempted: [], deleted: [], errors: [] };
    if (hasB2Credentials) {
      try {
        await ensureB2Authorized();

        // Helper to delete by filename
        const deleteByFileName = async (fileName) => {
          if (!fileName) return;
          try {
            const listResp = await b2.listFileNames({
              bucketId: process.env.B2_BUCKET_ID,
              startFileName: fileName,
              maxFileCount: 10
            });
            const file = listResp?.data?.files?.find((f) => f.fileName === fileName);
            b2Result.attempted.push(fileName);
            if (file) {
              await b2.deleteFileVersion({ fileId: file.fileId, fileName: file.fileName });
              b2Result.deleted.push(fileName);
              console.log('🗑️  Deleted from B2:', file.fileName);
            } else {
              b2Result.errors.push({ fileName, error: 'Not found in B2' });
              console.warn('⚠️  B2 file not found for delete:', fileName);
            }
          } catch (e) {
            b2Result.errors.push({ fileName, error: e.message || String(e) });
            console.error('❌ B2 delete error for', fileName, e.message || e);
          }
        };

        // Single-file books
        await deleteByFileName(book.b2FileName || book.fileName);

        // Parts (comics)
        if (Array.isArray(book.pdfParts)) {
          for (const part of book.pdfParts) {
            await deleteByFileName(part?.b2FileName || part?.fileName);
          }
        }

        // Optional: cleanup folder prefix books/{bookId}/
        const prefix = `books/${book.id}/`;
        try {
          let startFileName = prefix;
          let finished = false;
          while (!finished) {
            const resp = await b2.listFileNames({
              bucketId: process.env.B2_BUCKET_ID,
              startFileName,
              maxFileCount: 1000
            });
            const files = (resp?.data?.files || []).filter(f => f.fileName.startsWith(prefix));
            if (files.length === 0) {
              finished = true;
              break;
            }
            for (const f of files) {
              try {
                await b2.deleteFileVersion({ fileId: f.fileId, fileName: f.fileName });
                b2Result.deleted.push(f.fileName);
                console.log('🗑️  Deleted from B2 (prefix sweep):', f.fileName);
              } catch (e) {
                b2Result.errors.push({ fileName: f.fileName, error: e.message || String(e) });
                console.error('❌ B2 delete error (prefix sweep):', f.fileName, e.message || e);
              }
            }
            finished = !resp?.data?.nextFileName;
            startFileName = resp?.data?.nextFileName || '';
            if (startFileName && !startFileName.startsWith(prefix)) finished = true;
          }
        } catch (e) {
          console.warn('⚠️  Prefix sweep skipped/failed:', e.message || e);
        }
      } catch (authErr) {
        console.warn('⚠️  Skipping B2 deletion (auth failed):', authErr.message || authErr);
      }
    } else {
      console.warn('⚠️  B2 not configured, skipping remote delete');
    }

    // Remove from local store
    const [deleted] = books.splice(index, 1);
    await saveBooks(books);

    res.json({ success: true, deletedId: deleted.id, b2: b2Result });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: error.message || 'Failed to delete book' });
  }
});

// Toggle trending
app.patch('/api/admin/books/:id/trending', verifyAdminPassword, async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find((b) => b.id === req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    book.isTrending = req.body.isTrending === 'true' || req.body.isTrending === true;
    await saveBooks(books);
    res.json(book);
  } catch (error) {
    console.error('Error updating trending status:', error);
    res.status(500).json({ error: error.message || 'Failed to update trending status' });
  }
});

// Download PDF endpoint - serves file directly with download headers
app.get('/api/books/:id/download', async (req, res) => {
  console.log('📥 Download request for book ID:', req.params.id);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      console.error('Book not found:', req.params.id);
      return res.status(404).json({ error: 'Book not found' });
    }

    // Handle books with multiple parts - create ZIP file
    if (book.pdfParts && book.pdfParts.length > 0) {
      console.log(`📦 Book has ${book.pdfParts.length} parts, creating ZIP file`);
      const zipFileName = book.title ? `${book.title}.zip` : 'book.zip';
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);
      
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);
      
      // Handle errors
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create ZIP file' });
        }
      });
      
      try {
        if (hasB2Credentials) {
          await ensureB2Authorized();
        }
        
        // Download all parts and add to ZIP
        for (const part of book.pdfParts.sort((a, b) => a.partNumber - b.partNumber)) {
          let partData = null;
          
          // Fetch PDF part from Backblaze B2 only (no local storage)
          if (!partData && part.b2FileName && hasB2Credentials) {
            try {
              const listResponse = await b2.listFileNames({
                bucketId: process.env.B2_BUCKET_ID,
                startFileName: part.b2FileName,
                maxFileCount: 10000
              });
              
              if (listResponse?.data?.files) {
                const fileInfo = listResponse.data.files.find(f => 
                  f.fileName === part.b2FileName || 
                  f.fileName.includes(part.b2FileName) ||
                  part.b2FileName.includes(f.fileName)
                );
                
                if (fileInfo) {
                  const downloadResponse = await b2.downloadFileById({
                    fileId: fileInfo.fileId,
                    responseType: 'arraybuffer'
                  });
                  
                  if (downloadResponse?.data) {
                    partData = Buffer.from(downloadResponse.data);
                    console.log(`✅ Downloaded part ${part.partNumber} from B2`);
                  } else if (Buffer.isBuffer(downloadResponse)) {
                    partData = downloadResponse;
                    console.log(`✅ Downloaded part ${part.partNumber} from B2 (direct buffer)`);
                  }
                }
              }
            } catch (b2Error) {
              console.error(`Error downloading part ${part.partNumber} from B2:`, b2Error.message);
            }
          }
          
          if (partData) {
            const partFileName = `Part_${part.partNumber}_${book.title || 'book'}.pdf`;
            archive.append(partData, { name: partFileName });
            console.log(`✅ Added part ${part.partNumber} to ZIP`);
          } else {
            console.warn(`⚠️  Part ${part.partNumber} not found, skipping`);
          }
        }
        
        await archive.finalize();
        console.log('✅ ZIP file created and sent successfully');
        return;
      } catch (zipError) {
        console.error('Error creating ZIP:', zipError);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Failed to create ZIP file', details: zipError.message });
        }
        return;
      }
    }

    const downloadFileName = book.title ? `${book.title}.pdf` : 'book.pdf';
    
    // Fetch PDF from Backblaze B2 only (no local storage)
    const fileName = book.b2FileName || book.fileName;
    
    if (!fileName) {
      console.error('No filename for book:', req.params.id);
      return res.status(400).json({ error: 'Book file not found' });
    }
    
    if (!hasB2Credentials) {
      console.error('B2 credentials not configured');
      return res.status(500).json({ error: 'Backblaze B2 is not configured' });
    }
    
    console.log('Downloading PDF from Backblaze:', fileName);
    
    try {
      // Ensure B2 is authorized
      await ensureB2Authorized();
      
      // Generate signed URL for download to stream it
      const authResponse = await b2.getDownloadAuthorization({
        bucketId: process.env.B2_BUCKET_ID,
        fileNamePrefix: fileName,
        validDurationInSeconds: 3600,
        b2ContentDisposition: `attachment; filename="${encodeURIComponent(downloadFileName)}"`
      });
      
      const token = authResponse?.data?.authorizationToken;
      const baseUrl = getB2DownloadBaseUrl();
      
      if (!token || !baseUrl) {
        throw new Error('Failed to generate B2 download token');
      }
      
      const encodedPath = encodeB2Path(fileName);
      const bucketName = process.env.B2_BUCKET_NAME;
      const signedUrl = `${baseUrl}/file/${bucketName}/${encodedPath}?Authorization=${encodeURIComponent(token)}`;

      console.log('🔄 Proxying download stream from B2:', fileName);
      
      const b2Response = await axios({
        method: 'GET',
        url: signedUrl,
        responseType: 'stream'
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      
      if (b2Response.headers['content-length']) {
        res.setHeader('Content-Length', b2Response.headers['content-length']);
      }
      
      b2Response.data.pipe(res);
      
      b2Response.data.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
          // If headers aren't sent, we can send JSON error. 
          // If they are, the stream will just cut off (browser will see network error).
        }
      });
      
    } catch (downloadError) {
      console.error('❌ Error downloading PDF (signed URL):', downloadError.message);

      // Fallback: stream using Backblaze download by fileId (supports Range)
      try {
        await ensureB2Authorized();
        const listResp = await b2.listFileNames({
          bucketId: process.env.B2_BUCKET_ID,
          startFileName: fileName,
          maxFileCount: 1
        });
        const fileInfo = listResp?.data?.files?.find(f => f.fileName === fileName);
        if (!fileInfo) {
          return res.status(404).json({ error: 'File not found in Backblaze' });
        }

        if (!b2AuthData?.downloadUrl || !b2AuthData?.authorizationToken) {
          return res.status(500).json({ error: 'Missing B2 auth data for direct download' });
        }

        const directUrl = `${b2AuthData.downloadUrl}/b2api/v2/b2_download_file_by_id?fileId=${encodeURIComponent(fileInfo.fileId)}`;
        const headers = { Authorization: b2AuthData.authorizationToken };
        if (req.headers.range) headers.Range = req.headers.range;

        const b2Resp = await axios({
          method: 'GET',
          url: directUrl,
          responseType: 'stream',
          headers,
          validateStatus: (s) => s >= 200 && s < 300
        });

        // Mirror headers and status; add attachment disposition
        if (!res.headersSent) {
          res.status(b2Resp.status);
          if (b2Resp.headers['content-type']) res.setHeader('Content-Type', b2Resp.headers['content-type']);
          if (b2Resp.headers['content-length']) res.setHeader('Content-Length', b2Resp.headers['content-length']);
          if (b2Resp.headers['content-range']) res.setHeader('Content-Range', b2Resp.headers['content-range']);
          if (b2Resp.headers['accept-ranges']) res.setHeader('Accept-Ranges', b2Resp.headers['accept-ranges']);
          if (b2Resp.headers['last-modified']) res.setHeader('Last-Modified', b2Resp.headers['last-modified']);
          if (b2Resp.headers['etag']) res.setHeader('ETag', b2Resp.headers['etag']);
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
        }
        b2Resp.data.pipe(res);
      } catch (fallbackErr) {
        console.error('❌ Fallback (fileId) download failed:', fallbackErr.message);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Failed to download PDF', 
            details: fallbackErr.message || 'Unknown error' 
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in download process:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to download book', 
        details: error.message || 'Unknown error'
      });
    }
  }
});

// Get PDF part endpoint
app.get('/api/books/:id/pdf/part/:partNumber', async (req, res) => {
  const bookId = req.params.id;
  const partNumber = parseInt(req.params.partNumber);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/pdf');
  
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === bookId);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    if (!book.pdfParts || book.pdfParts.length === 0) {
      return res.status(400).json({ error: 'This book does not have PDF parts' });
    }
    
    const part = book.pdfParts.find(p => p.partNumber === partNumber);
    if (!part) {
      return res.status(404).json({ error: `Part ${partNumber} not found` });
    }
    
    // Fetch PDF part from Backblaze B2 only (no local storage)
    if (part.b2FileName && hasB2Credentials) {
      try {
        await ensureB2Authorized();
        const listResponse = await b2.listFileNames({
          bucketId: process.env.B2_BUCKET_ID,
          startFileName: part.b2FileName,
          maxFileCount: 1
        });
        
        if (listResponse?.data?.files && listResponse.data.files.length > 0) {
          const fileInfo = listResponse.data.files.find(f => f.fileName === part.b2FileName);
          if (fileInfo) {
            const downloadResponse = await b2.downloadFileById({
              fileId: fileInfo.fileId
            });
            
            if (downloadResponse && downloadResponse.data) {
              return res.send(Buffer.from(downloadResponse.data));
            }
          }
        }
      } catch (b2Error) {
        console.error('Error downloading from Backblaze:', b2Error);
      }
    }
    
    return res.status(404).json({ error: 'PDF part not found' });
  } catch (error) {
    console.error('Error serving PDF part:', error);
    res.status(500).json({ error: 'Failed to serve PDF part' });
  }
});

// Get PDF view URL (returns proxy URL)
app.get('/api/books/:id/view', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // Handle PDF parts - return first part
    if (book.pdfParts && book.pdfParts.length > 0) {
      if (process.env.B2_CDN_BASE_URL && hasB2Credentials) {
        const partsWithUrls = await Promise.all(
          book.pdfParts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map(async (p) => ({
              partNumber: p.partNumber,
              b2FileName: p.b2FileName,
              viewUrl: await getB2CdnUrl(p.b2FileName)
            }))
        );

        const firstPartUrl = partsWithUrls.find(p => p.partNumber === 1)?.viewUrl;
        if (firstPartUrl) {
          return res.json({
            viewUrl: firstPartUrl,
            isSplit: true,
            totalParts: book.pdfParts.length,
            parts: partsWithUrls
          });
        }
      }

      const protocol = getProtocol(req);
      const proxyUrl = `${protocol}://${req.get('host')}/api/books/${req.params.id}/pdf/part/1`;
      return res.json({
        viewUrl: proxyUrl,
        isSplit: true,
        totalParts: book.pdfParts.length,
        parts: book.pdfParts.map(p => ({
          partNumber: p.partNumber,
          b2FileName: p.b2FileName
        }))
      });
    }
    
    const fileName = book.b2FileName || book.fileName;
    
    if (fileName) {
      if (process.env.B2_CDN_BASE_URL && hasB2Credentials) {
        const cdnUrl = await getB2CdnUrl(fileName);
        if (cdnUrl) {
          return res.json({ viewUrl: cdnUrl, isSplit: false });
        }
      }

      const protocol = getProtocol(req);
      const proxyUrl = `${protocol}://${req.get('host')}/api/books/${req.params.id}/pdf`;
      return res.json({ viewUrl: proxyUrl, isSplit: false });
    }

    return res.status(400).json({ error: 'Book file not found in Backblaze B2' });
  } catch (error) {
    console.error('Error getting view URL:', error);
    res.status(500).json({ error: 'Failed to get view URL' });
  }
});

// Handle CORS preflight for PDF endpoint
app.options('/api/books/:id/pdf', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// Serve PDF via signed URL from Backblaze B2
app.get('/api/books/:id/pdf', async (req, res) => {
  const startTime = Date.now();
  console.log('📄 PDF request received for book ID:', req.params.id);
  
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      console.error('Book not found:', req.params.id);
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // Get the file name from book data
    const fileName = book.b2FileName || book.fileName;
    
    if (!fileName) {
      console.error('No filename for book:', req.params.id);
      return res.status(400).json({ error: 'Book file not found' });
    }
    
    if (!hasB2Credentials) {
      console.error('B2 credentials not configured');
      return res.status(500).json({ error: 'Backblaze B2 is not configured' });
    }
    
    console.log('Generating signed URL for PDF:', fileName);
    
    try {
      // Ensure B2 is authorized
      await ensureB2Authorized();
      
      // Generate a signed URL that's valid for 1 hour
      // Use empty prefix to allow access to any file (simplifies auth logic, safe since we proxy)
      const authResponse = await b2.getDownloadAuthorization({
        bucketId: process.env.B2_BUCKET_ID,
        fileNamePrefix: '',
        validDurationInSeconds: 3600, // 1 hour
        b2ContentDisposition: `attachment; filename="${book.title || 'book'}.pdf"`
      });
      
      const token = authResponse?.data?.authorizationToken;
      const baseUrl = getB2DownloadBaseUrl();
      
      if (!token || !baseUrl) {
        throw new Error('Failed to generate signed URL');
      }
      
      if (!process.env.B2_BUCKET_NAME) {
         throw new Error('B2_BUCKET_NAME is not defined in environment variables');
      }

      const encodedPath = encodeB2Path(fileName);
      const bucketName = process.env.B2_BUCKET_NAME;
      const signedUrl = `${baseUrl}/file/${bucketName}/${encodedPath}?Authorization=${encodeURIComponent(token)}`;
      
      console.log(`✅ Generated signed URL for ${fileName}`);
      
      // Stream the file content through the server to avoid CORS
      console.log('🔄 Proxying file stream from B2...');
      
      const b2Response = await axios({
        method: 'GET',
        url: signedUrl,
        responseType: 'stream',
        validateStatus: function (status) {
          return status >= 200 && status < 300; // Only accept successful responses
        }
      });

      // Set headers
      res.setHeader('Content-Type', 'application/pdf');
      if (b2Response.headers['content-length']) {
        res.setHeader('Content-Length', b2Response.headers['content-length']);
      }
      if (b2Response.headers['last-modified']) {
        res.setHeader('Last-Modified', b2Response.headers['last-modified']);
      }
      if (b2Response.headers['etag']) {
        res.setHeader('ETag', b2Response.headers['etag']);
      }
      
      // Pipe the stream
      b2Response.data.pipe(res);
      
      b2Response.data.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
      });

    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.error('❌ B2 Auth Error (401): Token expired or invalid. Re-authorizing...');
        // Force re-authorization for next time
        b2Authorized = false;
      } else {
        console.error('❌ Error generating signed URL:', error.message);
      }

      // Fallback: stream using b2_download_file_by_id (supports Range)
      try {
        await ensureB2Authorized();
        const listResp = await b2.listFileNames({
          bucketId: process.env.B2_BUCKET_ID,
          startFileName: fileName,
          maxFileCount: 1
        });
        const fileInfo = listResp?.data?.files?.find(f => f.fileName === fileName);
        if (!fileInfo) {
          return res.status(404).json({ error: 'File not found in Backblaze' });
        }

        if (!b2AuthData?.downloadUrl || !b2AuthData?.authorizationToken) {
          return res.status(500).json({ error: 'Missing B2 auth data for direct download' });
        }

        const directUrl = `${b2AuthData.downloadUrl}/b2api/v2/b2_download_file_by_id?fileId=${encodeURIComponent(fileInfo.fileId)}`;
        const headers = { Authorization: b2AuthData.authorizationToken };
        if (req.headers.range) headers.Range = req.headers.range;

        const b2Resp = await axios({
          method: 'GET',
          url: directUrl,
          responseType: 'stream',
          headers,
          validateStatus: (s) => s >= 200 && s < 300
        });

        // Mirror status and relevant headers (support partial content)
        if (!res.headersSent) {
          res.status(b2Resp.status);
          if (b2Resp.headers['content-type']) res.setHeader('Content-Type', b2Resp.headers['content-type']);
          if (b2Resp.headers['content-length']) res.setHeader('Content-Length', b2Resp.headers['content-length']);
          if (b2Resp.headers['content-range']) res.setHeader('Content-Range', b2Resp.headers['content-range']);
          if (b2Resp.headers['accept-ranges']) res.setHeader('Accept-Ranges', b2Resp.headers['accept-ranges']);
          if (b2Resp.headers['last-modified']) res.setHeader('Last-Modified', b2Resp.headers['last-modified']);
          if (b2Resp.headers['etag']) res.setHeader('ETag', b2Resp.headers['etag']);
        }
        b2Resp.data.pipe(res);
      } catch (fallbackErr) {
        console.error('❌ Fallback streaming failed:', fallbackErr.message);
        if (!res.headersSent) {
          return res.status(500).json({ 
            error: 'Failed to stream PDF',
            details: process.env.NODE_ENV === 'development' ? fallbackErr.message : undefined
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error processing PDF request:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Startup validation
console.log('✅ Admin password:', ADMIN_PASSWORD ? 'Set' : 'Using default (admin123)');

if (!hasB2Credentials) {
  console.warn('⚠️  WARNING: Backblaze B2 credentials not fully configured in server/.env');
  console.warn('   Required: B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID');
  console.warn('   ⚠️  Books will NOT persist after server restart without B2!');
} else {
  console.log('✅ Backblaze B2 credentials loaded');
  // Test B2 connection on startup
  ensureB2Authorized().then(() => {
    console.log('✅ Backblaze B2 connection verified');
  }).catch(err => {
    console.error('❌ Backblaze B2 connection failed:', err.message);
    console.error('   Please check your B2 credentials!');
  });
}

// Check Cloudinary configuration
if (!hasCloudinaryCredentials) {
  console.warn('⚠️  WARNING: Cloudinary credentials not configured');
  console.warn('   Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  console.warn('   Cover images will not use CDN (slower loading)');
} else {
  console.log('✅ Cloudinary credentials loaded (for cover image CDN)');
}

// Diagnostic endpoint to check books.json status
app.get('/api/debug/books-status', async (req, res) => {
  try {
    const status = {
      local: {
        exists: false,
        count: 0,
        path: BOOKS_FILE
      },
      backblaze: {
        configured: hasB2Credentials,
        exists: false,
        count: 0,
        error: null
      },
      timestamp: new Date().toISOString()
    };

    // Check local file
    try {
      const data = await fs.readFile(BOOKS_FILE, 'utf8');
      const books = JSON.parse(data);
      status.local.exists = true;
      status.local.count = books.length;
    } catch (err) {
      status.local.error = err.message;
    }

    // Check Backblaze
    if (hasB2Credentials) {
      try {
        const booksFromB2 = await downloadBooksJsonFromB2();
        if (booksFromB2) {
          status.backblaze.exists = true;
          status.backblaze.count = booksFromB2.length;
        }
      } catch (err) {
        status.backblaze.error = err.message;
      }
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint - verify all services are configured correctly
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      backblaze: {
        configured: hasB2Credentials,
        working: false,
        error: null
      },
      cloudinary: {
        configured: hasCloudinaryCredentials,
        working: false,
        error: null
      },
      books: {
        localCount: 0,
        b2Count: null,
        b2Working: false
      }
    }
  };

  // Check Backblaze
  if (hasB2Credentials) {
    try {
      await ensureB2Authorized();
      const filesResponse = await b2.listFileNames({
        bucketId: process.env.B2_BUCKET_ID,
        startFileName: 'data/books.json',
        maxFileCount: 1
      });
      const booksJsonExists = filesResponse?.data?.files?.some(f => f.fileName === 'data/books.json');
      health.services.backblaze.working = true;
      health.services.books.b2Working = booksJsonExists;
      if (booksJsonExists) {
        const books = await downloadBooksJsonFromB2();
        health.services.books.b2Count = books ? books.length : 0;
      }
    } catch (error) {
      health.services.backblaze.working = false;
      health.services.backblaze.error = error.message;
      health.status = 'degraded';
    }
  }

  // Check Cloudinary
  if (hasCloudinaryCredentials) {
    try {
      const v2 = require('cloudinary').v2;
      await v2.api.ping();
      health.services.cloudinary.working = true;
    } catch (error) {
      health.services.cloudinary.working = false;
      health.services.cloudinary.error = error.message;
      health.status = 'degraded';
    }
  }

  // Check local books
  try {
    const books = await getBooks();
    health.services.books.localCount = books.length;
  } catch (error) {
    health.status = 'error';
  }

  // Overall status
  if (!hasB2Credentials) {
    health.status = 'warning';
    health.message = 'Backblaze not configured - books will be lost on server restart!';
  } else if (!health.services.backblaze.working) {
    health.status = 'error';
    health.message = 'Backblaze connection failed - check your credentials!';
  }

  const statusCode = health.status === 'ok' ? 200 : health.status === 'warning' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Test endpoint to check B2 connection and list files
app.get('/api/test/b2', async (req, res) => {
  try {
    if (!hasB2Credentials) {
      return res.json({ error: 'B2 credentials not configured' });
    }
    
    await ensureB2Authorized();
    const filesResponse = await b2.listFileNames({
      bucketId: process.env.B2_BUCKET_ID,
      startFileName: '',
      maxFileCount: 10
    });
    
    res.json({
      success: true,
      filesCount: filesResponse?.data?.files?.length || 0,
      files: filesResponse?.data?.files?.map(f => ({
        fileName: f.fileName,
        fileId: f.fileId,
        size: f.size
      })) || []
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Image proxy endpoint (for cover images stored in Backblaze or Cloudinary)
app.get('/api/books/:id/cover', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // 1. If it's a Cloudinary URL or generic URL, redirect
    const coverImageUrl = book.cloudinaryCoverUrl || book.coverImage;
    if (coverImageUrl && (coverImageUrl.startsWith('http://') || coverImageUrl.startsWith('https://'))) {
      // If it's a Backblaze URL, we might want to proxy it too if it's private,
      // but usually Cloudinary/external URLs are public.
      console.log('✅ Redirecting to cover image:', coverImageUrl);
      return res.redirect(coverImageUrl);
    }

    // 2. If it's a B2 file name (no protocol), stream it from B2
    if (book.b2CoverFileName || (book.coverImage && !book.coverImage.startsWith('/'))) {
      const fileName = book.b2CoverFileName || book.coverImage;
      console.log(`🔄 Proxying cover image from B2: ${fileName}`);

      await ensureB2Authorized();
      
      // Get download authorization (signed URL)
      // Use empty prefix to avoid mismatch errors
      const auth = await b2.getDownloadAuthorization({
        bucketId: process.env.B2_BUCKET_ID,
        fileNamePrefix: '',
        validDurationInSeconds: CDN_URL_TTL_SECONDS
      });
      
      const token = auth.data.authorizationToken;
      const baseUrl = getB2DownloadBaseUrl();
      const encodedPath = encodeB2Path(fileName);
      const signedUrl = `${baseUrl}/file/${process.env.B2_BUCKET_NAME}/${encodedPath}?Authorization=${encodeURIComponent(token)}`;
      
      // Stream the file content
      const b2Response = await axios({
        method: 'GET',
        url: signedUrl,
        responseType: 'stream'
      });
      
      res.setHeader('Content-Type', b2Response.headers['content-type'] || 'image/jpeg');
      if (b2Response.headers['content-length']) {
        res.setHeader('Content-Length', b2Response.headers['content-length']);
      }
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      
      b2Response.data.pipe(res);
      return;
    }
    
    // 3. Fallback for local files (if any legacy ones exist)
    if (book.coverImage && book.coverImage.startsWith('/uploads')) {
       // This should be handled by the static middleware, but just in case
       return res.redirect(book.coverImage);
    }
    
    // No cover image available
    console.error('❌ Cover image not found for book:', book.id);
    return res.status(404).json({ error: 'Cover image not found' });
  } catch (error) {
    console.error('Error serving cover image:', error);
    // If headers already sent (streaming started), we can't send JSON
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to serve cover image' });
    }
  }
});

// Debug endpoint to test PDF download for a specific book
app.get('/api/debug/pdf/:id', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      return res.json({ error: 'Book not found' });
    }
    
    const fileName = book.b2FileName || book.fileName;
    console.log('Debug: Looking for file:', fileName);
    
    await ensureB2Authorized();
    const filesResponse = await b2.listFileNames({
      bucketId: process.env.B2_BUCKET_ID,
      startFileName: '',
      maxFileCount: 100
    });
    
    const fileInfo = filesResponse?.data?.files?.find(f => 
      f.fileName === fileName || 
      f.fileName.includes(fileName) ||
      fileName.includes(f.fileName)
    );
    
    if (!fileInfo) {
      return res.json({
        error: 'File not found in B2',
        lookingFor: fileName,
        availableFiles: filesResponse?.data?.files?.map(f => f.fileName) || []
      });
    }
    
    // Try to download
    try {
      const downloadResponse = await b2.downloadFileById({
        fileId: fileInfo.fileId
      });
      
      res.json({
        success: true,
        book: {
          id: book.id,
          title: book.title,
          fileName: fileName
        },
        fileInfo: {
          fileName: fileInfo.fileName,
          fileId: fileInfo.fileId,
          size: fileInfo.size
        },
        downloadResponse: {
          type: typeof downloadResponse,
          isBuffer: Buffer.isBuffer(downloadResponse),
          hasData: !!downloadResponse?.data,
          hasBody: !!downloadResponse?.body,
          dataLength: Buffer.isBuffer(downloadResponse) ? downloadResponse.length : 
                      (downloadResponse?.data && Buffer.isBuffer(downloadResponse.data) ? downloadResponse.data.length : 'N/A')
        }
      });
    } catch (downloadError) {
      res.json({
        error: 'Download failed',
        message: downloadError.message,
        name: downloadError.name,
        code: downloadError.code,
        status: downloadError.status,
        stack: downloadError.stack
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Blog endpoints
// Get all blogs
app.get('/api/blogs', async (req, res) => {
  try {
    const blogs = await getBlogs();
    // Sort by date (newest first)
    blogs.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0);
      const dateB = new Date(b.date || b.createdAt || 0);
      return dateB - dateA;
    });
    res.json(blogs);
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// Get single blog
app.get('/api/blogs/:id', async (req, res) => {
  try {
    const blogs = await getBlogs();
    const blog = blogs.find((b) => b.id === req.params.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    res.json(blog);
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

// Create blog
app.post(
  '/api/admin/blogs',
  verifyAdminPassword,
  upload.single('image'),
  async (req, res) => {
    try {
      const { title, excerpt, description, category, date } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const blogs = await getBlogs();
      const blogId = `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Upload blog image to Cloudinary only (no local storage)
      let imageUrl = '';
      if (req.file) {
        const imageFile = req.file;
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        try {
          const result = await uploadBufferToCloudinary(imageFile.buffer, {
            resource_type: 'image',
            folder: (process.env.CLOUDINARY_FOLDER || 'bookstore') + '/blogs',
            public_id: sanitizedImageName.replace(/\.[^.]+$/, '')
          });
          if (result && result.secure_url) {
            imageUrl = result.secure_url;
            console.log('✅ Uploaded blog image to Cloudinary:', imageUrl);
          } else {
            throw new Error('Cloudinary upload returned no URL');
          }
        } catch (cloudErr) {
          console.error('❌ Cloudinary upload failed for blog image:', cloudErr.message || cloudErr);
          throw new Error(`Failed to upload blog image to Cloudinary: ${cloudErr.message}`);
        }
      }

      const blogData = {
        id: blogId,
        title: title.trim(),
        excerpt: excerpt?.trim() || description?.trim() || '',
        description: description?.trim() || '',
        category: category?.trim() || 'GENERAL',
        image: imageUrl,
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };

      blogs.push(blogData);
      await saveBlogs(blogs);
      res.status(201).json(blogData);
    } catch (error) {
      console.error('Error creating blog:', error);
      res.status(500).json({ error: error.message || 'Failed to create blog' });
    }
  }
);

// Update blog
app.put(
  '/api/admin/blogs/:id',
  verifyAdminPassword,
  upload.single('image'),
  async (req, res) => {
    try {
      const { title, excerpt, description, category, date } = req.body;
      const blogs = await getBlogs();
      const index = blogs.findIndex((b) => b.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Blog not found' });
      }

      const blog = blogs[index];

      // Update image if provided - upload to Cloudinary only
      if (req.file) {
        const imageFile = req.file;
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        try {
          const result = await uploadBufferToCloudinary(imageFile.buffer, {
            resource_type: 'image',
            folder: (process.env.CLOUDINARY_FOLDER || 'bookstore') + '/blogs',
            public_id: sanitizedImageName.replace(/\.[^.]+$/, '')
          });
          if (result && result.secure_url) {
            blog.image = result.secure_url;
            console.log('✅ Uploaded updated blog image to Cloudinary:', blog.image);
          } else {
            throw new Error('Cloudinary upload returned no URL');
          }
        } catch (cloudErr) {
          console.error('❌ Failed to upload updated blog image to Cloudinary:', cloudErr.message || cloudErr);
          throw new Error(`Failed to upload blog image to Cloudinary: ${cloudErr.message}`);
        }
      }

      // Update other fields
      if (title) blog.title = title.trim();
      if (excerpt !== undefined) blog.excerpt = excerpt.trim();
      if (description !== undefined) blog.description = description.trim();
      if (category) blog.category = category.trim();
      if (date) blog.date = date;

      await saveBlogs(blogs);
      res.json(blog);
    } catch (error) {
      console.error('Error updating blog:', error);
      res.status(500).json({ error: error.message || 'Failed to update blog' });
    }
  }
);

// Delete blog
app.delete('/api/admin/blogs/:id', verifyAdminPassword, async (req, res) => {
  try {
    const blogs = await getBlogs();
    const index = blogs.findIndex((b) => b.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    const [deleted] = blogs.splice(index, 1);
    await saveBlogs(blogs);
    res.json({ success: true, deletedId: deleted.id });
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ error: error.message || 'Failed to delete blog' });
  }
});

// Blog image proxy endpoint (for images stored in Backblaze)
app.get('/api/blogs/:id/image', async (req, res) => {
  try {
    const blogs = await getBlogs();
    const blog = blogs.find(b => b.id === req.params.id);
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    
    // Blog images are stored in Cloudinary - redirect to Cloudinary URL
    if (blog.image && (blog.image.startsWith('http://') || blog.image.startsWith('https://'))) {
      // Redirect to Cloudinary URL
      console.log('✅ Redirecting to Cloudinary blog image:', blog.image);
      return res.redirect(blog.image);
    }
    
    // No image available
    console.error('❌ Blog image not found for blog:', blog.id, 'image:', blog.image);
    return res.status(404).json({ error: 'Blog image not found' });
  } catch (error) {
    console.error('Error serving blog image:', error);
    res.status(500).json({ error: 'Failed to serve blog image' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 Admin upload endpoint: POST http://localhost:${PORT}/api/admin/books`);
  console.log(`📝 Blog endpoint: POST http://localhost:${PORT}/api/admin/blogs`);
  console.log(`🧪 Test B2 endpoint: GET http://localhost:${PORT}/api/test/b2`);
  console.log(`🐛 Debug PDF endpoint: GET http://localhost:${PORT}/api/debug/pdf/:id`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error('   Please stop the other server or change PORT in server/.env');
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

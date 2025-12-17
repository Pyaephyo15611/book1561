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

// Serve uploaded files (covers, PDFs) statically so the reader can access them directly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

function getB2DownloadBaseUrl() {
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
    fileNamePrefix: fileName,
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
    return false;
  }
  
  try {
    await ensureB2Authorized();
    const jsonString = JSON.stringify(booksData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf8');
    const fileName = 'data/books.json';
    
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
    
    console.log(`✅ Uploaded books.json to Backblaze: ${fileName}`);
    return true;
  } catch (error) {
    console.warn('⚠️  Failed to upload books.json to Backblaze:', error.message);
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
  // Try to load from local books.json first
  let books = [];
  try {
    const data = await fs.readFile(BOOKS_FILE, 'utf8');
    books = JSON.parse(data);
    if (books.length > 0) {
      console.log(`📚 Loaded ${books.length} books from local books.json`);
      return books;
    }
  } catch (error) {
    // File doesn't exist or is empty, try Backblaze
    console.log('📚 Local books.json not found or empty, trying Backblaze...');
  }
  
  // If local file is empty or doesn't exist, try downloading from Backblaze
  const booksFromB2 = await downloadBooksJsonFromB2();
  if (booksFromB2 && booksFromB2.length > 0) {
    // Save to local file for faster access
    try {
      await fs.writeFile(BOOKS_FILE, JSON.stringify(booksFromB2, null, 2));
      console.log(`✅ Synced ${booksFromB2.length} books from Backblaze to local file`);
    } catch (err) {
      console.warn('Could not save to local file:', err.message);
    }
    return booksFromB2;
  }
  
  console.log('📚 No books found in local file or Backblaze, starting fresh');
  return [];
}

async function saveBooks(books) {
  // Save to local books.json first
  try {
    await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
    console.log(`✅ Saved ${books.length} books to local books.json`);
  } catch (error) {
    console.error('Error saving books.json:', error);
    throw error;
  }
  
  // Also upload to Backblaze B2 for persistence (async, don't wait)
  uploadBooksJsonToB2(books).catch(err => {
    console.warn('Background upload to Backblaze failed:', err.message);
  });
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

// Get all books
app.get('/api/books', async (req, res) => {
  try {
    const books = await getBooks();
    // Transform cover image URLs to use proxy endpoints for B2 images
    const protocol = getProtocol(req);
    const booksWithUrls = books.map(book => {
      const bookResponse = { ...book };
      // Prefer Cloudinary cover URL if available
      if (book.cloudinaryCoverUrl) {
        bookResponse.coverImage = book.cloudinaryCoverUrl;
        return bookResponse;
      }

      if (book.b2CoverFileName || (book.coverImage && !book.coverImage.startsWith('/') && !book.coverImage.startsWith('http'))) {
        // It's a B2 filename, use proxy endpoint
        bookResponse.coverImage = `${protocol}://${req.get('host')}/api/books/${book.id}/cover`;
      } else if (book.coverImage && book.coverImage.startsWith('/uploads')) {
        // Local file, use direct URL
        bookResponse.coverImage = `${protocol}://${req.get('host')}${book.coverImage}`;
      }
      // If coverImage is already a full URL (http/https), keep it as is
      return bookResponse;
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
const imageUploadPath = path.join(__dirname, 'uploads/images');

// Ensure the upload directory exists
fs.mkdir(imageUploadPath, { recursive: true }).catch(console.error);

app.post(
  '/api/admin/books',
  verifyAdminPassword,
  upload.fields([{ name: 'pdf' }, { name: 'coverImage' }, { name: 'pdfPart1' }, { name: 'pdfPart2' }, { name: 'pdfPart3' }, { name: 'pdfPart4' }, { name: 'pdfPart5' }, { name: 'pdfPart6' }, { name: 'pdfPart7' }, { name: 'pdfPart8' }, { name: 'pdfPart9' }, { name: 'pdfPart10' }]),
  async (req, res) => {
    try {
      const { title, author, description, category, readingTime, rating, isTrending, hasParts, partsCount } = req.body;

      if (!title || !author) {
        return res.status(400).json({ error: 'Title and author are required' });
      }

      const books = await getBooks();
      const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      let pdfParts = [];
      let pdfFilePath = null;
      let b2PdfFileName = null;

      // Handle PDF parts (for comics)
      if (hasParts === 'true' && partsCount) {
        const partsCountNum = parseInt(partsCount);
        pdfParts = [];
        
        for (let i = 1; i <= partsCountNum; i++) {
          const partFile = req.files[`pdfPart${i}`]?.[0];
          if (partFile) {
            const sanitizedPartName = `${Date.now()}-part${i}-${partFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const partFilePath = path.join(imageUploadPath, sanitizedPartName);
            await fs.writeFile(partFilePath, partFile.buffer);
            
            let b2PartFileName = null;
            if (hasB2Credentials) {
              try {
                const b2Name = `pdfs/${sanitizedPartName}`;
                b2PartFileName = await uploadPdfToB2(partFile.buffer, b2Name, partFile.mimetype || 'application/pdf');
                console.log(`✅ Uploaded Part ${i} to Backblaze: ${b2PartFileName}`);
              } catch (b2Error) {
                console.warn(`⚠️  Failed to upload Part ${i} to Backblaze:`, b2Error.message);
              }
            }

            pdfParts.push({
              partNumber: i,
              pdfFilePath: `/uploads/images/${sanitizedPartName}`,
              b2FileName: b2PartFileName,
              fileName: b2PartFileName || sanitizedPartName
            });
          }
        }
      } else if (req.files['pdf'] && req.files['pdf'][0]) {
        // Handle single PDF file
        const pdfFile = req.files['pdf'][0];
        const sanitizedPdfName = `${Date.now()}-${pdfFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        pdfFilePath = path.join(imageUploadPath, sanitizedPdfName);
        await fs.writeFile(pdfFilePath, pdfFile.buffer);
        pdfFilePath = `/uploads/images/${sanitizedPdfName}`;

        // Also upload PDF to Backblaze (if configured)
        if (hasB2Credentials) {
          try {
            const b2Name = `pdfs/${sanitizedPdfName}`;
            b2PdfFileName = await uploadPdfToB2(pdfFile.buffer, b2Name, pdfFile.mimetype || 'application/pdf');
            console.log('✅ Uploaded PDF to Backblaze:', b2PdfFileName);
          } catch (b2Error) {
            console.warn('⚠️  Failed to upload PDF to Backblaze, using local file only:', b2Error.message || b2Error);
          }
        }

      } else {
        return res.status(400).json({ error: 'Please upload either a PDF file or PDF parts' });
      }

      // Save Cover Image locally and to Backblaze
      let coverImageUrl = '';
      let b2CoverFileName = null;
      let cloudinaryCoverUrl = null;
      if (req.files['coverImage']) {
        const imageFile = req.files['coverImage'][0];
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const imageFilePath = path.join(imageUploadPath, sanitizedImageName);
        await fs.writeFile(imageFilePath, imageFile.buffer);
        // Local URL (fallback)
        coverImageUrl = `/uploads/images/${sanitizedImageName}`;

        // Try Backblaze upload for cover image
        if (hasB2Credentials) {
          try {
            const b2Name = `covers/${sanitizedImageName}`;
            b2CoverFileName = await uploadPdfToB2(
              imageFile.buffer,
              b2Name,
              imageFile.mimetype || 'image/jpeg'
            );
            console.log('✅ Uploaded cover image to Backblaze:', b2CoverFileName);
            // Store the B2 filename in the book data, URL will be generated on request
          } catch (b2Error) {
            console.warn('⚠️  Failed to upload cover image to Backblaze, using local image only:', b2Error.message || b2Error);
          }
        }

        // Upload cover image to Cloudinary for fast CDN delivery
        try {
          const result = await uploadBufferToCloudinary(imageFile.buffer, {
            resource_type: 'image',
            folder: (process.env.CLOUDINARY_FOLDER || 'bookstore') + '/covers',
            public_id: sanitizedImageName.replace(/\.[^.]+$/, '')
          });
          if (result && result.secure_url) {
            cloudinaryCoverUrl = result.secure_url;
            coverImageUrl = cloudinaryCoverUrl; // Prefer Cloudinary URL for clients
            console.log('✅ Uploaded cover image to Cloudinary:', cloudinaryCoverUrl);
          }
        } catch (cloudErr) {
          console.warn('⚠️  Cloudinary upload failed for cover image:', cloudErr.message || cloudErr);
        }
      }

      const bookData = {
        id: bookId,
        title: title.trim(),
        author: author.trim(),
        description: description?.trim() || '',
        category: category?.trim() || 'General',
        coverImage: coverImageUrl,
        readingTime: readingTime?.trim() || 'Flexible',
        rating: rating ? Number(rating) : null,
        isTrending: isTrending === 'true',
        // PDF parts (if using parts) or single file
        pdfParts: pdfParts.length > 0 ? pdfParts : null,
        // Single file (if not using parts)
        pdfFilePath: pdfParts.length > 0 ? null : pdfFilePath,
        b2FileName: pdfParts.length > 0 ? null : (b2PdfFileName || null),
        fileName: pdfParts.length > 0 ? null : (b2PdfFileName || (pdfFilePath ? pdfFilePath.split('/').pop() : null)),
        b2CoverFileName: b2CoverFileName || null,
        coverImageUrl: coverImageUrl,
        cloudinaryCoverUrl: cloudinaryCoverUrl || null,
        createdAt: new Date().toISOString()
      };

      books.push(bookData);
      await saveBooks(books);
      res.status(201).json(bookData);
    } catch (error) {
      console.error('Error uploading book:', error);
      res.status(500).json({ error: error.message || 'Failed to upload book' });
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

      // Update PDF if provided
      if (req.files['pdf'] && req.files['pdf'][0]) {
        const pdfFile = req.files['pdf'][0];
        const sanitizedPdfName = `${Date.now()}-${pdfFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const pdfFilePath = path.join(imageUploadPath, sanitizedPdfName);
        await fs.writeFile(pdfFilePath, pdfFile.buffer);

        let b2PdfFileName = book.b2FileName || null;
        let cloudinaryPdfUrl = book.cloudinaryPdfUrl || null;

        if (hasB2Credentials) {
          try {
            const b2Name = `pdfs/${sanitizedPdfName}`;
            b2PdfFileName = await uploadPdfToB2(pdfFile.buffer, b2Name, pdfFile.mimetype || 'application/pdf');
          } catch (b2Error) {
            console.warn('Failed to upload updated PDF to Backblaze, using local file only:', b2Error.message || b2Error);
          }
        }

        // Update Cloudinary PDF as well
        try {
          const result = await uploadBufferToCloudinary(pdfFile.buffer, {
            resource_type: 'raw',
            folder: (process.env.CLOUDINARY_FOLDER || 'bookstore') + '/pdfs',
            public_id: sanitizedPdfName.replace(/\.[^.]+$/, '')
          });
          if (result && result.secure_url) {
            cloudinaryPdfUrl = result.secure_url;
            console.log('✅ Uploaded updated PDF to Cloudinary:', cloudinaryPdfUrl);
          }
        } catch (cloudErr) {
          console.warn('⚠️  Failed to upload updated PDF to Cloudinary:', cloudErr.message || cloudErr);
        }

        book.b2FileName = b2PdfFileName || book.b2FileName || null;
        book.fileName = b2PdfFileName || sanitizedPdfName;
        book.pdfFilePath = `/uploads/images/${sanitizedPdfName}`;
        book.cloudinaryPdfUrl = cloudinaryPdfUrl || book.cloudinaryPdfUrl || null;
      }

      // Update cover if provided
      if (req.files['coverImage'] && req.files['coverImage'][0]) {
        const imageFile = req.files['coverImage'][0];
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const imageFilePath = path.join(imageUploadPath, sanitizedImageName);
        await fs.writeFile(imageFilePath, imageFile.buffer);
        let coverImageUrl = `/uploads/images/${sanitizedImageName}`;
        let b2CoverFileName = book.b2CoverFileName || null;
        let cloudinaryCoverUrl = book.cloudinaryCoverUrl || null;

        if (hasB2Credentials) {
          try {
            const b2Name = `covers/${sanitizedImageName}`;
            b2CoverFileName = await uploadPdfToB2(
              imageFile.buffer,
              b2Name,
              imageFile.mimetype || 'image/jpeg'
            );
          } catch (b2Error) {
            console.warn('Failed to upload updated cover to Backblaze, using local image only:', b2Error.message || b2Error);
          }
        }

        // Upload new cover to Cloudinary
        try {
          const result = await uploadBufferToCloudinary(imageFile.buffer, {
            resource_type: 'image',
            folder: (process.env.CLOUDINARY_FOLDER || 'bookstore') + '/covers',
            public_id: sanitizedImageName.replace(/\.[^.]+$/, '')
          });
          if (result && result.secure_url) {
            cloudinaryCoverUrl = result.secure_url;
            coverImageUrl = cloudinaryCoverUrl;
            console.log('✅ Uploaded updated cover image to Cloudinary:', cloudinaryCoverUrl);
          }
        } catch (cloudErr) {
          console.warn('⚠️  Failed to upload updated cover to Cloudinary:', cloudErr.message || cloudErr);
        }

        book.coverImage = coverImageUrl;
        book.b2CoverFileName = b2CoverFileName;
        book.coverImageUrl = coverImageUrl;
        book.cloudinaryCoverUrl = cloudinaryCoverUrl || book.cloudinaryCoverUrl || null;
      }

      // Update simple fields
      if (title !== undefined) book.title = title.trim();
      if (author !== undefined) book.author = author.trim();
      if (description !== undefined) book.description = description.trim();
      if (category !== undefined) book.category = category.trim() || 'General';
      if (readingTime !== undefined) book.readingTime = readingTime.trim();
      if (rating !== undefined) book.rating = rating ? Number(rating) : null;
      if (isTrending !== undefined) book.isTrending = isTrending === 'true' || isTrending === true;

      books[index] = book;
      await saveBooks(books);
      res.json(book);
    } catch (error) {
      console.error('Error updating book:', error);
      res.status(500).json({ error: error.message || 'Failed to update book' });
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
    const [deleted] = books.splice(index, 1);
    await saveBooks(books);
    res.json({ success: true, deletedId: deleted.id });
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
          
          // Try local file first
          if (part.pdfFilePath) {
            const absolutePath = path.join(__dirname, part.pdfFilePath.replace(/^\/+/, ''));
            try {
              partData = await fs.readFile(absolutePath);
              console.log(`✅ Loaded part ${part.partNumber} from local file`);
            } catch (err) {
              console.log(`Local part ${part.partNumber} not found, trying B2`);
            }
          }
          
          // Try Backblaze if local file not found
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
    
    // Fast path: if we have a locally stored PDF, serve it directly
    if (book.pdfFilePath) {
      const absolutePath = path.join(__dirname, book.pdfFilePath.replace(/^\/+/, ''));
      console.log('Serving local PDF file for download:', absolutePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      return res.sendFile(absolutePath, (err) => {
        if (err) {
          console.error('Error sending local PDF file:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download local PDF' });
          }
        }
      });
    }
    
    // Handle Backblaze B2 files
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
      console.log('B2 authorized successfully');
      
      // Try to use cached fileId first
      let fileInfo = null;
      let fileId = book.b2FileId || null;

      if (!fileId) {
        console.log('No cached fileId, listing bucket to find file:', fileName);
        const allFilesResponse = await b2.listFileNames({
          bucketId: process.env.B2_BUCKET_ID,
          startFileName: '',
          maxFileCount: 10000
        });

        if (!allFilesResponse || !allFilesResponse.data) {
          throw new Error('Failed to list files from Backblaze');
        }

        const allFiles = allFilesResponse.data.files || [];
        console.log(`Found ${allFiles.length} total files in bucket`);

        // Try exact match first
        fileInfo = allFiles.find(f => f.fileName === fileName);

        // If not found, try case-insensitive match
        if (!fileInfo) {
          fileInfo = allFiles.find(f => f.fileName.toLowerCase() === fileName.toLowerCase());
        }

        // If still not found, try partial matches
        if (!fileInfo) {
          fileInfo = allFiles.find(f =>
            f.fileName.includes(fileName) ||
            fileName.includes(f.fileName) ||
            f.fileName.endsWith(fileName) ||
            fileName.endsWith(f.fileName)
          );
        }

        if (fileInfo) {
          fileId = fileInfo.fileId;
          console.log('✅ Found file in B2!');
          console.log('   FileId:', fileId);
          console.log('   FileName in B2:', fileInfo.fileName);
        } else {
          throw new Error(`File "${fileName}" not found in Backblaze bucket`);
        }
      } else {
        console.log('Using cached B2 fileId for fast fetch:', fileId);
        fileInfo = { fileName };
      }
      
      // Download file from B2
      console.log('Downloading file using fileId:', fileId);
      
      const downloadResponse = await b2.downloadFileById({
        fileId: fileId,
        responseType: 'arraybuffer'
      });
      
      console.log('✅ downloadFileById completed');
      
      // Extract file data from response
      let fileData = null;
      
      if (downloadResponse?.data !== undefined) {
        const responseData = downloadResponse.data;
        
        if (Buffer.isBuffer(responseData)) {
          fileData = responseData;
        } else if (responseData instanceof ArrayBuffer) {
          fileData = Buffer.from(responseData);
        } else if (typeof responseData === 'string') {
          if (responseData.trim().startsWith('{') || responseData.trim().startsWith('[')) {
            throw new Error('Received JSON response instead of PDF data');
          }
          fileData = Buffer.from(responseData, 'binary');
        } else {
          fileData = Buffer.from(responseData);
        }
      } else if (Buffer.isBuffer(downloadResponse)) {
        fileData = downloadResponse;
      } else if (downloadResponse instanceof ArrayBuffer) {
        fileData = Buffer.from(downloadResponse);
      } else {
        fileData = Buffer.from(downloadResponse);
      }
      
      if (!fileData || !Buffer.isBuffer(fileData)) {
        throw new Error('No valid file data received from B2');
      }
      
      // Validate PDF: Check for PDF magic bytes
      const pdfMagicBytes = fileData.slice(0, 4).toString('ascii');
      if (pdfMagicBytes !== '%PDF') {
        console.error('❌ Invalid PDF: Magic bytes are:', pdfMagicBytes);
        throw new Error('Downloaded file is not a valid PDF');
      }
      
      // Send the file with download headers
      console.log('✅ Sending PDF for download, size:', fileData.length, 'bytes');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      res.send(fileData);
      console.log('✅ PDF download sent successfully');
      
    } catch (downloadError) {
      console.error('❌ Error downloading PDF:', downloadError.message);
      throw new Error(`Failed to download PDF: ${downloadError.message || 'Unknown error'}`);
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
    
    // Try local file first
    if (part.pdfFilePath) {
      const absolutePath = path.join(__dirname, part.pdfFilePath.replace(/^\/+/, ''));
      try {
        await fs.access(absolutePath);
        return res.sendFile(absolutePath);
      } catch (err) {
        console.log('Local part file not found, trying Backblaze');
      }
    }
    
    // Try Backblaze
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
      const protocol = getProtocol(req);
      const proxyUrl = `${protocol}://${req.get('host')}/api/books/${req.params.id}/pdf/part/1`;
      return res.json({ 
        viewUrl: proxyUrl,
        isSplit: true,
        totalParts: book.pdfParts.length,
        parts: book.pdfParts.map(p => ({
          partNumber: p.partNumber,
          pdfFilePath: p.pdfFilePath,
          b2FileName: p.b2FileName
        }))
      });
    }
    
    const fileName = book.b2FileName || book.fileName;
    
    // If the book is stored in Backblaze, use our proxy PDF endpoint
    // so we can add CORS headers and avoid browser CORS errors.
    if (fileName) {
      const protocol = getProtocol(req);
      const proxyUrl = `${protocol}://${req.get('host')}/api/books/${req.params.id}/pdf`;
      return res.json({ viewUrl: proxyUrl, isSplit: false });
    }

    // Fallback: locally stored PDF on disk (pdfFilePath)
    if (book.pdfFilePath) {
      const protocol = getProtocol(req);
      const directUrl = `${protocol}://${req.get('host')}${book.pdfFilePath}`;
      return res.json({ viewUrl: directUrl, isSplit: false });
    }

    return res.status(400).json({ error: 'Book file not found' });
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

// Proxy endpoint to serve PDF with CORS headers (works with private buckets)
app.get('/api/books/:id/pdf', async (req, res) => {
  const startTime = Date.now();
  console.log('📄 PDF request received for book ID:', req.params.id);
  
  // Set CORS headers (always needed)
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
    
    // Fast path: if we have a locally stored PDF, serve it directly
    if (book.pdfFilePath) {
      const absolutePath = path.join(__dirname, book.pdfFilePath.replace(/^\/+/, ''));
      console.log('Serving local PDF file:', absolutePath);
      return res.sendFile(absolutePath, (err) => {
        if (err) {
          console.error('Error sending local PDF file:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to send local PDF file' });
          }
        }
      });
    }
    
    const fileName = book.b2FileName || book.fileName;
    
    if (!fileName) {
      console.error('No filename for book:', req.params.id);
      return res.status(400).json({ error: 'Book file not found' });
    }
    
    if (!hasB2Credentials) {
      console.error('B2 credentials not configured');
      return res.status(500).json({ error: 'Backblaze B2 is not configured' });
    }
    
    console.log('Fetching PDF from Backblaze (private bucket):', fileName);
    
    try {
      // Ensure B2 is authorized
      await ensureB2Authorized();
      console.log('B2 authorized successfully');
      
      // Try to use cached fileId first to avoid listing the whole bucket every time
      let fileInfo = null;
      let fileId = book.b2FileId || null;

      if (!fileId) {
        console.log('No cached fileId, listing bucket to find file:', fileName);
        // List files once to find the file and cache its fileId
        const allFilesResponse = await b2.listFileNames({
          bucketId: process.env.B2_BUCKET_ID,
          startFileName: '',
          maxFileCount: 10000
        });

        if (!allFilesResponse || !allFilesResponse.data) {
          throw new Error('Failed to list files from Backblaze');
        }

        const allFiles = allFilesResponse.data.files || [];
        console.log(`Found ${allFiles.length} total files in bucket`);
        console.log(`Looking for file: "${fileName}"`);

        // First try exact match
        fileInfo = allFiles.find(f => f.fileName === fileName);

        // If not found, try case-insensitive match
        if (!fileInfo) {
          fileInfo = allFiles.find(f => f.fileName.toLowerCase() === fileName.toLowerCase());
        }

        // If still not found, try matching by the base filename (without timestamp prefix)
        if (!fileInfo) {
          const baseFileName = fileName.split('-').slice(1).join('-');
          console.log(`Trying to match base filename: "${baseFileName}"`);
          fileInfo = allFiles.find(f => {
            const fBaseName = f.fileName.split('-').slice(1).join('-');
            return fBaseName === baseFileName || f.fileName.endsWith(baseFileName);
          });
        }

        // If still not found, try partial matches (contains)
        if (!fileInfo) {
          fileInfo = allFiles.find(f =>
            f.fileName.includes(fileName) ||
            fileName.includes(f.fileName) ||
            f.fileName.endsWith(fileName) ||
            fileName.endsWith(f.fileName)
          );
        }

        if (fileInfo) {
          fileId = fileInfo.fileId;
          console.log('✅ Found file in B2!');
          console.log('   FileId:', fileId);
          console.log('   FileName in B2:', fileInfo.fileName);
          console.log('   FileName in DB:', fileName);
          console.log('   Size:', fileInfo.size, 'bytes');

          // Cache the correct filename and fileId on the book record for faster future requests
          const bookIndex = books.findIndex(b => b.id === req.params.id);
          if (bookIndex !== -1) {
            const updated = { ...books[bookIndex] };
            updated.b2FileId = fileId;
            if (fileInfo.fileName !== fileName) {
              console.log('⚠️  Filename mismatch detected! Updating book record...');
              updated.b2FileName = fileInfo.fileName;
              updated.fileName = fileInfo.fileName;
            }
            books[bookIndex] = updated;
            await saveBooks(books);
            console.log('✅ Cached fileId for faster future PDF requests');
          }
        } else {
          console.error('❌ File not found. Looking for:', fileName);
          console.error('All files in bucket:');
          allFiles.forEach(f => {
            console.error(`   - ${f.fileName} (ID: ${f.fileId})`);
          });
          throw new Error(`File "${fileName}" not found in Backblaze bucket. Found ${allFiles.length} files total.`);
        }
      } else {
        console.log('Using cached B2 fileId for fast fetch:', fileId);
        fileInfo = { fileName };
      }
      
      // Download file directly using fileId (works with private buckets)
      console.log('Downloading file using fileId:', fileId);
      console.log('Actual filename in B2:', fileInfo.fileName);
      
      try {
        // For private buckets, downloadFileById is the recommended method
        // The B2 SDK handles authentication automatically when authorized
        let fileData = null;
        let contentType = 'application/pdf';
        
        console.log('🔽 Calling downloadFileById for private bucket...');
        console.log('   FileId:', fileId);
        console.log('   FileName:', fileInfo.fileName);
        
        // downloadFileById works with private buckets when properly authorized
        // Specify arraybuffer to ensure we get binary data
        const downloadResponse = await b2.downloadFileById({
          fileId: fileId,
          responseType: 'arraybuffer'
        });
        
        console.log('✅ downloadFileById completed');
        console.log('   Response type:', typeof downloadResponse);
        console.log('   Is Buffer?', Buffer.isBuffer(downloadResponse));
        console.log('   Has data property?', !!downloadResponse?.data);
        console.log('   Has body property?', !!downloadResponse?.body);
        console.log('   Response keys:', downloadResponse ? Object.keys(downloadResponse) : 'null');
        
        // The B2 SDK uses axios internally, so the response might be an axios response object
        // with structure: { data: Buffer/ArrayBuffer, headers: {...}, status: ... }
        // OR it might return the data directly as a Buffer
        
        // First, try to get data from axios response structure
        if (downloadResponse?.data !== undefined) {
          // Axios response object
          const responseData = downloadResponse.data;
          
          if (Buffer.isBuffer(responseData)) {
            fileData = responseData;
            console.log('✅ File data from response.data (Buffer), size:', fileData.length, 'bytes');
          } else if (responseData instanceof ArrayBuffer) {
            // Convert ArrayBuffer to Buffer
            fileData = Buffer.from(responseData);
            console.log('✅ File data from response.data (ArrayBuffer->Buffer), size:', fileData.length, 'bytes');
          } else if (typeof responseData === 'string') {
            // Check if it's JSON (error response)
            if (responseData.trim().startsWith('{') || responseData.trim().startsWith('[')) {
              throw new Error('Received JSON response instead of PDF data');
            }
            fileData = Buffer.from(responseData, 'binary');
            console.log('✅ File data from response.data (string->Buffer), size:', fileData.length, 'bytes');
          } else {
            // Try to convert to Buffer
            try {
              fileData = Buffer.from(responseData);
              console.log('✅ File data converted from response.data, size:', fileData.length, 'bytes');
            } catch (e) {
              throw new Error(`Cannot convert response.data to Buffer: ${e.message}`);
            }
          }
          
          // Get content type from headers if available
          if (downloadResponse.headers) {
            contentType = downloadResponse.headers['content-type'] || 
                         downloadResponse.headers['Content-Type'] || 
                         contentType;
            console.log('   Content-Type from headers:', contentType);
          }
        } else if (Buffer.isBuffer(downloadResponse)) {
          // Direct Buffer response
          fileData = downloadResponse;
          console.log('✅ File data is Buffer (direct), size:', fileData.length, 'bytes');
        } else if (downloadResponse instanceof ArrayBuffer) {
          // Direct ArrayBuffer response
          fileData = Buffer.from(downloadResponse);
          console.log('✅ File data is ArrayBuffer (direct->Buffer), size:', fileData.length, 'bytes');
        } else if (downloadResponse?.body) {
          // Response with body property
          if (Buffer.isBuffer(downloadResponse.body)) {
            fileData = downloadResponse.body;
            console.log('✅ File data from response.body (Buffer), size:', fileData.length, 'bytes');
          } else if (downloadResponse.body instanceof ArrayBuffer) {
            fileData = Buffer.from(downloadResponse.body);
            console.log('✅ File data from response.body (ArrayBuffer->Buffer), size:', fileData.length, 'bytes');
          } else {
            fileData = Buffer.from(downloadResponse.body);
            console.log('✅ File data from response.body (converted), size:', fileData.length, 'bytes');
          }
        } else {
          // Last resort: try to convert the whole response
          try {
            if (typeof downloadResponse === 'string') {
              // Check if it's JSON (error response)
              if (downloadResponse.trim().startsWith('{') || downloadResponse.trim().startsWith('[')) {
                throw new Error('Received JSON response instead of PDF data');
              }
              fileData = Buffer.from(downloadResponse, 'binary');
            } else {
              fileData = Buffer.from(downloadResponse);
            }
            console.log('⚠️  Using entire response as file data (converted), size:', fileData.length, 'bytes');
          } catch (e) {
            throw new Error(`Cannot extract file data from response: ${e.message}`);
          }
        }
        
        if (!fileData) {
          throw new Error('No file data received from B2');
        }
        
        // Ensure we have a Buffer
        if (!Buffer.isBuffer(fileData)) {
          if (typeof fileData === 'string') {
            // Check if it's JSON (error response)
            if (fileData.trim().startsWith('{') || fileData.trim().startsWith('[')) {
              throw new Error('Received JSON response instead of PDF data');
            }
            fileData = Buffer.from(fileData, 'binary');
          } else if (fileData && typeof fileData.pipe === 'function') {
            // It's a stream, we'll handle it differently
            console.log('File data is a stream, piping...');
            // Set PDF headers before piping
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
            fileData.pipe(res);
            
            fileData.on('error', (err) => {
              console.error('Stream error:', err);
              if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming PDF', details: err.message });
              }
            });
            
            res.on('close', () => {
              console.log('Stream closed');
              if (fileData.destroy) fileData.destroy();
            });
            
            return; // Exit early for stream
          } else {
            throw new Error(`Unexpected file data type: ${typeof fileData}`);
          }
        }
        
        // Validate PDF: Check for PDF magic bytes (%PDF)
        const pdfMagicBytes = fileData.slice(0, 4).toString('ascii');
        if (pdfMagicBytes !== '%PDF') {
          console.error('❌ Invalid PDF: Magic bytes are:', pdfMagicBytes);
          console.error('   First 100 bytes:', fileData.slice(0, 100).toString('ascii'));
          throw new Error('Downloaded file is not a valid PDF (missing PDF magic bytes)');
        }
        
        // Send the buffer with proper PDF headers
        console.log('✅ Sending PDF buffer, size:', fileData.length, 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        res.send(fileData);
        console.log('✅ PDF sent successfully');
        
      } catch (downloadError) {
        console.error('❌ Error downloading PDF:', downloadError.message);
        console.error('Error name:', downloadError.name);
        console.error('Error code:', downloadError.code);
        console.error('Error stack:', downloadError.stack);
        if (downloadError.response) {
          console.error('Response status:', downloadError.response.status);
          console.error('Response data:', downloadError.response.data);
        }
        if (downloadError.status) {
          console.error('Error status:', downloadError.status);
        }
        
        throw new Error(`Failed to download PDF: ${downloadError.message || 'Unknown error'}`);
      }
    } catch (fetchError) {
      console.error('❌ Error in PDF fetch process:', fetchError);
      console.error('Error name:', fetchError.name);
      console.error('Error message:', fetchError.message);
      console.error('Error stack:', fetchError.stack);
      
      // Make sure we send JSON error with correct content type
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Failed to serve PDF', 
          details: fetchError.message || 'Unknown error',
          errorName: fetchError.name,
          stack: process.env.NODE_ENV === 'development' ? fetchError.stack : undefined
        });
      } else {
        console.error('Response already sent, cannot send error response');
      }
    }
  } catch (error) {
    console.error('❌ Error serving PDF (outer catch):', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Make sure we send JSON error with correct content type
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to serve PDF', 
        details: error.message || 'Unknown error',
        errorName: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      console.error('Response already sent, cannot send error response');
    }
  }
});

// Startup validation
console.log('✅ Admin password:', ADMIN_PASSWORD ? 'Set' : 'Using default (admin123)');

if (!hasB2Credentials) {
  console.warn('⚠️  WARNING: Backblaze B2 credentials not fully configured in server/.env');
  console.warn('   Required: B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID');
} else {
  console.log('✅ Backblaze B2 credentials loaded');
}

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

// Image proxy endpoint (for cover images stored in Backblaze)
app.get('/api/books/:id/cover', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find(b => b.id === req.params.id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // ALWAYS check local files FIRST before trying B2
    if (book.coverImage) {
      const coverImage = book.coverImage.trim();
      
      // Build list of all possible local paths to check
      const possiblePaths = [];
      
      // If it starts with /uploads, try direct path
      if (coverImage.startsWith('/uploads')) {
        possiblePaths.push(path.join(__dirname, coverImage.replace(/^\/+/, '')));
      }
      
      // If it's a relative path (like "covers/filename.jpg"), try multiple locations
      if (!coverImage.startsWith('/') && !coverImage.startsWith('http')) {
        possiblePaths.push(
          path.join(__dirname, 'uploads', 'images', coverImage.replace('covers/', '')), // Remove covers/ prefix: uploads/images/filename.jpg
          path.join(__dirname, 'uploads', 'images', coverImage), // Keep as is: uploads/images/covers/filename.jpg
          path.join(__dirname, 'uploads', coverImage), // In uploads folder: uploads/covers/filename.jpg
          path.join(__dirname, coverImage) // Absolute from server root
        );
      }
      
      // Try each possible path
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          const ext = path.extname(possiblePath).toLowerCase();
          const contentTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
          };
          res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          console.log('✅ Serving local cover image from:', possiblePath);
          return res.sendFile(possiblePath);
        } catch (err) {
          // Try next path
          continue;
        }
      }
      
      console.log('⚠️ Local cover image not found, tried paths:', possiblePaths);
    }
    
    // ONLY if local file not found, try Backblaze
    const b2CoverFileName =
      book.b2CoverFileName ||
      (book.coverImage && !book.coverImage.startsWith('/') && !book.coverImage.startsWith('http')
        ? book.coverImage
        : null);

    // Try Backblaze redirect if configured
    if (b2CoverFileName && process.env.B2_BUCKET_ID) {
      const region = process.env.B2_REGION || 'us-west-004';
      const bucketId = process.env.B2_BUCKET_ID;
      const encodedName = encodeURIComponent(b2CoverFileName);
      const publicUrl = `https://f${bucketId}.s3.${region}.backblazeb2.com/${encodedName}`;
      console.log('🔄 Trying B2 redirect (local file not found):', publicUrl);
      return res.redirect(publicUrl);
    }
    
    // No cover image available - return a default placeholder or 404
    console.error('❌ Cover image not found for book:', book.id, 'coverImage:', book.coverImage);
    return res.status(404).json({ error: 'Cover image not found' });
  } catch (error) {
    console.error('Error serving cover image:', error);
    res.status(500).json({ error: 'Failed to serve cover image' });
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

      // Save image locally and to Backblaze
      let imageUrl = '';
      let b2ImageFileName = null;
      if (req.file) {
        const imageFile = req.file;
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const imageFilePath = path.join(imageUploadPath, sanitizedImageName);
        await fs.writeFile(imageFilePath, imageFile.buffer);
        imageUrl = `/uploads/images/${sanitizedImageName}`;

        // Try Backblaze upload
        if (hasB2Credentials) {
          try {
            const b2Name = `blogs/${sanitizedImageName}`;
            b2ImageFileName = await uploadPdfToB2(
              imageFile.buffer,
              b2Name,
              imageFile.mimetype || 'image/jpeg'
            );
            console.log('✅ Uploaded blog image to Backblaze:', b2ImageFileName);
            imageUrl = b2ImageFileName;
          } catch (b2Error) {
            console.warn('⚠️  Failed to upload blog image to Backblaze, using local image only:', b2Error.message || b2Error);
          }
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
        b2ImageFileName: b2ImageFileName || null,
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

      // Update image if provided
      if (req.file) {
        const imageFile = req.file;
        const sanitizedImageName = `${Date.now()}-${imageFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const imageFilePath = path.join(imageUploadPath, sanitizedImageName);
        await fs.writeFile(imageFilePath, imageFile.buffer);

        let b2ImageFileName = blog.b2ImageFileName || null;
        if (hasB2Credentials) {
          try {
            const b2Name = `blogs/${sanitizedImageName}`;
            b2ImageFileName = await uploadPdfToB2(
              imageFile.buffer,
              b2Name,
              imageFile.mimetype || 'image/jpeg'
            );
          } catch (b2Error) {
            console.warn('Failed to upload updated blog image to Backblaze, using local file only:', b2Error.message || b2Error);
          }
        }

        blog.image = b2ImageFileName || `/uploads/images/${sanitizedImageName}`;
        blog.b2ImageFileName = b2ImageFileName || null;
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
    
    // ALWAYS check local files FIRST before trying B2
    if (blog.image) {
      const blogImage = blog.image.trim();
      
      // Build list of all possible local paths to check
      const possiblePaths = [];
      
      // If it starts with /uploads, try direct path
      if (blogImage.startsWith('/uploads')) {
        possiblePaths.push(path.join(__dirname, blogImage.replace(/^\/+/, '')));
      }
      
      // If it's a relative path, try multiple locations
      if (!blogImage.startsWith('/') && !blogImage.startsWith('http')) {
        possiblePaths.push(
          path.join(__dirname, 'uploads', 'images', blogImage.replace('blogs/', '')), // Remove blogs/ prefix
          path.join(__dirname, 'uploads', 'images', blogImage), // Keep as is
          path.join(__dirname, 'uploads', blogImage), // In uploads folder
          path.join(__dirname, blogImage) // Absolute from server root
        );
      }
      
      // Try each possible path
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          const ext = path.extname(possiblePath).toLowerCase();
          const contentTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
          };
          res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          console.log('✅ Serving local blog image from:', possiblePath);
          return res.sendFile(possiblePath);
        } catch (err) {
          // Try next path
          continue;
        }
      }
      
      console.log('⚠️ Local blog image not found, tried paths:', possiblePaths);
    }
    
    // ONLY if local file not found, try Backblaze
    const b2ImageFileName =
      blog.b2ImageFileName ||
      (blog.image && !blog.image.startsWith('/') && !blog.image.startsWith('http')
        ? blog.image
        : null);

    // Try Backblaze redirect if configured
    if (b2ImageFileName && process.env.B2_BUCKET_ID) {
      const region = process.env.B2_REGION || 'us-west-004';
      const bucketId = process.env.B2_BUCKET_ID;
      const encodedName = encodeURIComponent(b2ImageFileName);
      const publicUrl = `https://f${bucketId}.s3.${region}.backblazeb2.com/${encodedName}`;
      console.log('🔄 Trying B2 redirect (local file not found):', publicUrl);
      return res.redirect(publicUrl);
    }
    
    // No image available - return a default placeholder or 404
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

const axios = require('axios');

const API_URL = 'http://localhost:5001';
const BOOK_ID = 'book_1764921889152_gc3erhyoj';

async function testB2Integration() {
  try {
    console.log('Testing B2 Integration...');

    // 1. Get Book Details
    console.log(`\n1. Fetching book details for ${BOOK_ID}...`);
    const bookResponse = await axios.get(`${API_URL}/api/books/${BOOK_ID}`);
    const book = bookResponse.data;
    
    console.log('✅ Book fetched successfully');
    console.log(`   Title: ${book.title}`);
    console.log(`   Cover Image URL: ${book.coverImage}`);
    
    if (book.coverImage.includes('/api/books/') && book.coverImage.includes('/cover')) {
      console.log('✅ Cover image is using proxy endpoint (Correct for no-CORS)');
    } else {
      console.warn('⚠️  Cover image might not be using proxy endpoint:', book.coverImage);
    }

    // 2. Get PDF View URL
    console.log(`\n2. Fetching PDF view URL...`);
    const viewResponse = await axios.get(`${API_URL}/api/books/${BOOK_ID}/view`);
    const viewUrl = viewResponse.data.viewUrl;
    
    console.log(`✅ View URL: ${viewUrl}`);
    if (viewUrl.includes('/api/books/') && viewUrl.includes('/pdf')) {
      console.log('✅ PDF view URL is using proxy endpoint (Correct for no-CORS)');
    } else {
      console.warn('⚠️  PDF view URL might not be using proxy endpoint:', viewUrl);
    }

    // 3. Test Cover Image Proxy
    console.log(`\n3. Testing Cover Image Proxy...`);
    // Note: The coverImage URL from step 1 might be relative or absolute depending on how the server constructs it
    // But we know the endpoint pattern
    const coverUrl = `${API_URL}/api/books/${BOOK_ID}/cover`;
    try {
      const coverResponse = await axios.get(coverUrl, { responseType: 'stream' });
      console.log(`✅ Cover image request successful (Status: ${coverResponse.status})`);
      console.log(`   Content-Type: ${coverResponse.headers['content-type']}`);
    } catch (err) {
      console.error('❌ Cover image request failed:', err.message);
      if (err.response) console.error('   Status:', err.response.status);
    }

    // 4. Test PDF Proxy (HEAD request to avoid downloading full file)
    console.log(`\n4. Testing PDF Proxy (HEAD)...`);
    const pdfUrl = `${API_URL}/api/books/${BOOK_ID}/pdf`;
    try {
      // Use a small range request or just HEAD if server supports it. 
      // Our server streams, so HEAD might trigger the B2 call but not pipe data?
      // Let's try GET with a small range if possible, but axios 'stream' is safer.
      const pdfResponse = await axios.get(pdfUrl, { 
        responseType: 'stream',
        headers: { 'Range': 'bytes=0-100' } // Try range request
      });
      console.log(`✅ PDF request successful (Status: ${pdfResponse.status})`);
      console.log(`   Content-Type: ${pdfResponse.headers['content-type']}`);
      // Close stream
      pdfResponse.data.destroy();
    } catch (err) {
      console.error('❌ PDF request failed:', err.message);
      if (err.response) {
        console.error('   Status:', err.response.status);
        // If 416 Range Not Satisfiable, it means file exists but range failed (which is fine for existence check)
        // If 404, file missing.
        // If 500, server error (maybe auth).
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testB2Integration();

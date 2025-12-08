import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Document, Page, pdfjs } from 'react-pdf';
import axios from 'axios';
import { ArrowLeft, Loader, BookOpen } from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './BookDetail.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Reader = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [scale, setScale] = useState(1.0);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const [jumpPage, setJumpPage] = useState('');
  const [useIframe, setUseIframe] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [pdfParts, setPdfParts] = useState([]);
  const [currentPart, setCurrentPart] = useState(1);

  const fetchBookAndPdf = useCallback(async () => {
    try {
      // Try API first – fetch book metadata and PDF view URL in parallel
      try {
        const [bookResponse, viewResponse] = await Promise.all([
          axios.get(`${API_URL}/api/books/${id}`),
          axios.get(`${API_URL}/api/books/${id}/view`)
        ]);

        setBook(bookResponse.data);
        
        // Handle PDF parts
        if (viewResponse.data.isSplit && viewResponse.data.parts) {
          setIsSplit(true);
          setPdfParts(viewResponse.data.parts);
          setCurrentPart(1);
          // Load first part
          const firstPartUrl = `${API_URL}/api/books/${id}/pdf/part/1`;
          setPdfUrl(firstPartUrl);
        } else {
          setIsSplit(false);
          setPdfParts([]);
          setPdfUrl(viewResponse.data.viewUrl);
        }
      } catch (apiError) {
        console.log('API not available or failed, falling back to Firestore for reader');

        // Fallback to Firestore
        const bookRef = doc(db, 'books', id);
        const bookSnap = await getDoc(bookRef);
        if (bookSnap.exists()) {
          const bookData = { id: bookSnap.id, ...bookSnap.data() };
          setBook(bookData);

          const fileName = bookData.b2FileName || bookData.fileName;
          if (fileName) {
            const bucketId = process.env.REACT_APP_B2_BUCKET_ID;
            const region = process.env.REACT_APP_B2_REGION || 'us-west-004';
            const viewUrl = `https://f${bucketId}.s3.${region}.backblazeb2.com/${fileName}`;
            setPdfUrl(viewUrl);
          }
        }
      }
    } catch (error) {
      console.error('Error loading reader:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBookAndPdf();
  }, [fetchBookAndPdf]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPdfLoading(false);
    setCurrentPage(1);
  };

  const onDocumentLoadError = (error) => {
    console.error('Error loading PDF:', error);
    setPdfLoading(false);
    // Fallback: if React-PDF fails, use a simple iframe viewer which is faster
    setUseIframe(true);
  };

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1.0);

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    } else if (isSplit && currentPart > 1) {
      // Go to previous part
      const newPart = currentPart - 1;
      setCurrentPart(newPart);
      setPdfUrl(`${API_URL}/api/books/${id}/pdf/part/${newPart}`);
      setCurrentPage(1);
      setPdfLoading(true);
    }
  };

  const goToNextPage = () => {
    if (numPages && currentPage < numPages) {
      setCurrentPage((prev) => prev + 1);
    } else if (isSplit && currentPart < pdfParts.length) {
      // Go to next part
      const newPart = currentPart + 1;
      setCurrentPart(newPart);
      setPdfUrl(`${API_URL}/api/books/${id}/pdf/part/${newPart}`);
      setCurrentPage(1);
      setPdfLoading(true);
    }
  };

  const goToPart = (partNumber) => {
    if (partNumber >= 1 && partNumber <= pdfParts.length) {
      setCurrentPart(partNumber);
      setPdfUrl(`${API_URL}/api/books/${id}/pdf/part/${partNumber}`);
      setCurrentPage(1);
      setPdfLoading(true);
    }
  };

  const handlePageTap = (event) => {
    if (!numPages) return;
    const rect = event.currentTarget.getBoundingClientRect();
    let clientX;
    if (event.touches && event.touches[0]) clientX = event.touches[0].clientX;
    else if (event.changedTouches && event.changedTouches[0]) clientX = event.changedTouches[0].clientX;
    else clientX = event.clientX;
    if (typeof clientX !== 'number') return;
    const ratio = (clientX - rect.left) / rect.width;
    if (ratio > 0.6 && currentPage < numPages) goToNextPage();
    else if (ratio < 0.4 && currentPage > 1) goToPrevPage();
  };

  const isMobile = viewportWidth <= 768;
  const pageWidth = isMobile
    ? Math.min(viewportWidth - 40, 420)
    : Math.min(viewportWidth - 160, 760);

  if (loading) {
    return (
      <div className="loading-container reader-loading-full">
        <div className="reader-loading-card">
          <div className="reader-spinner">
            <Loader className="spinning" size={36} />
          </div>
          <p>Loading pages…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="book-detail">
      <header className="book-nav">
        <div className="container">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>
          <div className="nav-actions">
            <span className="page-info">
              {book?.title || 'Untitled'} · {book?.author || 'Unknown Author'}
            </span>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="pdf-viewer-container">
          {pdfUrl ? (
            <>
              {useIframe ? (
                <div className="pdf-viewer">
                  <iframe
                    title={book?.title || 'Book'}
                    src={pdfUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <>
                  <div className="pdf-controls">
                    <div className="zoom-controls">
                      <button onClick={zoomOut} className="zoom-btn" title="Zoom out">
                        −
                      </button>
                      <span className="zoom-level">{Math.round(scale * 100)}%</span>
                      <button onClick={zoomIn} className="zoom-btn" title="Zoom in">
                        +
                      </button>
                      <button onClick={resetZoom} className="zoom-btn" title="Reset zoom">
                        Reset
                      </button>
                    </div>

                    {numPages && (
                      <div className="page-controls">
                        {isSplit && pdfParts.length > 0 ? (
                          <div className="part-navigation">
                            <span className="page-info">
                              Part {currentPart} of {pdfParts.length} · Page {currentPage} of {numPages}
                            </span>
                            <div className="part-selector">
                              {pdfParts.map((part) => (
                                <button
                                  key={part.partNumber}
                                  type="button"
                                  className={`part-btn ${part.partNumber === currentPart ? 'active' : ''}`}
                                  onClick={() => goToPart(part.partNumber)}
                                  title={`Part ${part.partNumber}`}
                                >
                                  {part.partNumber}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="page-info">
                            Page {currentPage} of {numPages}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pdf-viewer" onClick={handlePageTap} onTouchStart={handlePageTap}>
                    {pdfLoading && (
                      <div className="pdf-loading">
                        <Loader className="spinning" size={32} />
                        <p>Loading pages…</p>
                      </div>
                    )}

                    <Document
                      file={pdfUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={onDocumentLoadError}
                      loading={null}
                      className="pdf-document"
                    >
                      {numPages && (
                        <Page
                          key={`page_${currentPage}`}
                          pageNumber={currentPage}
                          scale={scale}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          className="pdf-page"
                          width={pageWidth}
                        />
                      )}
                    </Document>

                    {numPages && (
                      <>
                        <button
                          type="button"
                          className="reader-arrow reader-arrow-left"
                          onClick={goToPrevPage}
                          disabled={(!isSplit && currentPage <= 1) || (isSplit && currentPage <= 1 && currentPart <= 1)}
                          aria-label="Previous page"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="reader-arrow reader-arrow-right"
                          onClick={goToNextPage}
                          disabled={(!isSplit && currentPage >= numPages) || (isSplit && currentPage >= numPages && currentPart >= pdfParts.length)}
                          aria-label="Next page"
                        >
                          ›
                        </button>
                      </>
                    )}
                  </div>

                  {numPages && (
                    <div className="reader-footer">
                      <span className="reader-page-info">
                        {isSplit && pdfParts.length > 0 ? (
                          <>Part {currentPart}/{pdfParts.length} · Page {currentPage} of {numPages}</>
                        ) : (
                          <>Page {currentPage} of {numPages}</>
                        )}
                      </span>
                      <form
                        className="reader-jump"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const value = parseInt(jumpPage, 10);
                          if (!Number.isNaN(value) && value >= 1 && value <= numPages) {
                            setCurrentPage(value);
                          }
                        }}
                      >
                        <label htmlFor="jumpPageInput">Jump to</label>
                        <input
                          id="jumpPageInput"
                          type="number"
                          min="1"
                          max={numPages}
                          value={jumpPage}
                          onChange={(e) => setJumpPage(e.target.value)}
                        />
                        <button type="submit">Go</button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="no-pdf">
              <BookOpen size={48} />
              <p>PDF not available for this title.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Reader;



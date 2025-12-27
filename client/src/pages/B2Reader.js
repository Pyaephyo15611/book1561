import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../utils/apiConfig';
import './BookDetail.css';
import './B2Reader.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const B2Reader = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [numPages, setNumPages] = useState(null);
  const [scale] = useState(1.0);
  const [, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookTitle, setBookTitle] = useState('Loading...');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pageInput, setPageInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const scrollerRef = useRef(null);

  // Fetch book details for title
  useEffect(() => {
    const fetchBookDetails = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/books/${id}`);
        setBookTitle(response.data.title || 'Book Reader');
      } catch (err) {
        console.error('Error fetching book details:', err);
        setBookTitle('Book Reader');
      }
    };
    fetchBookDetails();
  }, [id]);

  // Fetch view URL that handles parts or single PDF via proxy
  useEffect(() => {
    const fetchView = async () => {
      try {
        const resp = await axios.get(`${API_URL}/api/books/${id}/view`);
        if (resp.data && resp.data.viewUrl) {
          setPdfUrl(resp.data.viewUrl);
        } else {
          setPdfUrl(`${API_URL}/api/books/${id}/pdf`);
        }
      } catch (e) {
        console.error('Error fetching view URL:', e);
        setPdfUrl(`${API_URL}/api/books/${id}/pdf`);
      }
    };
    fetchView();
  }, [id]);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setCurrentPage((p) => {
      const next = Math.min(Math.max(p, 1), numPages);
      return next;
    });
    setLoading(false);
  }

  function onDocumentLoadError(err) {
    console.error('Error loading PDF:', err);
    setError(err.message || 'Failed to load PDF');
    setLoading(false);
  }

  function handleJumpToPage() {
    if (!numPages) return;
    const raw = parseInt(pageInput, 10);
    if (isNaN(raw)) return;
    const target = Math.min(Math.max(raw, 1), numPages);
    setCurrentPage(target);
  }

  const canPrev = currentPage > 1;
  const canNext = numPages ? currentPage < numPages : false;
  const pageWidth = scrollerRef.current ? Math.min(scrollerRef.current.clientWidth - 24, 1200) : undefined;

  return (
    <div className="b2reader-root">
      {/* Top bar */}
      <div className="b2reader-topbar">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className="topbar-title" title={bookTitle}>{bookTitle}</div>
        <div className="topbar-actions">
          <input
            type="number"
            className="jump-input"
            placeholder={numPages ? `1 - ${numPages}` : 'Page #'}
            min={1}
            max={numPages || undefined}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJumpToPage();
            }}
            aria-label="Page number"
          />
          <button className="jump-btn" onClick={handleJumpToPage} title="Jump to page">
            Jump
          </button>
        </div>
      </div>

      {/* Horizontal scroller */}
      <div className="b2reader-scroller" ref={scrollerRef}>
        {error ? (
          <div className="error-message" style={{ color: '#fff', textAlign: 'center' }}>
            <h3>Error loading PDF</h3>
            <p>{error}</p>
            <p>Try refreshing the page or checking your connection.</p>
          </div>
        ) : !pdfUrl ? (
          <div className="error-message" style={{ color: '#fff', textAlign: 'center' }}>
            <h3>Preparing reader…</h3>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="loading-container">
                <div className="loader"></div>
                <p style={{ color: '#fff', marginTop: '10px' }}>Loading PDF…</p>
              </div>
            }
            className="b2reader-document"
          >
            <div className="b2reader-page">
              <Page
                pageNumber={currentPage}
                scale={scale}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading="Loading page..."
              />
              <div className="page-label">{currentPage}/{numPages || '--'}</div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '12px' }}>
                <button
                  className="jump-btn"
                  onClick={() => canPrev && setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                  title="Previous page"
                >
                  Prev
                </button>
                <button
                  className="jump-btn"
                  onClick={() => canNext && setCurrentPage((p) => Math.min((numPages || p + 1), p + 1))}
                  disabled={!canNext}
                  title="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          </Document>
        )}
      </div>
    </div>
  );
};

export default B2Reader;

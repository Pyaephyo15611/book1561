import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { ArrowLeft, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
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
  const [scale, setScale] = useState(1.0);
  const [, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookTitle, setBookTitle] = useState('Loading...');
  const [pdfUrl, setPdfUrl] = useState('');

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
    setLoading(false);
  }

  function onDocumentLoadError(err) {
    console.error('Error loading PDF:', err);
    setError(err.message || 'Failed to load PDF');
    setLoading(false);
  }

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
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} className="zoom-btn" title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <span className="zoom-percent">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2.0, s + 0.1))} className="zoom-btn" title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button onClick={() => setScale(1.0)} className="zoom-btn" title="Reset Zoom">
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Horizontal scroller */}
      <div className="b2reader-scroller">
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
            {Array.from(new Array(numPages || 0), (el, index) => (
              <div key={`page_${index + 1}`} className="b2reader-page">
                <Page
                  pageNumber={index + 1}
                  scale={scale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading="Loading page..."
                />
                <div className="page-label">{index + 1}/{numPages || '--'}</div>
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
};

export default B2Reader;

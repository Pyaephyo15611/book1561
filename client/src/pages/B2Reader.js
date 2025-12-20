import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { ArrowLeft, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../utils/apiConfig';
import './BookDetail.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const B2Reader = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookTitle, setBookTitle] = useState('Loading...');

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

  // Use the proxy endpoint that streams from B2
  const pdfUrl = `${API_URL}/api/books/${id}/pdf`;

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function onDocumentLoadError(err) {
    console.error('Error loading PDF:', err);
    setError(err.message);
    setLoading(false);
  }

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);

  return (
    <div className="book-detail" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="book-nav" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="container">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>
          <div className="nav-actions">
            <span className="page-info">{bookTitle}</span>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="container" style={{ padding: '10px', display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center', background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
        <div className="zoom-controls" style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="zoom-btn" title="Zoom Out">
            <ZoomOut size={20} />
          </button>
          <span style={{ display: 'flex', alignItems: 'center' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(2.0, s + 0.1))} className="zoom-btn" title="Zoom In">
            <ZoomIn size={20} />
          </button>
          <button onClick={() => setScale(1.0)} className="zoom-btn" title="Reset Zoom">
            <RotateCcw size={20} />
          </button>
        </div>
        
        <div className="page-controls" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            disabled={pageNumber <= 1} 
            onClick={previousPage}
            className="reader-arrow"
            style={{ position: 'static', transform: 'none' }}
          >
            ‹
          </button>
          <span>
            Page {pageNumber || '--'} of {numPages || '--'}
          </span>
          <button 
            disabled={pageNumber >= numPages} 
            onClick={nextPage}
            className="reader-arrow"
            style={{ position: 'static', transform: 'none' }}
          >
            ›
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="pdf-viewer-container" style={{ flex: 1, display: 'flex', justifyContent: 'center', background: '#525659', padding: '20px', overflow: 'auto' }}>
        {error ? (
          <div className="error-message" style={{ color: 'white', textAlign: 'center' }}>
            <h3>Error loading PDF</h3>
            <p>{error}</p>
            <p>Try refreshing the page or checking your connection.</p>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="loading-container">
                <div className="loader"></div>
                <p style={{ color: 'white', marginTop: '10px' }}>Loading PDF from B2...</p>
              </div>
            }
            className="pdf-document"
          >
            <Page 
              pageNumber={pageNumber} 
              scale={scale} 
              renderTextLayer={false} 
              renderAnnotationLayer={false}
              className="pdf-page"
              loading="Loading page..."
            />
          </Document>
        )}
      </div>
    </div>
  );
};

export default B2Reader;

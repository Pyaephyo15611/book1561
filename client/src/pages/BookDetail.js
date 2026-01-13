import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import {
  ArrowLeft,
  Download,
  Loader,
  Star,
  Info,
  ChevronRight
} from 'lucide-react';
import { getCoverImageUrl } from '../utils/coverImage';
import { apiGet } from '../utils/apiConfig';
import './BookDetail.css';

const BookDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendedBooks, setRecommendedBooks] = useState([]);
  const [recommendLoading, setRecommendLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [newReview, setNewReview] = useState('');
  const [rating, setRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [replyText, setReplyText] = useState({});
  const [submittingReply, setSubmittingReply] = useState({});
  const [hasUserReviewed, setHasUserReviewed] = useState(false);

  const normalizeCategory = (value) => {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  };

  const fetchRecommendedBooks = useCallback(async (currentCategory) => {
    try {
      setRecommendLoading(true);
      let books = [];

      const response = await apiGet('/api/books');
      books = response.data || [];

      const normalizedCurrentCategory = normalizeCategory(currentCategory);

      let filtered = books
        .filter((b) => b && b.id && b.id !== id)
        .filter((b) => {
          if (!normalizedCurrentCategory) return true;
          return normalizeCategory(b.category) === normalizedCurrentCategory;
        });

      // If there aren't enough related books in the same category, fill with any other books.
      if (filtered.length < 6) {
        const fallback = books
          .filter((b) => b && b.id && b.id !== id)
          .filter((b) => !filtered.some((x) => x.id === b.id));
        filtered = [...filtered, ...fallback];
      }

      setRecommendedBooks(filtered.slice(0, 6));
    } catch (error) {
      console.error('Failed to load recommended books', error);
      setRecommendedBooks([]);
    } finally {
      setRecommendLoading(false);
    }
  }, [id]);

  const fetchBook = useCallback(async () => {
    try {
      try {
        const response = await apiGet(`/api/books/${id}`);
        setBook(response.data);
        await fetchRecommendedBooks(response.data?.category);
      } catch (apiError) {
        try {
          const bookRef = doc(db, 'books', id);
          const bookSnap = await getDoc(bookRef);
          if (bookSnap.exists()) {
            const bookData = { id: bookSnap.id, ...bookSnap.data() };
            setBook(bookData);
            await fetchRecommendedBooks(bookData?.category);
          }
        } catch (fsError) {
          throw apiError;
        }
      }
  } catch (error) {
    console.error('Error fetching book:', error);
  } finally {
    setLoading(false);
  }
  }, [id, fetchRecommendedBooks]);

  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  // Ensure each book detail loads scrolled to top (including when navigating from recommendations)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const reviewsQuery = query(collection(db, 'reviews'), where('bookId', '==', id));

    const unsubscribe = onSnapshot(
      reviewsQuery,
      (snapshot) => {
        const reviewData = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
          });
        setReviews(reviewData);
        // Determine if the current user has already left a review for this book
        const currentUser = auth.currentUser;
        if (currentUser) {
          const existingWithRating = reviewData.find(
            (review) =>
              review.userId === currentUser.uid &&
              typeof review.rating === 'number' &&
              review.rating > 0
          );
          setHasUserReviewed(!!existingWithRating);
        } else {
          setHasUserReviewed(false);
        }
        setReviewsLoading(false);
      },
      (error) => {
        console.error('Error loading reviews:', error);
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
          console.warn('Firestore permissions not configured - reviews disabled');
        }
        setReviews([]);
        setReviewsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  // Load replies for all reviews of this book
  useEffect(() => {
    if (!id) return;

    const repliesQuery = query(
      collection(db, 'reviewReplies'),
      where('bookId', '==', id)
    );

    const unsubscribe = onSnapshot(
      repliesQuery,
      (snapshot) => {
        const replyData = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return aTime - bTime;
          });
        setReplies(replyData);
        setRepliesLoading(false);
      },
      (error) => {
        console.error('Error loading replies:', error);
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
          console.warn('Firestore permissions not configured - replies disabled');
        }
        setReplies([]);
        setRepliesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  // PDF is now handled on /read/:id page

  const handleDownload = async () => {
    const shouldDownload = window.confirm('Download this book?');
    if (!shouldDownload) return;
    
    setDownloading(true);
    try {
      const response = await apiGet(`/api/books/${id}/download`, { responseType: 'blob' });

      // Get filename and content type from headers
      let filename = 'book.pdf';
      let contentType = 'application/pdf';
      
      const contentDisposition = response.headers['content-disposition'];
      const contentTypeHeader = response.headers['content-type'];
      
      if (contentTypeHeader) {
        contentType = contentTypeHeader;
      }
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
          // Decode URI component if needed
          try {
            filename = decodeURIComponent(filename);
          } catch (e) {
            // If decoding fails, use as is
          }
        }
      }

      // Create a blob URL and trigger download
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading book:', error);
      alert('Failed to download book. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
      navigate('/login');
      return;
    }

    // Before first review, rating is required; after that, user can post
    // text-only comments without changing the rating.
    if (!hasUserReviewed && (!rating || !newReview.trim())) {
      return;
    }

    setSubmittingReview(true);
    try {
      const user = auth.currentUser;
      const userName =
        user.displayName || (user.email ? user.email.split('@')[0] : 'User');

      if (!hasUserReviewed) {
        // First time: create a review with rating
      await addDoc(collection(db, 'reviews'), {
        bookId: id,
        userId: user.uid,
        userEmail: user.email,
          userName,
        text: newReview.trim(),
        rating,
        createdAt: serverTimestamp()
      });

        setHasUserReviewed(true);
      } else {
        // Subsequent submissions: create separate comment entries without rating
        await addDoc(collection(db, 'reviews'), {
          bookId: id,
          userId: user.uid,
          userEmail: user.email,
          userName,
          text: newReview.trim(),
          rating: 0,
          createdAt: serverTimestamp()
        });
      }

      setNewReview('');
      if (!hasUserReviewed) {
      setRating(0);
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitReply = async (reviewId) => {
    if (!auth.currentUser) {
      navigate('/login');
      return;
    }

    const text = (replyText[reviewId] || '').trim();
    if (!text) return;

    setSubmittingReply((prev) => ({ ...prev, [reviewId]: true }));
    try {
      const user = auth.currentUser;
      const userName =
        user.displayName || (user.email ? user.email.split('@')[0] : 'User');

      await addDoc(collection(db, 'reviewReplies'), {
        reviewId,
        bookId: id,
        userId: user.uid,
        userEmail: user.email,
        userName,
        text,
        createdAt: serverTimestamp()
      });

      setReplyText((prev) => ({ ...prev, [reviewId]: '' }));
    } catch (error) {
      console.error('Error submitting reply:', error);
      alert('Failed to submit reply. Please try again.');
    } finally {
      setSubmittingReply((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  const getRepliesForReview = (reviewId) =>
    replies.filter((r) => r.reviewId === reviewId);

  const getShareUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/book/${id}`;
  };

  const getShareText = () =>
    `Check out "${book?.title || 'this book'}" by ${book?.author || 'Unknown author'} on BookStore`;

  const handleShareTwitter = () => {
    const url = encodeURIComponent(getShareUrl());
    const text = encodeURIComponent(getShareText());
    const shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShareFacebook = () => {
    const url = encodeURIComponent(getShareUrl());
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(getShareText());
    const body = encodeURIComponent(getShareUrl());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };


  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="book-detail">
        <div className="error-container">
          <h2>Book not found</h2>
          <p>The book you are looking for does not exist or is no longer available.</p>
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="book-detail">
      {/* Sticky top navigation like modern online readers */}
      <header className="book-nav">
        <div className="container">
          <button className="back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
            <span>Library</span>
          </button>

          <div className="nav-actions">
            <span className="page-info">
              {book.title || 'Untitled'} · {book.author || 'Unknown Author'}
            </span>
            <button
              onClick={handleDownload}
              className="action-btn"
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <Loader className="spinning" size={16} />
                  Downloading…
                </>
              ) : (
                <>
                  <Download size={16} />
                  Download
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main reader layout: sidebar + reading area */}
      <main className="container book-detail-layout">
        <section className="book-overview">
          <aside className="book-sidebar">
          {book.coverImage && book.coverImage.trim() && getCoverImageUrl(book) && (
            <div className="book-cover-container">
              <img
                src={getCoverImageUrl(book)}
                alt={book.title || 'Book cover'}
                className="book-detail-cover-img"
                onError={(e) => {
                  console.error('Cover image failed to load:', book.coverImage);
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}

            <div className="book-badge-row">
              <span className="badge badge-free">Free Download</span>
              {book.category && (
                <span className="badge badge-category">
                  {book.category}
                </span>
              )}
            </div>

            <div className="book-side-meta">
              {book.publishedDate && (
                <div>
                  <span className="meta-label">Published</span>
                  <span>{book.publishedDate}</span>
                </div>
              )}
              {(book.pageCount || book.pages) && (
                <div>
                  <span className="meta-label">Pages</span>
                  <span>{book.pageCount || book.pages}</span>
                </div>
              )}
              {book.downloads && (
            <div>
                  <span className="meta-label">Downloads</span>
                  <span>{book.downloads}</span>
                </div>
              )}
            </div>

            <div className="book-share">
              <span>Share this</span>
              <div className="share-icons">
                <button
                  type="button"
                  aria-label="Share to Twitter"
                  onClick={handleShareTwitter}
                >
                  <span className="share-label">X</span>
                </button>
                <button
                  type="button"
                  aria-label="Share to Facebook"
                  onClick={handleShareFacebook}
                >
                  <span className="share-label">f</span>
                </button>
                <button
                  type="button"
                  aria-label="Share via email"
                  onClick={handleShareEmail}
                >
                  <span className="share-label">@</span>
                </button>
              </div>
            </div>
          </aside>

            <div className="book-main">
            <div className="book-heading">
              <h1 className="book-title">{book.title || 'Untitled'}</h1>
              <p className="book-author">
                By{' '}
                {book.author ? (
                  <button
                    onClick={() => navigate(`/author/${encodeURIComponent(book.author)}`)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                      font: 'inherit'
                    }}
                  >
                    {book.author}
                  </button>
                ) : (
                  'Unknown Author'
                )}
              </p>
              {/* Dynamic average rating from reviews */}
              <div className="book-rating">
                {(() => {
                  const ratedReviews = reviews.filter(
                    (r) => typeof r.rating === 'number' && r.rating > 0
                  );
                  const count = ratedReviews.length;
                  const avg =
                    count === 0
                      ? 0
                      : ratedReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
                        count;
                  const rounded = Math.round(avg * 10) / 10;
                  return (
                    <>
                      {[1, 2, 3, 4, 5].map((starValue) => (
                        <Star
                          key={starValue}
                          size={18}
                          className={`icon ${starValue <= avg ? 'filled' : ''}`}
                        />
                      ))}
                      <span>
                        {rounded || 0} / 5 · {count}{' '}
                        {count === 1 ? 'review' : 'reviews'}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="cta-row">
              <button className="cta cta-download" onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <>
                    <Loader className="spinning" size={18} />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Free Download
                  </>
                )}
              </button>
                          </div>

            <div className="availability-note">
              <Info size={16} />
              <p>
                This book is available for free download in PDF format.
              </p>
            </div>

            {book.description && (
              <div className="book-description">
                <p>{book.description}</p>
              </div>
            )}
          </div>
        </section>

        <section className="recommended-section">
          <div className="recommended-header">
            <h3>Recommended Books</h3>
            {!recommendLoading && (
              <button className="view-all-link" onClick={() => navigate('/')}>
                Browse library <ChevronRight size={16} />
                  </button>
                )}
              </div>
          {recommendLoading ? (
            <div className="recommended-loading">
              <Loader className="spinning" size={28} />
                  </div>
          ) : recommendedBooks.length === 0 ? (
            <p className="recommended-empty">No recommendations available.</p>
          ) : (
            <div className="recommended-grid">
              {recommendedBooks.map((rec) => (
                rec.coverImage && rec.coverImage.trim() && (
                  <div
                    key={rec.id}
                    className="recommended-card"
                    onClick={() => navigate(`/book/${rec.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <img
                      src={getCoverImageUrl(rec)}
                      alt={rec.title || 'Book cover'}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                      }}
                    />
                    <p className="rec-title">{rec.title || 'Untitled'}</p>
                    <p className="rec-author">{rec.author || 'Unknown Author'}</p>
                  </div>
                )
              ))}
            </div>
          )}
        </section>

        <section className="reviews-section">
          <div className="reviews-header">
            <h3>Reviews</h3>
            <span className="reviews-count">
              {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </span>
          </div>

          {auth.currentUser ? (
            <form className="review-form" onSubmit={handleSubmitReview}>
              <div className="rating-input">
                {[1, 2, 3, 4, 5].map((starValue) => (
                  <button
                    key={starValue}
                    type="button"
                    className={`rating-star ${starValue <= rating ? 'active' : ''} ${
                      hasUserReviewed ? 'disabled' : ''
                    }`}
                    onClick={() => {
                      if (!hasUserReviewed) {
                        setRating(starValue);
                      }
                    }}
                    disabled={hasUserReviewed}
                  >
                    <Star
                      size={20}
                      className={`icon ${starValue <= rating ? 'filled' : ''}`}
                    />
                  </button>
                ))}
              </div>
              {hasUserReviewed && (
                <p className="review-hint">
                  Your star rating is saved. You can add more comments without changing the rating.
                </p>
              )}
              <textarea
                className="review-textarea"
                placeholder="Share your thoughts about this book..."
                rows={3}
                value={newReview}
                onChange={(e) => setNewReview(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary review-submit-btn"
                disabled={
                  submittingReview ||
                  (!hasUserReviewed && (!rating || !newReview.trim())) ||
                  (hasUserReviewed && !newReview.trim())
                }
              >
                {submittingReview ? 'Submitting...' : hasUserReviewed ? 'Add Comment' : 'Submit Review'}
              </button>
            </form>
          ) : (
            <div className="reviews-login-prompt">
              <p>Sign in to write a review.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/login')}
              >
                Go to Login
              </button>
            </div>
          )}

          <div className="reviews-list">
            {reviewsLoading ? (
              <div className="recommended-loading">
                <Loader className="spinning" size={28} />
              </div>
            ) : reviews.length === 0 ? (
              <p className="recommended-empty">No reviews yet. Be the first to review!</p>
            ) : (
              reviews.map((review) => (
                <div key={review.id} className="review-item">
                  <div className="review-header">
                    <div className="review-user">
                      <div className="review-avatar">
                        {(review.userName || review.userEmail || '?')[0]?.toUpperCase()}
                      </div>
                      <div className="review-user-info">
                        <span className="review-email">
                          {review.userName || review.userEmail || 'Anonymous'}
                        </span>
                        {review.createdAt?.toDate && (
                          <span className="review-date">
                            {review.createdAt.toDate().toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="review-text">{review.text}</p>
                  <div className="review-replies">
                    {repliesLoading ? null : getRepliesForReview(review.id).length > 0 && (
                      <div className="review-replies-list">
                        {getRepliesForReview(review.id).map((reply) => (
                          <div key={reply.id} className="review-reply-item">
                            <div className="review-reply-meta">
                              <span className="review-reply-email">
                                {reply.userName || reply.userEmail || 'Anonymous'}
                              </span>
                              {reply.createdAt?.toDate && (
                                <span className="review-reply-date">
                                  {reply.createdAt.toDate().toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <p className="review-reply-text">{reply.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {auth.currentUser ? (
                      <div className="review-reply-form">
                        <input
                          type="text"
                          className="review-reply-input"
                          placeholder="Reply to this comment..."
                          value={replyText[review.id] || ''}
                          onChange={(e) =>
                            setReplyText((prev) => ({
                              ...prev,
                              [review.id]: e.target.value
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-outline review-reply-button"
                          disabled={
                            submittingReply[review.id] ||
                            !(replyText[review.id] || '').trim()
                          }
                          onClick={() => handleSubmitReply(review.id)}
                        >
                          {submittingReply[review.id]
                            ? 'Replying...'
                            : 'Reply'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default BookDetail;


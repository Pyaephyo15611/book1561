import React from 'react';
import './BookSkeleton.css';

const BookSkeleton = () => {
  return (
    <div className="book-skeleton">
      <div className="skeleton-cover">
        <div className="skeleton-shimmer"></div>
      </div>
      <div className="skeleton-info">
        <div className="skeleton-title skeleton-shimmer"></div>
        <div className="skeleton-author skeleton-shimmer"></div>
        <div className="skeleton-meta skeleton-shimmer"></div>
      </div>
    </div>
  );
};

export default BookSkeleton;

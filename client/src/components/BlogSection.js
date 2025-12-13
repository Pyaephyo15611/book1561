import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './BlogSection.css';

// Get API URL and convert HTTP to HTTPS if page is loaded over HTTPS (fixes mixed content error)
let API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && API_URL.startsWith('http://')) {
  API_URL = API_URL.replace('http://', 'https://');
}

// Helper function to get blog image URL
const getBlogImageUrl = (blog) => {
  if (!blog.image) {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="250"%3E%3Crect fill="%23ddd" width="400" height="250"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EBlog Image%3C/text%3E%3C/svg%3E';
  }

  const image = blog.image.trim();

  // If it's already a full URL (http/https), use it directly
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }

  // If it's a local upload path, use it directly
  if (image.startsWith('/uploads')) {
    return `${API_URL}${image}`;
  }

  // If it's a Backblaze filename (stored in b2ImageFileName or image field without /uploads or http)
  // Use the proxy endpoint
  if (blog.b2ImageFileName || (!image.startsWith('/') && !image.startsWith('http'))) {
    return `${API_URL}/api/blogs/${blog.id}/image`;
  }

  // Fallback: try to construct URL
  return `${API_URL}${image.startsWith('/') ? '' : '/'}${image}`;
};

const BlogSection = ({ blogs = [] }) => {
  const navigate = useNavigate();

  const handleBlogClick = (blogId) => {
    navigate(`/blog/${blogId}`);
  };

  return (
    <section className="blog-section">
      <div className="container">
        <div className="blog-section-header">
          <h2 className="blog-section-title">Latest News & Articles</h2>
        </div>
        {blogs && blogs.length > 0 ? (
          <div className="blog-scroll-container">
            <div className="blog-scroll">
              {blogs.map((blog, index) => (
            <motion.div
              key={blog.id || index}
              className="blog-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleBlogClick(blog.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="blog-image-container">
                <img
                  src={getBlogImageUrl(blog)}
                  alt={blog.title || 'Blog post image'}
                  className="blog-image"
                  loading="lazy"
                  onError={(e) => {
                    e.target.onerror = null;
                    // Use a data URI as fallback instead of external URL
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="250"%3E%3Crect fill="%23ddd" width="400" height="250"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EBlog Image%3C/text%3E%3C/svg%3E';
                  }}
                />
                <div className="blog-category">{blog.category || 'GENERAL'}</div>
              </div>
              <div className="blog-content">
                <h3 className="blog-title">{blog.title || 'Untitled'}</h3>
                <p className="blog-excerpt">
                  {blog.excerpt || blog.description || 'No description available.'}
                </p>
              </div>
            </motion.div>
            ))}
            </div>
          </div>
        ) : (
          <div className="blog-empty-state">
            <p>No blog posts yet. Check back soon for updates!</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default BlogSection;


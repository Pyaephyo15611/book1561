import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore/lite';
import { db } from '../firebase/config';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import { API_URL } from '../utils/apiConfig';
import './BlogDetail.css';

// Helper function to get blog image URL
const getBlogImageUrl = (blog) => {
  if (!blog || !blog.image) {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="400"%3E%3Crect fill="%23ddd" width="800" height="400"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="24" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EBlog Image%3C/text%3E%3C/svg%3E';
  }

  const image = blog.image.trim();

  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }

  if (image.startsWith('/uploads')) {
    return `${API_URL}${image}`;
  }

  if (blog.b2ImageFileName || (!image.startsWith('/') && !image.startsWith('http'))) {
    return `${API_URL}/api/blogs/${blog.id}/image`;
  }

  return `${API_URL}${image.startsWith('/') ? '' : '/'}${image}`;
};

const BlogDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [blog, setBlog] = useState(null);
  const [relatedBlogs, setRelatedBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBlog = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Try API first
      try {
        const response = await axios.get(`${API_URL}/api/blogs/${id}`);
        setBlog(response.data);
      } catch (apiError) {
        console.log('API not available, trying Firestore directly');
        // Fallback to Firestore
        const blogRef = doc(db, 'blogs', id);
        const blogSnap = await getDoc(blogRef);
        if (blogSnap.exists()) {
          setBlog({ id: blogSnap.id, ...blogSnap.data() });
        } else {
          setError('Blog not found');
        }
      }
    } catch (error) {
      console.error('Error fetching blog:', error);
      setError('Failed to load blog. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchRelatedBlogs = useCallback(async () => {
    try {
      // Try API first
      try {
        const response = await axios.get(`${API_URL}/api/blogs`);
        const allBlogs = response.data || [];
        // Filter out current blog and get up to 5 related blogs
        const filtered = allBlogs
          .filter((b) => b.id !== id)
          .slice(0, 5);
        setRelatedBlogs(filtered);
      } catch (apiError) {
        console.log('API not available, trying Firestore directly');
        // Fallback to Firestore
        const blogsSnapshot = await getDocs(collection(db, 'blogs'));
        const blogsData = [];
        blogsSnapshot.forEach((doc) => {
          blogsData.push({
            id: doc.id,
            ...doc.data()
          });
        });
        const filtered = blogsData
          .filter((b) => b.id !== id)
          .slice(0, 5);
        setRelatedBlogs(filtered);
      }
    } catch (error) {
      console.error('Error fetching related blogs:', error);
      setRelatedBlogs([]);
    }
  }, [id]);

  useEffect(() => {
    fetchBlog();
    fetchRelatedBlogs();
  }, [fetchBlog, fetchRelatedBlogs]);

  if (loading) {
    return (
      <div className="blog-detail-loading">
        <div className="loader"></div>
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className="blog-detail-container">
        <div className="blog-detail-error">
          <h2>Blog Not Found</h2>
          <p>{error || 'The blog post you are looking for does not exist.'}</p>
          <button onClick={() => navigate('/')} className="btn-back">
            <ArrowLeft size={20} />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const siteUrl = window.location.origin;
  const blogUrl = `${siteUrl}/blog/${id}`;
  const blogImageUrl = getBlogImageUrl(blog);
  const blogDescription = blog.excerpt || blog.description || `Read ${blog.title} - ${blog.category || 'General'} news and articles`;
  // Optimize title for SEO - keep it under 60 characters for search results
  const optimizedTitle = blog.title.length > 60 
    ? `${blog.title.substring(0, 57)}... | BookStore Blog`
    : `${blog.title} | BookStore Blog`;
  const blogTitle = optimizedTitle;

  // Structured Data (JSON-LD) for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": blog.title,
    "description": blogDescription,
    "image": blogImageUrl,
    "datePublished": blog.createdAt || blog.date || new Date().toISOString(),
    "dateModified": blog.createdAt || blog.date || new Date().toISOString(),
    "author": {
      "@type": "Organization",
      "name": "BookStore"
    },
    "publisher": {
      "@type": "Organization",
      "name": "BookStore",
      "logo": {
        "@type": "ImageObject",
        "url": `${siteUrl}/logo.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": blogUrl
    },
    "articleSection": blog.category || "General"
  };

  return (
    <>
      <Helmet>
        {/* Primary Meta Tags */}
        <title>{blogTitle}</title>
        <meta name="title" content={blogTitle} />
        <meta name="description" content={blogDescription} />
        <meta name="keywords" content={`${blog.category}, blog, news, articles, ${blog.title}`} />
        <meta name="author" content="BookStore" />
        <link rel="canonical" href={blogUrl} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={blogUrl} />
        <meta property="og:title" content={blogTitle} />
        <meta property="og:description" content={blogDescription} />
        <meta property="og:image" content={blogImageUrl} />
        <meta property="og:site_name" content="BookStore" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={blogUrl} />
        <meta name="twitter:title" content={blogTitle} />
        <meta name="twitter:description" content={blogDescription} />
        <meta name="twitter:image" content={blogImageUrl} />

        {/* Article Meta */}
        <meta property="article:published_time" content={blog.createdAt || blog.date || new Date().toISOString()} />
        <meta property="article:modified_time" content={blog.createdAt || blog.date || new Date().toISOString()} />
        <meta property="article:section" content={blog.category || "General"} />
        <meta property="article:tag" content={blog.category || "General"} />

        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="blog-detail-container">
        <nav aria-label="Breadcrumb" className="blog-breadcrumb">
          <ol itemScope itemType="https://schema.org/BreadcrumbList" style={{ display: 'flex', gap: '0.5rem', listStyle: 'none', padding: 0, margin: '0 0 1rem 0' }}>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <a itemProp="item" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
                <span itemProp="name">Home</span>
              </a>
              <meta itemProp="position" content="1" />
            </li>
            <li style={{ margin: '0 0.5rem' }}>/</li>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <a itemProp="item" href="/blog" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
                <span itemProp="name">Blog</span>
              </a>
              <meta itemProp="position" content="2" />
            </li>
            <li style={{ margin: '0 0.5rem' }}>/</li>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <span itemProp="name">{blog.title}</span>
              <meta itemProp="position" content="3" />
            </li>
          </ol>
        </nav>

        <button onClick={() => navigate('/')} className="btn-back">
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <div className="blog-detail-layout">
        {/* Main Article */}
        <article className="blog-detail-main" itemScope itemType="https://schema.org/BlogPosting">
          <div className="blog-detail-header">
            <div className="blog-detail-category" itemProp="articleSection">{blog.category || 'GENERAL'}</div>
            <h1 className="blog-detail-title" itemProp="headline">{blog.title || 'Untitled'}</h1>
            <meta itemProp="datePublished" content={blog.createdAt || blog.date || new Date().toISOString()} />
            <meta itemProp="dateModified" content={blog.createdAt || blog.date || new Date().toISOString()} />
          </div>

          <div className="blog-detail-image">
            <img
              src={getBlogImageUrl(blog)}
              alt={blog.title || 'Blog post image'}
              itemProp="image"
              loading="eager"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="400"%3E%3Crect fill="%23ddd" width="800" height="400"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="24" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EBlog Image%3C/text%3E%3C/svg%3E';
              }}
            />
          </div>

          <div className="blog-detail-content" itemProp="articleBody">
            {blog.excerpt && (
              <p className="blog-detail-excerpt" itemProp="description">{blog.excerpt}</p>
            )}
            
            {blog.description && (
              <div className="blog-detail-description">
                {blog.description.split('\n').map((paragraph, index) => (
                  <p key={index} itemProp="text">{paragraph}</p>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Most Read Sidebar */}
        <aside className="blog-detail-sidebar">
          <div className="most-read-header">
            <h2>MOST READ</h2>
          </div>
          <div className="most-read-list">
            {relatedBlogs.length > 0 ? (
              relatedBlogs.map((relatedBlog, index) => (
                <div
                  key={relatedBlog.id || index}
                  className="most-read-item"
                  onClick={() => navigate(`/blog/${relatedBlog.id}`)}
                >
                  <div className="most-read-image">
                    <img
                      src={getBlogImageUrl(relatedBlog)}
                      alt={relatedBlog.title}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="80"%3E%3Crect fill="%23ddd" width="120" height="80"/%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                  <div className="most-read-content">
                    <h3 className="most-read-title">{relatedBlog.title || 'Untitled'}</h3>
                  </div>
                </div>
              ))
            ) : (
              <div className="most-read-empty">
                <p>No related articles</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
    </>
  );
};

export default BlogDetail;


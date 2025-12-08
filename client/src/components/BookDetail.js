import React from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Container, 
  IconButton,
  Paper,
  Divider,
  Tabs,
  Tab,
  Chip,
  Button,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  BookmarkBorder as BookmarkBorderIcon,
  Bookmark as BookmarkIcon,
  MenuBook as MenuBookIcon,
  Info as InfoIcon,
  FormatQuote as FormatQuoteIcon,
  Share as ShareIcon
} from '@mui/icons-material';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`book-tabpanel-${index}`}
      aria-labelledby={`book-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.number.isRequired,
  value: PropTypes.number.isRequired,
};

const BookDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [tabValue, setTabValue] = React.useState(0);
  const [bookmarked, setBookmarked] = React.useState(false);
  const [recommendedBooks, setRecommendedBooks] = React.useState([]);
  const [snackbar, setSnackbar] = React.useState({ 
    open: false, 
    message: '', 
    severity: 'info' 
  });

  React.useEffect(() => {
    const fetchBook = async () => {
      try {
        // Fetch book details
        const response = await fetch(`http://localhost:5000/api/books/${id}`);
        if (!response.ok) throw new Error('Book not found');
        const data = await response.json();
        setBook(data);
        
        // Fetch recommended books
        try {
          const recommendedResponse = await fetch(`http://localhost:5000/api/books?limit=4&exclude=${id}`);
          if (recommendedResponse.ok) {
            const recommendedData = await recommendedResponse.json();
            setRecommendedBooks(Array.isArray(recommendedData) ? recommendedData : []);
          }
        } catch (recommendedError) {
          console.error('Error fetching recommended books:', recommendedError);
          setRecommendedBooks([]);
        }
      } catch (err) {
        console.error('Error fetching book:', err);
        setError('Failed to load book. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBook();
  }, [id]);

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: book.title,
          text: `Check out ${book.title} by ${book.author}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        showSnackbar('Link copied to clipboard!', 'success');
      }
    } catch (err) {
      console.error('Error sharing:', err);
      showSnackbar('Failed to share. Please try again.', 'error');
    }
  };

  const toggleBookmark = () => {
    setBookmarked(!bookmarked);
    showSnackbar(
      !bookmarked ? 'Book added to bookmarks' : 'Book removed from bookmarks',
      'success'
    );
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error" variant="h6" gutterBottom>
          Oops! Something went wrong
        </Typography>
        <Typography color="text.secondary">{error}</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={() => window.location.reload()}
          sx={{ mt: 2 }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  if (!book) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          Book not found
        </Typography>
        <Button 
          variant="outlined" 
          onClick={() => navigate('/')}
          sx={{ mt: 2 }}
        >
          Back to Home
        </Button>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header with back button */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          {book.title}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton 
          onClick={toggleBookmark}
          aria-label={bookmarked ? 'Remove from bookmarks' : 'Add to bookmarks'}
        >
          {bookmarked ? <BookmarkIcon color="primary" /> : <BookmarkBorderIcon />}
        </IconButton>
        <IconButton 
          onClick={handleShare}
          aria-label="Share book"
        >
          <ShareIcon />
        </IconButton>
      </Box>

      {/* Book Cover and Basic Info */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
          <Box sx={{ 
            width: { xs: '100%', md: '30%' },
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start'
          }}>
            <Box
              component="img"
              src={book.coverImage || 'https://via.placeholder.com/300x450?text=No+Cover'}
              alt={book.title}
              sx={{ 
                maxWidth: '100%',
                maxHeight: '400px',
                objectFit: 'contain',
                borderRadius: 1,
                boxShadow: 3
              }}
            />
          </Box>

          <Box sx={{ flex: 1 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h4" component="h2" gutterBottom>
                {book.title}
              </Typography>
              <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                by {book.author || 'Unknown Author'}
              </Typography>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {book.genres?.map((genre, index) => (
                  <Chip 
                    key={index} 
                    label={genre} 
                    size="small" 
                    variant="outlined"
                  />
                ))}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  {book.pageCount} pages • {book.publishedDate?.split('-')[0] || ''}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Button 
                  variant="contained" 
                  size="large"
                  startIcon={<MenuBookIcon />}
                  onClick={() => navigate(`/read/${id}`)}
                  sx={{ 
                    px: 4,
                    textTransform: 'none',
                    fontWeight: 500
                  }}
                >
                  Start Reading
                </Button>
                <Button 
                  variant="outlined" 
                  size="large"
                  startIcon={<FormatQuoteIcon />}
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: 500
                  }}
                >
                  Sample
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper elevation={0} sx={{ mb: 3, bgcolor: 'background.paper' }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          aria-label="book details tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="About" icon={<InfoIcon />} iconPosition="start" />
          <Tab label="Chapters" icon={<MenuBookIcon />} iconPosition="start" />
          <Tab label="Reviews" icon={<FormatQuoteIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="body1" paragraph>
            {book.description || 'No description available.'}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Box>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Details
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 2 }}>
              <DetailItem label="Publisher" value={book.publisher} />
              <DetailItem label="Published" value={book.publishedDate} />
              <DetailItem label="Pages" value={book.pageCount} />
              <DetailItem label="Language" value={book.language} />
              <DetailItem label="ISBN" value={book.isbn} />
            </Box>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography>Chapters will be listed here</Typography>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography>Reviews will be shown here</Typography>
        </TabPanel>
      </Paper>

      {/* Recommended Books Section */}
      {recommendedBooks.length > 0 && (
        <Box sx={{ mt: 6, mb: 4 }}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, pl: 2 }}>
            You May Also Like
          </Typography>
          <Box sx={{ 
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 3,
            px: 2
          }}>
            {recommendedBooks.map((recBook) => (
              <Paper 
                key={recBook.id || recBook._id} 
                elevation={0}
                sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  cursor: 'pointer',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    transition: 'transform 0.2s',
                    boxShadow: 3
                  }
                }}
                onClick={() => navigate(`/book/${recBook.id || recBook._id}`)}
              >
                <Box
                  component="img"
                  src={recBook.coverImage || 'https://via.placeholder.com/200x300?text=No+Cover'}
                  alt={recBook.title}
                  sx={{
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover',
                    borderRadius: 1,
                    mb: 2
                  }}
                />
                <Typography variant="subtitle1" noWrap>{recBook.title}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {recBook.author || 'Unknown Author'}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}
      {/* Snackbar for notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
          elevation={6}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

const DetailItem = ({ label, value }) => (
  <>
    <Typography variant="body2" color="text.secondary">
      {label}:
    </Typography>
    <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
      {value || 'N/A'}
    </Typography>
  </>
);

DetailItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
};

BookDetail.propTypes = {
  // Add any props if needed in the future
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error in BookDetail:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error" variant="h6" gutterBottom>
            Something went wrong
          </Typography>
          <Typography color="text.secondary">
            We're having trouble loading this book. Please try again later.
          </Typography>
          <Button 
            variant="outlined" 
            onClick={() => window.location.reload()}
            sx={{ mt: 2 }}
          >
            Reload Page
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};

export default BookDetail;
export { ErrorBoundary };
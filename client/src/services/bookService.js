import { apiGet } from '../utils/apiConfig';

export const getBookById = async (id) => {
  try {
    const response = await apiGet(`/api/books/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching book:', error);
    throw error;
  }
};

export const getAllBooks = async () => {
  try {
    const response = await apiGet('/api/books');
    return response.data;
  } catch (error) {
    console.error('Error fetching books:', error);
    throw error;
  }
};

// Add more API calls as needed

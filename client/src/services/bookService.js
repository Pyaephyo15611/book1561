import axios from 'axios';
import { API_URL } from '../utils/apiConfig';

export const getBookById = async (id) => {
  try {
    const response = await axios.get(`${API_URL}/api/books/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching book:', error);
    throw error;
  }
};

export const getAllBooks = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/books`);
    return response.data;
  } catch (error) {
    console.error('Error fetching books:', error);
    throw error;
  }
};

// Add more API calls as needed

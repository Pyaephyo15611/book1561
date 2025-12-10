import axios from 'axios';

// Prefer env var, fallback to localhost for development
const baseUrlEnv = process.env.REACT_APP_API_URL;
const API_URL = baseUrlEnv && baseUrlEnv.trim()
  ? baseUrlEnv.replace(/\/$/, '') // Remove trailing slash
  : 'http://localhost:5000';

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

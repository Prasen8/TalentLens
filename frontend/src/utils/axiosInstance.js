import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    // Prevent HTTP caching
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

// Add request interceptor to include auth token and cache-busting
axiosInstance.interceptors.request.use(
  (config) => {
    // Get token from localStorage - always get fresh token
    const userAuth = localStorage.getItem('userAuth');
    if (userAuth) {
      try {
        const userData = JSON.parse(userAuth);
        const token = userData.token;
        
        // Add authorization header with fresh token
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (e) {
        console.error('Error parsing userAuth:', e);
      }
    }
    
    // Add cache-busting timestamp for GET requests
    if (config.method === 'get') {
      config.params = config.params || {};
      config.params._t = Date.now(); // Add timestamp to bust cache
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // If unauthorized, clear auth and redirect to login
    if (error.response && error.response.status === 401) {
      clearAuthData();
      window.location.href = '/auth';
    }
    
    return Promise.reject(error);
  }
);

// Function to clear all auth-related data
export const clearAuthData = () => {
  localStorage.removeItem('userAuth');
  localStorage.removeItem('isAuthenticated');
  localStorage.removeItem('sessionId');
  
  // Dispatch logout event for any listeners
  window.dispatchEvent(new CustomEvent('userLoggedOut', {
    detail: { timestamp: Date.now() }
  }));
};

export default axiosInstance;
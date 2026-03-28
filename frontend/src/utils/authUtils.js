// Auth utility functions
import { clearAuthData } from './axiosInstance';

const authUtils = {
  // Check if user is authenticated
  isAuthenticated: () => {
    return localStorage.getItem("isAuthenticated") === "true";
  },

  // Get current user data
  getCurrentUser: () => {
    const userAuth = localStorage.getItem("userAuth");
    return userAuth ? JSON.parse(userAuth) : null;
  },

  // Get user ID — use this when making API calls that need user_id
  getUserId: () => {
    const userAuth = localStorage.getItem("userAuth");
    if (userAuth) {
      return JSON.parse(userAuth).id;
    }
    return null;
  },

  // Get user token
  getToken: () => {
    const userAuth = localStorage.getItem("userAuth");
    if (userAuth) {
      return JSON.parse(userAuth).token;
    }
    return null;
  },

  // Get username
  getUsername: () => {
    const userAuth = localStorage.getItem("userAuth");
    if (userAuth) {
      return JSON.parse(userAuth).username;
    }
    return "User";
  },

  // Get session ID
  getSessionId: () => {
    return localStorage.getItem("sessionId");
  },

  // Save user data to localStorage after login/signup
  // Call this with the response from your backend
  saveAuthData: (responseData) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const userData = {
      id: responseData.user.id,           // ✅ user_id stored here
      username: responseData.user.username,
      email: responseData.user.email,
      token: responseData.token,
      created_at: responseData.user.created_at,
      sessionId: sessionId
    };

    localStorage.setItem("userAuth", JSON.stringify(userData));
    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("sessionId", sessionId);

    // Clear any cached dashboard/performance data from previous session
    sessionStorage.removeItem("dashboardData");
    sessionStorage.removeItem("performanceData");

    return userData;
  },

  // Logout - clears all auth data
  logout: () => {
    clearAuthData();
  }
};

export default authUtils;
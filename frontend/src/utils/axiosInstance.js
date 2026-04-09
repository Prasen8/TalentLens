import axios from "axios";

// ✅ Use environment variable (production) or fallback to localhost (development)
const API_BASE_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

// ✅ Create Axios instance
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    // Prevent caching issues
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
  timeout: 60000, // 60s timeout (Render free tier can be slow)
});

// ✅ Request Interceptor (Attach Token + Cache Busting)
axiosInstance.interceptors.request.use(
  (config) => {
    try {
      const userAuth = localStorage.getItem("userAuth");

      if (userAuth) {
        const userData = JSON.parse(userAuth);

        if (userData?.token) {
          config.headers.Authorization = `Bearer ${userData.token}`;
        }
      }
    } catch (error) {
      console.error("Error reading auth data:", error);
    }

    // ✅ Cache busting for GET requests
    if (config.method === "get") {
      config.params = config.params || {};
      config.params._t = Date.now();
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Response Interceptor (Handle Errors Globally)
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // 🔴 Unauthorized → Logout user
    if (error.response?.status === 401) {
      clearAuthData();
      window.location.href = "/auth";
    }

    // 🟡 Backend sleeping (Render free tier)
    if (error.code === "ECONNABORTED") {
      console.warn("Request timeout - backend may be waking up");
    }

    return Promise.reject(error);
  }
);

// ✅ Clear auth data function
export const clearAuthData = () => {
  localStorage.removeItem("userAuth");
  localStorage.removeItem("isAuthenticated");
  localStorage.removeItem("sessionId");

  // Notify app about logout
  window.dispatchEvent(
    new CustomEvent("userLoggedOut", {
      detail: { timestamp: Date.now() },
    })
  );
};

export default axiosInstance;

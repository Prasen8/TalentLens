import { useEffect, useRef } from 'react';

/**
 * Hook to detect when the user changes (login/logout/switch accounts)
 * Uses custom events for immediate same-tab detection + polling as backup
 */
export const useUserChange = (onUserChange) => {
  const previousUserIdRef = useRef(null);
  const onUserChangeRef = useRef(onUserChange);

  // Keep the callback ref in sync
  useEffect(() => {
    onUserChangeRef.current = onUserChange;
  }, [onUserChange]);

  // Initial user detection on mount
  useEffect(() => {
    const userAuth = localStorage.getItem('userAuth');
    const currentUserId = userAuth ? JSON.parse(userAuth).id : null;
    
    if (currentUserId !== previousUserIdRef.current) {
      previousUserIdRef.current = currentUserId;
      if (onUserChangeRef.current) {
        onUserChangeRef.current(currentUserId);
      }
    }
  }, []);

  // Listen for custom 'userLoggedIn' event (dispatched from AuthPage)
  // and monitor localStorage for other tab changes
  useEffect(() => {
    const handleUserLoggedIn = (e) => {
      const userId = e.detail?.userId;
      if (userId && userId !== previousUserIdRef.current) {
        previousUserIdRef.current = userId;
        if (onUserChangeRef.current) {
          onUserChangeRef.current(userId);
        }
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === 'userAuth') {
        const userAuth = localStorage.getItem('userAuth');
        const currentUserId = userAuth ? JSON.parse(userAuth).id : null;
        
        if (currentUserId !== previousUserIdRef.current) {
          previousUserIdRef.current = currentUserId;
          if (onUserChangeRef.current) {
            onUserChangeRef.current(currentUserId);
          }
        }
      }
    };

    // Listen for custom event (immediate, same-tab detection)
    window.addEventListener('userLoggedIn', handleUserLoggedIn);
    
    // Listen for storage changes (for other tabs and backup)
    window.addEventListener('storage', handleStorageChange);
    
    // Periodic check as final fallback (every 300ms)
    const checkInterval = setInterval(() => {
      const userAuth = localStorage.getItem('userAuth');
      const currentUserId = userAuth ? JSON.parse(userAuth).id : null;
      
      if (currentUserId !== previousUserIdRef.current) {
        previousUserIdRef.current = currentUserId;
        if (onUserChangeRef.current) {
          onUserChangeRef.current(currentUserId);
        }
      }
    }, 300);

    return () => {
      window.removeEventListener('userLoggedIn', handleUserLoggedIn);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(checkInterval);
    };
  }, []);

  return previousUserIdRef.current;
};

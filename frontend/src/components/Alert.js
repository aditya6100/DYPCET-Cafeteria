// frontend/src/components/Alert.js

import React, { useState, useEffect, useCallback } from 'react';

// This could be made into a context or hook for global alerts,
// but for now, a simple component that shows/hides itself
// based on props.
function Alert({ message, type, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  // Use useCallback to memoize the fadeOut function
  const fadeOut = useCallback(() => {
    setIsVisible(false);
    // Allow time for fade-out animation before calling onClose
    setTimeout(onClose, 500); 
  }, [onClose]);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(fadeOut, 4000); // Alert visible for 4 seconds
      return () => clearTimeout(timer);
    }
  }, [message, type, fadeOut]);

  if (!message) return null;

  return (
    <div className={`custom-alert alert-${type} ${isVisible ? 'visible' : ''}`}>
      {message}
    </div>
  );
}

export default Alert;

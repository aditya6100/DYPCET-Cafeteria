// frontend/src/hooks/useAlert.js

import React, { useState, useCallback, useContext, createContext, useRef } from 'react';
import Alert from '../components/Alert';

const AlertContext = createContext(null);

export const AlertProvider = ({ children }) => {
  const [alert, setAlert] = useState({ message: '', type: 'info' });
  const timeoutRef = useRef(null);

  const showAlert = useCallback((message, type = 'info') => {
    // Clear any existing timeout to prevent overlapping alerts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setAlert({ message, type });

    timeoutRef.current = setTimeout(() => {
      setAlert({ message: '', type: 'info' }); // Clear alert after a delay
      timeoutRef.current = null;
    }, 4000); // 4 seconds visibility
  }, []);

  const handleCloseAlert = useCallback(() => {
    setAlert({ message: '', type: 'info' });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alert.message && (
        <Alert
          message={alert.message}
          type={alert.type}
          onClose={handleCloseAlert}
        />
      )}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

// frontend/src/hooks/useAlert.js

import React, { useState, useCallback, useContext, createContext } from 'react';
import Alert from '../components/Alert';

const AlertContext = createContext(null);

export const AlertProvider = ({ children }) => {
  const [alert, setAlert] = useState({ message: '', type: 'info' });
  const [timeoutId, setTimeoutId] = useState(null);

  const showAlert = useCallback((message, type = 'info') => {
    // Clear any existing timeout to prevent overlapping alerts
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    setAlert({ message, type });

    const id = setTimeout(() => {
      setAlert({ message: '', type: 'info' }); // Clear alert after a delay
    }, 4000); // 4 seconds visibility
    setTimeoutId(id);
  }, [timeoutId]);

  const handleCloseAlert = useCallback(() => {
    setAlert({ message: '', type: 'info' });
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
  }, [timeoutId]);

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

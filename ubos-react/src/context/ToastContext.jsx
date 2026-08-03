import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toastMsg, setToastMsg] = useState(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((current) => (current === msg ? null : current));
    }, 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ toastMsg, toast }}>
      {children}
    </ToastContext.Provider>
  );
};

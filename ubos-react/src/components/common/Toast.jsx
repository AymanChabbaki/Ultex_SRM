import React from 'react';
import { useToast } from '../../context/ToastContext';

const Toast = () => {
  const { toastMsg } = useToast();

  return (
    <div className={`toast ${toastMsg ? 'visible' : ''}`} id="toast" style={{ transform: toastMsg ? 'translateY(0)' : 'translateY(150%)', opacity: toastMsg ? 1 : 0 }}>
      {toastMsg}
    </div>
  );
};

export default Toast;

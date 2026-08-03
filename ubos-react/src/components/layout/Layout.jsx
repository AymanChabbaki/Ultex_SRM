import React, { useState } from 'react';
import Sidebar from './Sidebar';
import LoginScreen from '../auth/LoginScreen';
import { useAuth } from '../../context/AuthContext';
import Toast from '../common/Toast';

const Layout = ({ children }) => {
  const { session } = useAuth();
  const [sidebarOuvert, setSidebarOuvert] = useState(false);

  const toggleSidebar = () => setSidebarOuvert(!sidebarOuvert);

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <>
      <div id="app">
        <Sidebar ouvert={sidebarOuvert} toggleSidebar={toggleSidebar} />
        <main id="main">
          {children}
        </main>
      </div>
      <Toast />
    </>
  );
};

export default Layout;

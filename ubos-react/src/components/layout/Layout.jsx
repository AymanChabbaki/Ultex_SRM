import React, { useState, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import LoginScreen from '../auth/LoginScreen';
import { useAuth } from '../../context/AuthContext';
import Toast from '../common/Toast';

const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

const Layout = ({ children }) => {
  const { session } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => {
    if (window.innerWidth <= 900) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <SidebarContext.Provider value={{ collapsed, mobileOpen, toggleSidebar }}>
      <div id="app" className={`${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <Sidebar 
          ouvert={mobileOpen} 
          collapsed={collapsed} 
          toggleSidebar={toggleSidebar} 
        />
        <main id="main">
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, { toggleSidebar });
            }
            return child;
          })}
        </main>
      </div>
      <Toast />
    </SidebarContext.Provider>
  );
};

export default Layout;

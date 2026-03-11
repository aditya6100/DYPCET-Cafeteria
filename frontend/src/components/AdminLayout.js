// frontend/src/components/AdminLayout.js

import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';

function AdminLayout() {
  const { user, isLoggedIn, isAdmin, isFaculty, logout } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Check if user is a canteen committee coordinator
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    // Redirect if not logged in
    if (!isLoggedIn) {
      showAlert('Please log in to access this page.', 'error');
      navigate('/login');
    } else if (!isAdmin && !isFaculty) {
      showAlert('You do not have permission to access this page.', 'error');
      navigate('/'); // Redirect to home if not admin or faculty
    }
  }, [isLoggedIn, isAdmin, isFaculty, navigate, showAlert]);

  if (!isLoggedIn || (!isAdmin && !isFaculty)) {
    return null; // Don't render anything if not authorized, redirect will handle it
  }

  return (
    <div className="admin-body">
      <header className="admin-dashboard-header">
        <div className="admin-header-left">
          <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
            ☰
          </button>
          <Link to={isAdmin ? '/admin' : '/faculty'} className="header-logo-link" onClick={closeSidebar}>
            <h1>{isAdmin ? 'Admin Dashboard' : 'Faculty Panel'}</h1>
          </Link>
        </div>
        <div className="admin-header-right">
          <span id="admin-welcome" className="welcome-message">Welcome, {user?.name}!</span>
          <div className="admin-header-actions">
            <Link to="/" className="button button-outline">View Site</Link>
            <button onClick={logout} className="button">Logout</button>
          </div>
        </div>
      </header>

      <div className="admin-main-content">
        <aside className={`admin-sidebar ${isSidebarOpen ? 'mobile-open' : ''}`}>
          <nav>
            <ul>
              {isAdmin && (
                <>
                  <li><NavLink to="/admin/orders" onClick={closeSidebar}>Orders</NavLink></li>
                  <li><NavLink to="/admin/display" onClick={closeSidebar}>Display Board</NavLink></li>
                  <li><NavLink to="/admin/menu" onClick={closeSidebar}>Food Items</NavLink></li>
                  <li><NavLink to="/admin/analytics" onClick={closeSidebar}>Analytics</NavLink></li>
                  {isCanteenCoordinator && (
                    <>
                      <li><NavLink to="/admin/users" onClick={closeSidebar}>User Management</NavLink></li>
                      <li><NavLink to="/admin/feedback" onClick={closeSidebar}>Feedback</NavLink></li>
                    </>
                  )}
                  <li><NavLink to="/profile" onClick={closeSidebar}>My Profile</NavLink></li>
                </>
              )}
              {isFaculty && (
                <>
                  <li><NavLink to="/faculty" onClick={closeSidebar}>Dashboard</NavLink></li>
                  <li><NavLink to="/faculty/analytics" onClick={closeSidebar}>Analytics</NavLink></li>
                  <li><NavLink to="/profile" onClick={closeSidebar}>My Profile</NavLink></li>
                </>
              )}
            </ul>
          </nav>
        </aside>
        {isSidebarOpen && <div className="admin-sidebar-overlay" onClick={closeSidebar}></div>}
        <main id="admin-content" className="admin-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;

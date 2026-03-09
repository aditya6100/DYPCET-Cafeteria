// frontend/src/components/AdminLayout.js

import React, { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';

function AdminLayout() {
  const { user, isLoggedIn, isAdmin, isFaculty, logout } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  // Check if user is a canteen committee coordinator
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

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
        <Link to={isAdmin ? '/admin' : '/faculty'} className="header-logo-link">
          <h1>{isAdmin ? 'Admin Dashboard' : 'Faculty Panel'}</h1>
        </Link>
        <div>
          <span id="admin-welcome" className="welcome-message">Welcome, {user?.name}!</span>
          <Link to="/" className="button button-outline">View Site</Link>
          <button onClick={logout} className="button">Logout</button>
        </div>
      </header>

      <div className="admin-main-content">
        <aside className="admin-sidebar">
          <nav>
            <ul>
              {isAdmin && (
                <>
                  <li><NavLink to="/admin/orders">Orders</NavLink></li>
                  <li><NavLink to="/admin/display">Display Board</NavLink></li>
                  <li><NavLink to="/admin/menu">Food Items</NavLink></li>
                  <li><NavLink to="/admin/analytics">Analytics</NavLink></li>
                  {isCanteenCoordinator && (
                    <>
                      <li><NavLink to="/admin/users">User Management</NavLink></li>
                      <li><NavLink to="/admin/feedback">Feedback</NavLink></li>
                    </>
                  )}
                </>
              )}
              {isFaculty && (
                <>
                  <li><NavLink to="/faculty">Dashboard</NavLink></li>
                  <li><NavLink to="/faculty/analytics">Analytics</NavLink></li>
                </>
              )}
            </ul>
          </nav>
        </aside>
        <main id="admin-content" className="admin-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;

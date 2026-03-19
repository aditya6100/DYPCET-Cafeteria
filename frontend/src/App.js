import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'; // Added Navigate
import Header from './components/Header';
import Footer from './components/Footer';
import WelcomePage from './pages/WelcomePage'; // Import WelcomePage
import HomePage from './pages/HomePage'; // This is now the menu page

import NewLoginPage from './pages/auth/NewLoginPage';
import NewRegisterPage from './pages/auth/NewRegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import CartPage from './pages/CartPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import OrderStatusPage from './pages/OrderStatusPage';
import ProfilePage from './pages/ProfilePage';
import UserFeedbackPage from './pages/UserFeedbackPage'; // New Import
import AdminLayout from './components/AdminLayout';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminMenuPage from './pages/admin/AdminMenuPage';
import AdminFeedbackPage from './pages/admin/AdminFeedbackPage';
import FacultyPanelPage from './pages/admin/FacultyPanelPage';
import AdminDisplayBoardPage from './pages/admin/AdminDisplayBoardPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import { AuthProvider } from './context/AuthContext';
import { AlertProvider } from './hooks/useAlert';


function App() {
  return (
    <Router>
      <AlertProvider>
        <AuthProvider>
          <div className="App">
            <Routes>
              {/* Public routes */}
              {/* Root path now shows the WelcomePage */}
              <Route path="/" element={<><Header /><main><WelcomePage /></main><Footer /></>} />
              {/* New route for the actual menu items */}
              <Route path="/menu-items" element={<><Header /><main><HomePage /></main><Footer /></>} />

    
              <Route path="/login" element={<><Header /><main><NewLoginPage /></main><Footer /></>} />
              <Route path="/register" element={<><Header /><main><NewRegisterPage /></main><Footer /></>} />
              <Route path="/forgot-password" element={<><Header /><main><ForgotPasswordPage /></main><Footer /></>} />
              <Route path="/reset-password" element={<><Header /><main><ResetPasswordPage /></main><Footer /></>} />
              <Route path="/cart" element={<><Header /><main><CartPage /></main><Footer /></>} />
              <Route path="/orders" element={<><Header /><main><OrderHistoryPage /></main><Footer /></>} />
              <Route path="/status/:orderId" element={<><Header /><main><OrderStatusPage /></main><Footer /></>} />
              <Route path="/profile" element={<><Header /><main><ProfilePage /></main><Footer /></>} />
              <Route path="/feedback" element={<><Header /><main><UserFeedbackPage /></main><Footer /></>} />
              <Route path="/display" element={<AdminDisplayBoardPage publicMode />} />
              <Route path="/display-window" element={<AdminDisplayBoardPage kiosk publicMode />} />
              <Route path="/admin/display-window" element={<AdminDisplayBoardPage kiosk />} />

              {/* Admin routes - nested under AdminLayout */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOrdersPage />} /> {/* Default admin route (redirect to orders) */}
                <Route path="dashboard" element={<Navigate to="/admin/orders" replace />} /> {/* Redirect from old dashboard path */}
                <Route path="orders" element={<AdminOrdersPage />} /> {/* Admin Orders Page */}
                <Route path="display" element={<AdminDisplayBoardPage />} /> {/* Admin Display Board */}
                <Route path="users" element={<AdminUsersPage />} /> {/* Admin Users Page */}
                <Route path="menu" element={<AdminMenuPage />} /> {/* Admin Menu Page */}
                <Route path="feedback" element={<AdminFeedbackPage />} /> {/* Admin Feedback Page */}
                <Route path="analytics" element={<AnalyticsPage />} /> {/* Admin Analytics */}
              </Route>

              {/* Faculty routes - nested under AdminLayout */}
              <Route path="/faculty" element={<AdminLayout />}>
                <Route index element={<FacultyPanelPage />} /> {/* Faculty Panel */}
                <Route path="analytics" element={<AnalyticsPage />} /> {/* Faculty Analytics */}
              </Route>
            </Routes>
          </div>
        </AuthProvider>
      </AlertProvider>
    </Router>
  );
}

export default App;

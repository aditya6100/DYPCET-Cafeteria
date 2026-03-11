import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../hooks/useAlert';
import './Auth.css';

const NewLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      showAlert('Login successful!', 'success');
      navigate('/');
    } catch (error) {
      showAlert(error.message, 'error');
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-left-section">
        <div className="auth-brand">
          <h1>🍽️ DYPCET</h1>
          <p>Cafeteria Management System</p>
        </div>
        <div className="auth-info">
          <div className="info-item">
            <div className="info-icon">🎓</div>
            <h3>For Students</h3>
            <p>Order meals, track feedback, manage preferences</p>
          </div>
          <div className="info-item">
            <div className="info-icon">👨‍🏫</div>
            <h3>For Faculty</h3>
            <p>Coordinate with cafeteria staff, view feedback</p>
          </div>
        </div>
      </div>

      <div className="auth-right-section">
        <div className="auth-form-container">
          <div className="auth-tabs">
            <NavLink to="/login" className={({ isActive }) => `auth-tab ${isActive ? 'active' : ''}`}>Login</NavLink>
            <NavLink to="/register" className={({ isActive }) => `auth-tab ${isActive ? 'active' : ''}`}>Register</NavLink>
          </div>

          <div className="auth-header">
            <h2>Welcome Back</h2>
            <p>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email or Mobile Number</label>
              <div className="input-wrapper">
                <span className="input-icon">✉️</span>
                <input
                  type="text"
                  id="email"
                  placeholder="you@example.com or 10-digit mobile"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper password-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-password text-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div style={{ textAlign: 'right', marginTop: '5px' }}>
                <Link to="/forgot-password" size="small" style={{ fontSize: '0.85rem', color: '#F47F20', textDecoration: 'none', fontWeight: '500' }}>
                  Forgot password?
                </Link>
              </div>
            </div>

            <button type="submit" className="auth-submit-btn">
              Sign In
            </button>
          </form>

          <div className="auth-divider">or</div>

          <div className="auth-footer">
            <p>
              Don't have an account?{' '}
              <Link to="/register" className="auth-link">
                Create one now
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewLoginPage;

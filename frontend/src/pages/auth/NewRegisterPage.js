import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../hooks/useAlert';
import './Auth.css';

const NewRegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile_no, setMobileNo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userType, setUserType] = useState('student');
  const [studentId, setStudentId] = useState('');
  const [address, setAddress] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showAlert('Passwords do not match!', 'error');
      return;
    }
    if (userType === 'student' && !studentId.trim()) {
      showAlert('Student ID is required for students!', 'error');
      return;
    }
    if (userType === 'visitor' && !address.trim()) {
      showAlert('Address is required for visitors!', 'error');
      return;
    }
    if (!/^\d{10}$/.test(mobile_no)) {
      showAlert('Mobile number must be exactly 10 digits!', 'error');
      return;
    }
    try {
      await register(
        name,
        email,
        password,
        mobile_no,
        userType,
        userType === 'student' ? studentId : null,
        null,
        userType === 'visitor' ? address.trim() : null
      );
      showAlert('Registration successful! Please log in.', 'success');
      navigate('/login');
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
            <div className="info-icon">📝</div>
            <h3>Quick Registration</h3>
            <p>Join in just a few steps</p>
          </div>
          <div className="info-item">
            <div className="info-icon">🔐</div>
            <h3>Secure Account</h3>
            <p>Your data is protected with encryption</p>
          </div>
          <div className="info-item">
            <div className="info-icon">✨</div>
            <h3>Get Started</h3>
            <p>Start ordering meals immediately</p>
          </div>
        </div>
      </div>

      <div className="auth-right-section">
        <div className="auth-form-container">
          <div className="auth-header register-auth-header">
            <h2>Create Account</h2>
            <p>Join our cafeteria community</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  type="text"
                  id="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <span className="input-icon">✉️</span>
                <input
                  type="email"
                  id="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="userType">User Type</label>
              <div className="input-wrapper">
                <span className="input-icon">🎯</span>
                <select
                  id="userType"
                  value={userType}
                  onChange={(e) => setUserType(e.target.value)}
                  required
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="visitor">Visitor</option>
                </select>
              </div>
            </div>

            {userType === 'student' && (
              <div className="form-group">
                <label htmlFor="studentId">Student ID <span className="required">*</span></label>
                <div className="input-wrapper">
                  <span className="input-icon">🆔</span>
                  <input
                    type="text"
                    id="studentId"
                    placeholder="e.g., STU2024001"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    required={userType === 'student'}
                  />
                </div>
              </div>
            )}

            {userType === 'visitor' && (
              <div className="form-group">
                <label htmlFor="address">Address <span className="required">*</span></label>
                <div className="input-wrapper">
                  <span className="input-icon">📍</span>
                  <input
                    type="text"
                    id="address"
                    placeholder="Enter your address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required={userType === 'visitor'}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="mobile_no">Mobile Number</label>
              <div className="input-wrapper">
                <span className="input-icon">📱</span>
                <input
                  type="text"
                  id="mobile_no"
                  placeholder="9876543210"
                  value={mobile_no}
                  maxLength={10}
                  onChange={(e) => setMobileNo(e.target.value.replace(/\D/g, ''))}
                  required
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
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-wrapper password-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-password text-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit-btn">
              Create Account
            </button>
          </form>

          <div className="auth-divider">or</div>

          <div className="auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="auth-link">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewRegisterPage;

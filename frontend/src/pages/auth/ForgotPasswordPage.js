import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAlert } from '../../hooks/useAlert';
import apiRequest from '../../utils/api';
import './Auth.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { showAlert } = useAlert();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      showAlert('Please enter your email address.', 'error');
      return;
    }

    try {
      setLoading(true);
      const result = await apiRequest('/auth/forgot-password', 'POST', { email: normalizedEmail });
      showAlert(result?.message || 'If that email is registered, a reset link has been sent.', 'success');
      setSubmitted(true);
    } catch (error) {
      showAlert(error.message, 'error');
    } finally {
      setLoading(false);
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
            <div className="info-icon">✉️</div>
            <h3>Email Recovery</h3>
            <p>Enter your registered email address</p>
          </div>
          <div className="info-item">
            <div className="info-icon">🔑</div>
            <h3>Reset Link</h3>
            <p>Receive a secure link to set your password</p>
          </div>
          <div className="info-item">
            <div className="info-icon">🛡️</div>
            <h3>Security First</h3>
            <p>Verification keeps your account safe</p>
          </div>
        </div>
      </div>

      <div className="auth-right-section">
        <div className="auth-form-container">
          <div className="auth-header register-auth-header">
            <h2>Forgot Password</h2>
            <p>Recover access to your account</p>
          </div>

          {submitted ? (
            <div className="forgot-success-card">
              <div className="success-icon">✅</div>
              <h3>Reset Link Sent</h3>
              <p>
                If <strong>{email}</strong> is registered, you will receive a password reset email shortly.
              </p>
              <div className="forgot-tips">
                <p><strong>Didn't receive email?</strong></p>
                <ul>
                  <li>Check spam or promotions folder</li>
                  <li>Wait for 1-2 minutes and refresh inbox</li>
                  <li>Verify the email address and resend</li>
                </ul>
              </div>
              <button type="button" className="auth-submit-btn" onClick={() => setSubmitted(false)}>
                Try Another Email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
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

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="auth-divider">or</div>

          <div className="auth-footer">
            <p>
              Remembered your password?{' '}
              <Link to="/login" className="auth-link">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;

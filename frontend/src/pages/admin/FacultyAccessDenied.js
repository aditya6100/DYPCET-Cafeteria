import React from 'react';
import { Link } from 'react-router-dom';
import './FacultyAccessDenied.css';

function FacultyAccessDenied() {
  return (
    <div className="access-denied-container">
      <div className="access-denied-content">
        <div className="icon">🔒</div>
        <h1>Faculty Panel - Restricted Access</h1>
        <p className="description">
          The Faculty Panel is available only for canteen committee members.
        </p>
        
        <div className="info-box">
          <h3>📋 Authorized Users:</h3>
          <p>
            Faculty members registered with email addresses ending in <strong>@member.com</strong> 
            are recognized as canteen committee coordinators.
          </p>
        </div>

        <div className="contact-box">
          <h3>📞 Not a Committee Member?</h3>
          <p>
            If you believe you should have access to the Faculty Panel, 
            please contact the canteen administration or your department head.
          </p>
        </div>

        <Link to="/" className="back-button">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

export default FacultyAccessDenied;

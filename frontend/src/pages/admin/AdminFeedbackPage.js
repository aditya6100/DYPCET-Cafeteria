// frontend/src/pages/admin/AdminFeedbackPage.js

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';

function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  // Check if user is a canteen committee coordinator
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

  useEffect(() => {
    // Only admins who are canteen coordinators can access this
    if (!isAdmin || !isCanteenCoordinator) {
      showAlert('Only canteen coordinators can access Feedback.', 'error');
      navigate('/admin');
    }
  }, [isAdmin, isCanteenCoordinator, navigate, showAlert]);

  const fetchFeedbacks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/feedback'); // Assuming /api/feedback endpoint for admin
      if (!Array.isArray(data)) {
        throw new Error("Invalid feedback data received.");
      }
      setFeedbacks(data);
    } catch (error) {
      showAlert(`Could not load feedback: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (isAdmin && isCanteenCoordinator) {
      fetchFeedbacks();
    }
  }, [isAdmin, isCanteenCoordinator, fetchFeedbacks]);

  const handleResponseSubmit = async (feedbackId, adminResponse) => {
    if (!adminResponse.trim()) {
      showAlert('Response cannot be empty.', 'error');
      return;
    }
    try {
      await apiRequest(`/feedback/${feedbackId}`, 'PUT', { adminResponse });
      showAlert('Response sent!', 'success');
      fetchFeedbacks(); // Refresh feedback list
    } catch (error) {
      showAlert(`Response failed: ${error.message}`, 'error');
    }
  };

  if (!isAdmin || !isCanteenCoordinator) {
    return null;
  }

  if (loading) {
    return <div className="loader">Loading Feedback...</div>;
  }

  return (
    <div>
      <h3>Manage Feedback</h3>
      {feedbacks.length === 0 ? (
        <p>No feedback found.</p>
      ) : (
        <div className="feedback-list">
          {feedbacks.map(fb => (
            <div key={fb.id} className="feedback-card">
              <p><strong>From:</strong> {fb.user_name} ({fb.user_email})</p>
              <p><strong>Subject:</strong> {fb.subject}</p>
              <p>{fb.message}</p>
              <div className="feedback-response-area">
                {fb.status === 'responded' ? (
                  <p className="admin-response"><strong>Your Response:</strong> {fb.admin_response}</p>
                ) : (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleResponseSubmit(fb.id, e.target.elements.adminResponse.value);
                  }}>
                    <textarea name="adminResponse" placeholder="Write response..." rows="3" required></textarea>
                    <button type="submit" className="button-small">Submit</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminFeedbackPage;

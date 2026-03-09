// frontend/src/pages/ProfilePage.js

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';
import apiRequest from '../utils/api';

function ProfilePage() {
  const { isLoggedIn, user, updateUser } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const [profileFormData, setProfileFormData] = useState({
    name: user ? user.name : '',
    email: user ? user.email : '',
    mobile_no: '', // Mobile number is not in the current user context, will need to fetch or add it
  });

  const [feedbackFormData, setFeedbackFormData] = useState({
    subject: '',
    message: '',
  });

  useEffect(() => {
    if (!isLoggedIn) {
      showAlert("Please log in to view your profile.", "error");
      navigate('/login');
      return;
    }

    const fetchUserProfile = async () => {
      try {
        const fullUser = await apiRequest('/users/profile');
        setProfileFormData({
          name: fullUser.name || '',
          email: fullUser.email || '',
          mobile_no: fullUser.mobile_no || ''
        });
        updateUser(fullUser);
      } catch (error) {
        showAlert(`Error fetching profile: ${error.message}`, 'error');
      }
    };

    if (user) {
      setProfileFormData({
        name: user.name || '',
        email: user.email || '',
        mobile_no: user.mobile_no || ''
      });
    }

    fetchUserProfile();

  }, [isLoggedIn, navigate, showAlert, user, updateUser]);

  const handleProfileChange = (e) => {
    const { id, value } = e.target;
    setProfileFormData((prevData) => ({
      ...prevData,
      [id]: value,
    }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedUser = await apiRequest('/users/profile', 'PUT', {
        name: profileFormData.name,
        mobile_no: profileFormData.mobile_no,
      });
      updateUser(updatedUser);
      showAlert('Profile updated successfully!', 'success');
    } catch (error) {
      showAlert(`Profile update failed: ${error.message}`, 'error');
    }
  };

  const handleFeedbackChange = (e) => {
    const { name, value } = e.target;
    setFeedbackFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/feedback', 'POST', feedbackFormData);
      showAlert('Feedback submitted!', 'success');
      setFeedbackFormData({ subject: '', message: '' }); // Clear form
    } catch (error) {
      showAlert(`Feedback submission failed: ${error.message}`, 'error');
    }
  };

  if (!isLoggedIn) {
    return null; // Or show loading spinner
  }

  return (
    <main className="container">
      <div className="auth-card">
        <h2>Your Profile</h2>
        <form id="profile-form" onSubmit={handleProfileSubmit}>
          <div className="input-group">
            <label htmlFor="profile-name">Name</label>
            <input
              type="text"
              id="name"
              value={profileFormData.name}
              onChange={handleProfileChange}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="profile-email">Email</label>
            <input
              type="email"
              id="email"
              value={profileFormData.email}
              disabled // Email is disabled as per original HTML
            />
          </div>
          <div className="input-group">
            <label htmlFor="profile-mobile">Mobile</label>
            <input
              type="tel"
              id="mobile_no"
              value={profileFormData.mobile_no}
              onChange={handleProfileChange}
            />
          </div>
          <button type="submit" className="button">Update Profile</button>
        </form>
      </div>
      <div className="auth-card" style={{ marginTop: '2rem' }}>
        <h3>Submit Feedback</h3>
        <form id="feedback-form" onSubmit={handleFeedbackSubmit}>
          <div className="input-group">
            <label htmlFor="feedback-subject">Subject</label>
            <input
              type="text"
              name="subject"
              value={feedbackFormData.subject}
              onChange={handleFeedbackChange}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="feedback-message">Message</label>
            <textarea
              name="message"
              rows="4"
              value={feedbackFormData.message}
              onChange={handleFeedbackChange}
              required
            ></textarea>
          </div>
          <button type="submit" className="button">Submit Feedback</button>
        </form>
      </div>
    </main>
  );
}

export default ProfilePage;

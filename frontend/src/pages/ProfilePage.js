// frontend/src/pages/ProfilePage.js

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';
import apiRequest from '../utils/api';

function ProfilePage() {
  const { isLoggedIn, user, updateUser, changePassword } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const [profileFormData, setProfileFormData] = useState({
    name: '',
    email: '',
    mobile_no: '',
    user_type: 'student',
    student_id: '',
    address: '',
  });

  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
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
          mobile_no: fullUser.mobile_no || '',
          user_type: fullUser.user_type || 'student',
          student_id: fullUser.student_id || '',
          address: fullUser.address || '',
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
        mobile_no: user.mobile_no || '',
        user_type: user.user_type || 'student',
        student_id: user.student_id || '',
        address: user.address || '',
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
      const response = await apiRequest('/auth/profile', 'PUT', {
        name: profileFormData.name,
        user_type: profileFormData.user_type,
        student_id: profileFormData.user_type === 'student' ? profileFormData.student_id : null,
        address: profileFormData.user_type === 'visitor' ? profileFormData.address : null,
      });
      updateUser(response.user);
      showAlert('Profile updated successfully!', 'success');
    } catch (error) {
      showAlert(`Profile update failed: ${error.message}`, 'error');
    }
  };

  const handlePasswordChange = (e) => {
    const { id, value } = e.target;
    setPasswordFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      showAlert('New passwords do not match!', 'error');
      return;
    }
    if (passwordFormData.newPassword.length < 6) {
      showAlert('Password must be at least 6 characters.', 'error');
      return;
    }
    try {
      await changePassword(passwordFormData.currentPassword, passwordFormData.newPassword);
      showAlert('Password changed successfully!', 'success');
      setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      showAlert(`Password change failed: ${error.message}`, 'error');
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
    return null;
  }

  return (
    <main className="container" style={{ maxWidth: '800px' }}>
      <div className="auth-card">
        <h2>Your Profile</h2>
        <form id="profile-form" onSubmit={handleProfileSubmit}>
          <div className="input-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={profileFormData.name}
              onChange={handleProfileChange}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={profileFormData.email}
              disabled
            />
          </div>
          <div className="input-group">
            <label htmlFor="mobile_no">Mobile</label>
            <input
              type="tel"
              id="mobile_no"
              value={profileFormData.mobile_no}
              disabled
            />
          </div>

          <div className="input-group">
            <label htmlFor="user_type">User Type</label>
            <select
              id="user_type"
              value={profileFormData.user_type}
              onChange={handleProfileChange}
              required
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="visitor">Visitor</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          {profileFormData.user_type === 'student' && (
            <div className="input-group">
              <label htmlFor="student_id">Student ID</label>
              <input
                type="text"
                id="student_id"
                placeholder="e.g. STU12345"
                value={profileFormData.student_id}
                onChange={handleProfileChange}
                required
              />
            </div>
          )}

          {profileFormData.user_type === 'visitor' && (
            <div className="input-group">
              <label htmlFor="address">Address</label>
              <input
                type="text"
                id="address"
                placeholder="Your city/locality"
                value={profileFormData.address}
                onChange={handleProfileChange}
                required
              />
            </div>
          )}

          <button type="submit" className="button auth-submit-btn">Update Profile</button>
        </form>
      </div>

      <div className="auth-card" style={{ marginTop: '2rem' }}>
        <h2>Change Password</h2>
        <form onSubmit={handlePasswordSubmit}>
          <div className="input-group">
            <label htmlFor="currentPassword">Current Password</label>
            <input
              type="password"
              id="currentPassword"
              value={passwordFormData.currentPassword}
              onChange={handlePasswordChange}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={passwordFormData.newPassword}
              onChange={handlePasswordChange}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={passwordFormData.confirmPassword}
              onChange={handlePasswordChange}
              required
            />
          </div>
          <button type="submit" className="button auth-submit-btn">Change Password</button>
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

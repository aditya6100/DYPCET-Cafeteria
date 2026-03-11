// frontend/src/pages/admin/AdminUsersPage.js

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    mobile_no: '',
    user_type: 'staff',
    student_id: '',
    faculty_id: '',
    address: ''
  });

  const { user, isAdmin } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

  useEffect(() => {
    if (!isAdmin || !isCanteenCoordinator) {
      showAlert('Only canteen coordinators can access User Management.', 'error');
      navigate('/admin');
    }
  }, [isAdmin, isCanteenCoordinator, navigate, showAlert]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/users');
      if (!Array.isArray(data)) {
        throw new Error("Invalid user data received.");
      }
      setUsers(data);
    } catch (error) {
      showAlert(`Could not load users: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (isAdmin && isCanteenCoordinator) {
      fetchUsers();
    }
  }, [isAdmin, isCanteenCoordinator, fetchUsers]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/users', 'POST', newUser);
      showAlert('User created successfully!', 'success');
      setShowCreateForm(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        mobile_no: '',
        user_type: 'staff',
        student_id: '',
        faculty_id: '',
        address: ''
      });
      fetchUsers();
    } catch (error) {
      showAlert(`Error creating user: ${error.message}`, 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await apiRequest(`/users/${userId}`, 'DELETE');
        showAlert('User deleted!', 'success');
        fetchUsers();
      } catch (error) {
        showAlert(`Error deleting user: ${error.message}`, 'error');
      }
    }
  };

  if (!isAdmin || !isCanteenCoordinator) {
    return null;
  }

  if (loading) {
    return <div className="loader">Loading Users...</div>;
  }

  return (
    <div className="admin-users-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>User Management</h3>
        <button className="button" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : 'Add New User'}
        </button>
      </div>

      {showCreateForm && (
        <div className="auth-card" style={{ marginBottom: '30px', padding: '20px' }}>
          <h4>Create New User (Staff/Faculty/Admin)</h4>
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="input-group">
              <label>Name</label>
              <input type="text" name="name" value={newUser.name} onChange={handleInputChange} required />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input type="email" name="email" value={newUser.email} onChange={handleInputChange} required />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" name="password" value={newUser.password} onChange={handleInputChange} required />
            </div>
            <div className="input-group">
              <label>Mobile No</label>
              <input type="text" name="mobile_no" value={newUser.mobile_no} onChange={handleInputChange} required />
            </div>
            <div className="input-group">
              <label>User Type</label>
              <select name="user_type" value={newUser.user_type} onChange={handleInputChange}>
                <option value="staff">Staff</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Admin</option>
                <option value="student">Student</option>
              </select>
            </div>
            {newUser.user_type === 'student' && (
              <div className="input-group">
                <label>Student ID</label>
                <input type="text" name="student_id" value={newUser.student_id} onChange={handleInputChange} />
              </div>
            )}
            {newUser.user_type === 'faculty' && (
              <div className="input-group">
                <label>Faculty ID</label>
                <input type="text" name="faculty_id" value={newUser.faculty_id} onChange={handleInputChange} />
              </div>
            )}
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <button type="submit" className="button auth-submit-btn">Create User</button>
            </div>
          </form>
        </div>
      )}

      {users.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <div className="responsive-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.user_type}</td>
                  <td>
                    <button
                      className="button-small danger-btn"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;

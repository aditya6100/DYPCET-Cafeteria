// frontend/src/pages/admin/AdminUsersPage.js

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  // Check if user is a canteen committee coordinator
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

  useEffect(() => {
    // Only admins who are canteen coordinators can access this
    if (!isAdmin || !isCanteenCoordinator) {
      showAlert('Only canteen coordinators can access User Management.', 'error');
      navigate('/admin');
    }
  }, [isAdmin, isCanteenCoordinator, navigate, showAlert]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/users'); // Assuming /api/users endpoint for admin
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

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await apiRequest(`/users/${userId}`, 'DELETE');
        showAlert('User deleted!', 'success');
        fetchUsers(); // Refresh users after deletion
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
    <div>
      <h3>User Management</h3>
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

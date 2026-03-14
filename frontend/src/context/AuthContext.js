// frontend/src/context/AuthContext.js

import React, { createContext, useState, useEffect, useContext } from 'react';
import { getUser as getLocalUser, saveUserSession, logout as localLogout } from '../utils/auth';
import apiRequest from '../utils/api'; // Import the apiRequest utility
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getLocalUser());
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true); // Add loading state
  const navigate = useNavigate();

  useEffect(() => {
    // This effect runs on mount to ensure state is synced with localStorage
    const storedUser = getLocalUser();
    const storedToken = localStorage.getItem('token');
    if (user === null && storedUser) {
        setUser(storedUser);
    }
    if (token === null && storedToken) {
        setToken(storedToken);
    }
    setLoading(false); // Set loading to false after initial sync
  }, [user, token]);

  useEffect(() => {
    // Refresh user profile (mobile_no, etc.) when a token exists.
    // This prevents stale sessions from missing fields required for ordering.
    if (!token) return;

    let cancelled = false;
    const refreshProfile = async () => {
      try {
        const fullUser = await apiRequest('/users/profile');
        if (cancelled) return;
        updateUser(fullUser);
      } catch (_error) {
        // Ignore: keep local session and allow retry later.
      }
    };

    refreshProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Login function now performs API call
  const login = async (identifier, password) => {
    setLoading(true);
    try {
      const responseData = await apiRequest('/auth/login', 'POST', { identifier, password });
      saveUserSession(responseData);
      setUser(getLocalUser());
      setToken(localStorage.getItem('token'));
      setLoading(false);
      return responseData;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  // Register function performs API call
  const register = async (
    name,
    email,
    password,
    mobile_no = null,
    user_type = 'student',
    student_id = null,
    faculty_id = null,
    address = null
  ) => {
    setLoading(true);
    try {
      const responseData = await apiRequest('/auth/register', 'POST', {
        name,
        email,
        password,
        mobile_no,
        user_type,
        student_id,
        faculty_id,
        address
      });
      setLoading(false);
      return responseData;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const updateUser = (updatedUser) => {
    if (!updatedUser) return;
    const current = getLocalUser() || {};
    const normalized = {
      _id: updatedUser._id ?? updatedUser.id ?? current._id,
      name: updatedUser.name ?? current.name,
      email: updatedUser.email ?? current.email,
      user_type: updatedUser.user_type ?? current.user_type,
      mobile_no: updatedUser.mobile_no ?? current.mobile_no,
      address: updatedUser.address ?? current.address,
      student_id: updatedUser.student_id ?? current.student_id,
    };
    localStorage.setItem('user', JSON.stringify(normalized));
    setUser(normalized);
  };

  const changePassword = async (currentPassword, newPassword) => {
    setLoading(true);
    try {
      await apiRequest('/auth/change-password', 'PUT', { currentPassword, newPassword });
      setLoading(false);
    } catch (error) {
      setLoading(true);
      throw error;
    }
  };

  const logout = () => {
    localLogout();
    setUser(null);
    setToken(null);
    navigate('/login');
  };

  const isLoggedIn = !!user && !!token;
  const isAdmin = user && (user.user_type === 'admin' || user.user_type === 'staff');
  const isFaculty = user && user.user_type === 'faculty';
  const isMember = user && user.user_type === 'member';

  return (
    <AuthContext.Provider value={{ user, token, isLoggedIn, isAdmin, isFaculty, isMember, login, register, updateUser, changePassword, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

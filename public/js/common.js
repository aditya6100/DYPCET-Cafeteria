// Final common.js
// This file contains helper functions used by both main.js and admin.js

// --- User Session Management ---
function saveUserSession(userData) {
    if (!userData || !userData.token) {
        console.error("Save Error: Invalid user data or token provided.");
        return;
    }
    localStorage.setItem('token', userData.token);
    const user = {
        _id: userData._id,
        name: userData.name,
        email: userData.email,
        user_type: userData.user_type
    };
    localStorage.setItem('user', JSON.stringify(user));
}

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch (error) {
        console.error("Could not parse user data from localStorage:", error);
        return null;
    }
}

function isLoggedIn() {
    return !!getToken();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('cart'); // Also clear cart on logout
    window.location.href = '/login.html';
}

// --- API Request Function ---
async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = { method, headers };
    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`/api${endpoint}`, config);
        const responseData = response.status === 204 ? null : await response.json();

        if (!response.ok) {
            const message = responseData?.message || `HTTP Error: ${response.status}`;
            throw new Error(message);
        }
        return responseData;
    } catch (error) {
        console.error(`API Request to ${endpoint} failed:`, error.message);
        throw error;
    }
}

// --- UI Helpers ---
function showAlert(message, type = 'info') {
    const alertBox = document.createElement('div');
    alertBox.className = `custom-alert alert-${type}`;
    alertBox.textContent = message;
    document.body.appendChild(alertBox);
    setTimeout(() => { alertBox.classList.add('visible'); }, 10);
    setTimeout(() => {
        alertBox.classList.remove('visible');
        setTimeout(() => { alertBox.remove(); }, 500);
    }, 4000);
}

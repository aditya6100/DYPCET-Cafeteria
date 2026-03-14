// frontend/src/utils/auth.js

// Directly interact with localStorage for token and user data
// These functions are helpers for hooks/contexts that will manage React state

export function saveUserSession(userData) {
    if (!userData || !userData.token) {
        console.error("Save Error: Invalid user data or token provided.");
        return;
    }
    localStorage.setItem('token', userData.token);
    const user = {
        _id: userData._id,
        name: userData.name,
        email: userData.email,
        user_type: userData.user_type,
        mobile_no: userData.mobile_no ?? null,
        address: userData.address ?? null,
        student_id: userData.student_id ?? null,
        faculty_id: userData.faculty_id ?? null,
    };
    localStorage.setItem('user', JSON.stringify(user));
}

export function getToken() {
    return localStorage.getItem('token');
}

export function getUser() {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch (error) {
        console.error("Could not parse user data from localStorage:", error);
        return null;
    }
}

export function isLoggedIn() {
    return !!getToken();
}

export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('cart'); // Clear cart on logout
}

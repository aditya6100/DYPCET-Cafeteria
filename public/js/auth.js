// auth.js - Handles login and registration forms
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('login-form')) {
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = e.target.email.value;
            const password = e.target.password.value;
            try {
                const userData = await apiRequest('/auth/login', 'POST', { email, password });
                saveUserSession(userData);
                window.location.href = (userData.user_type === 'admin' || userData.user_type === 'staff') ? '/admin/dashboard.html' : '/index.html';
            } catch (error) {
                showAlert(`Login failed: ${error.message}`, 'error');
            }
        });
    }

    if (document.getElementById('register-form')) {
        const registerForm = document.getElementById('register-form');
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                name: e.target.name.value,
                email: e.target.email.value,
                password: e.target.password.value,
                mobile_no: e.target.mobile_no.value,
                user_type: e.target.user_type.value,
            };
            try {
                await apiRequest('/auth/register', 'POST', formData);
                showAlert('Registration successful! Please log in.', 'success');
                setTimeout(() => { window.location.href = '/login.html'; }, 1500);
            } catch (error) {
                showAlert(`Registration failed: ${error.message}`, 'error');
            }
        });
    }
});

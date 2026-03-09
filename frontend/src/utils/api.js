// frontend/src/utils/api.js

import { getToken, logout } from './auth'; // Assuming auth utility will exist soon

const API_BASE_URL = '/api'; // All backend API calls are prefixed with /api

async function apiRequest(endpoint, method = 'GET', body = null, customHeaders = {}) {
    const headers = {
        ...customHeaders,
    };

    // Add authorization token if available
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let config = { method, headers }; // Declare config here

    if (body instanceof FormData) {
        // If it's FormData, let the browser set the Content-Type header (including boundary)
        // and send the body directly.
        // Do NOT set 'Content-Type': 'application/json' or JSON.stringify it.
        config.body = body; // Assign body directly
    } else {
        headers['Content-Type'] = 'application/json';
        if (body) {
            config.body = JSON.stringify(body); // Use config here
        }
    }


    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        // Handle specific HTTP status codes
        if (response.status === 401) { // Unauthorized
            console.warn('API Request: Unauthorized - logging out user.');
            logout(); // Log out user if token is invalid or expired
            throw new Error('Unauthorized: Please log in again.');
        }

        let responseData = null;
        if (response.status !== 204) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                const text = await response.text();
                responseData = text ? { message: text } : null;
            }
        }

        if (!response.ok) {
            const message = responseData?.message || `HTTP Error: ${response.status} for ${endpoint}`;
            const error = new Error(message);
            error.statusCode = response.status;
            error.responseData = responseData;
            throw error;
        }
        return responseData;
    } catch (error) {
        console.error(`API Request to ${API_BASE_URL}${endpoint} failed:`, error);
        throw error; // Re-throw to be handled by the calling component/hook
    }
}

export default apiRequest;

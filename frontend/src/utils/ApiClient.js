import axios from 'axios';
import { UTUBE_TOKEN, UTUBE_USER } from './authConstants';
import { jwtDecode } from 'jwt-decode';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const ApiClient = axios.create({
    baseURL: `${API_BASE}/v1`,
    headers: {
        'Content-Type': 'application/json',
    },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Request interceptor for tokens
ApiClient.interceptors.request.use(
    async (config) => {
        let token = localStorage.getItem(UTUBE_TOKEN);

        if (token) {
            try {
                const decoded = jwtDecode(token);
                const currentTime = Date.now() / 1000;
                // Auto-refresh token if it expires in less than 5 minutes
                if (decoded.exp && (decoded.exp - currentTime) < 300) {
                    if (!isRefreshing) {
                        isRefreshing = true;
                        try {
                            const response = await axios.post(`${API_BASE}/v1/auth/refresh`, {}, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            const newToken = response.data.access_token;
                            localStorage.setItem(UTUBE_TOKEN, newToken);
                            ApiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
                            token = newToken;
                            processQueue(null, newToken);
                        } catch (err) {
                            processQueue(err, null);
                            console.warn('Session expired. Please log in again.');
                            localStorage.removeItem(UTUBE_TOKEN);
                            localStorage.removeItem(UTUBE_USER);
                            window.location.href = '/login';
                        } finally {
                            isRefreshing = false;
                        }
                    } else {
                        // Queue requests while refreshing
                        return new Promise(function (resolve, reject) {
                            failedQueue.push({ resolve, reject });
                        }).then(newToken => {
                            config.headers.Authorization = `Bearer ${newToken}`;
                            return config;
                        }).catch(err => {
                            return Promise.reject(err);
                        });
                    }
                }
            } catch (e) {
                console.warn('Invalid token metadata detected - skipping proactive refresh.', e);
            }
            config.headers.Authorization = `Bearer ${token}`;
        }

        // CRITICAL: If the request body is FormData, delete the default
        // 'application/json' Content-Type so the browser auto-sets
        // 'multipart/form-data' with the correct boundary.
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for handling 401s and 429s
ApiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // If 401 and not already a retry for refresh endpoint
        if (status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
            originalRequest._retry = true;
            console.warn('401 Intercepted. Token expired completely or hijacked.');

            // As a final safety net, try refreshing it via the explicit API call if available
            // If it fails, boot them
            localStorage.removeItem(UTUBE_TOKEN);
            localStorage.removeItem(UTUBE_USER);
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        if (status === 429) {
            // Brute-force protection: Notify the user of rate limiting
            alert('Too many attempts. Please wait a moment before trying again.');
        }

        return Promise.reject(error);
    }
);

export default ApiClient;


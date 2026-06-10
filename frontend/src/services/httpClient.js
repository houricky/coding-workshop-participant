import axios from 'axios';

const TOKEN_KEY = 'acme.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT to every request.
http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear the session and bounce to login.
http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      tokenStore.clear();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default http;

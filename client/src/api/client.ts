import axios, { AxiosError, type AxiosInstance } from 'axios';

export const TOKEN_KEY = 'kaaboo_token';
export const USER_KEY = 'kaaboo_user';

const baseURL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

type LogoutHandler = () => void;
let logoutHandler: LogoutHandler | null = null;

export function registerLogoutHandler(fn: LogoutHandler) {
  logoutHandler = fn;
}

apiClient.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: string }>) => {
    if (err.response?.status === 401 && logoutHandler) {
      logoutHandler();
    }
    const message = err.response?.data?.error ?? err.message ?? 'Request failed';
    return Promise.reject(new Error(message));
  },
);

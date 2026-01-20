/**
 * API Service - Axios instance with auth interceptor
 * Handles all HTTP requests with automatic token management
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';

// API base URL from environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Token storage keys
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

// Flag to prevent multiple refresh requests
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Process queued requests after token refresh
 */
function processQueue(error: Error | null, token: string | null = null): void {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
}

/**
 * Gets the access token from localStorage
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Gets the refresh token from localStorage
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Stores tokens in localStorage
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * Clears tokens from localStorage
 */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Redirects to login page
 */
function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * Create Axios instance with default configuration
 */
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor - Add auth token to requests
 */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handle 401 errors and token refresh
 */
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Return data directly from successful response
    // Backend wraps data in { success: true, data: ..., meta: ... }
    if (response.data?.success === true && response.data?.data !== undefined) {
      // For paginated responses, include meta alongside data
      if (response.data.meta) {
        return {
          data: response.data.data,
          meta: response.data.meta,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      // For non-paginated responses, return data directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { data: response.data.data } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Check if we're already refreshing
      if (isRefreshing) {
        // Queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject: (err: Error) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        isRefreshing = false;
        clearTokens();
        redirectToLogin();
        return Promise.reject(createApiError('Oturum suresi doldu', 401, 'SESSION_EXPIRED'));
      }

      try {
        // Call refresh endpoint directly (not through intercepted instance)
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;

        setTokens(accessToken, newRefreshToken || refreshToken);

        // Process queued requests
        processQueue(null, accessToken);

        // Retry original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(new Error('Oturum yenilenemedi'), null);
        clearTokens();
        redirectToLogin();
        return Promise.reject(createApiError('Oturum suresi doldu', 401, 'SESSION_EXPIRED'));
      } finally {
        isRefreshing = false;
      }
    }

    // Handle other errors
    return Promise.reject(handleApiError(error));
  }
);

/**
 * API Error interface
 */
export interface ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string[]>;
}

/**
 * Creates a typed API error
 */
export function createApiError(
  message: string,
  status: number,
  code?: string,
  details?: Record<string, string[]>
): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Handles Axios errors and converts to ApiError
 */
function handleApiError(error: AxiosError): ApiError {
  if (error.response) {
    // Server responded with error status
    const data = error.response.data as {
      error?: {
        message?: string;
        code?: string;
        details?: Record<string, string[]>;
      };
      message?: string;
    };

    const message = data?.error?.message || data?.message || 'Bir hata olustu';
    const code = data?.error?.code;
    const details = data?.error?.details;

    return createApiError(message, error.response.status, code, details);
  }

  if (error.request) {
    // Request made but no response received
    return createApiError(
      'Sunucuya ulasilamadi. Lutfen internet baglantinizi kontrol edin.',
      0,
      'NETWORK_ERROR'
    );
  }

  // Error in request configuration
  return createApiError(error.message || 'Istek yapilamadi', 0, 'REQUEST_ERROR');
}

/**
 * Typed API methods for convenience
 */
export const apiClient = {
  /**
   * GET request
   */
  get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return api.get(endpoint, { params }) as Promise<T>;
  },

  /**
   * POST request
   */
  post<T>(endpoint: string, data?: unknown): Promise<T> {
    return api.post(endpoint, data) as Promise<T>;
  },

  /**
   * PUT request
   */
  put<T>(endpoint: string, data?: unknown): Promise<T> {
    return api.put(endpoint, data) as Promise<T>;
  },

  /**
   * PATCH request
   */
  patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return api.patch(endpoint, data) as Promise<T>;
  },

  /**
   * DELETE request
   */
  delete<T>(endpoint: string): Promise<T> {
    return api.delete(endpoint) as Promise<T>;
  },
};

// Export the raw axios instance for advanced usage
export { api };

// Default export for convenience
export default apiClient;

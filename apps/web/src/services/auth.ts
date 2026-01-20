/**
 * Auth Service - Authentication functions
 * Handles login, logout, refresh, and user management
 */

import apiClient, { setTokens, clearTokens, getRefreshToken } from './api';
import type { AuthResponse, LoginCredentials, User } from '@/types';

/**
 * Login with email and password
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await apiClient.post('/auth/login', credentials);

  // API interceptor wraps response as { data: { user, tokens } }
  const authData = response.data || response;

  // Store tokens
  setTokens(authData.tokens.accessToken, authData.tokens.refreshToken);

  // Store user info
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(authData.user));
  }

  return authData;
}

/**
 * Logout - clears tokens and user data
 */
export async function logout(): Promise<void> {
  try {
    // Optionally notify server of logout
    await apiClient.post('/auth/logout');
  } catch {
    // Ignore errors during logout
  } finally {
    clearTokens();
  }
}

/**
 * Refresh access token
 */
export async function refreshToken(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const currentRefreshToken = getRefreshToken();

  if (!currentRefreshToken) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await apiClient.post(
      '/auth/refresh',
      { refreshToken: currentRefreshToken }
    );

    // API interceptor wraps response as { data: { accessToken, refreshToken } }
    const tokenData = response.data || response;

    setTokens(tokenData.accessToken, tokenData.refreshToken);
    return tokenData;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;

  const userJson = localStorage.getItem('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson) as User;
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;

  const accessToken = localStorage.getItem('accessToken');
  const user = getCurrentUser();

  return !!(accessToken && user);
}

/**
 * Get current user from API (validates token)
 * Turkish: Mevcut kullaniciyi API'den al
 */
export async function fetchCurrentUser(): Promise<User> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await apiClient.get('/auth/me');

  // API interceptor wraps response as { data: user }
  const user = response.data || response;

  // Update stored user
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }

  return user;
}

/**
 * Change password
 * Turkish: Sifre degistir
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
  });
}

/**
 * Request password reset
 * Turkish: Sifre sifirlama talebi
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email });
}

/**
 * Reset password with token
 * Turkish: Token ile sifre sifirla
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', {
    token,
    newPassword,
  });
}

/**
 * Update user profile
 * Turkish: Kullanici profilini guncelle
 */
export async function updateProfile(data: Partial<Pick<User, 'name' | 'phone' | 'avatar'>>): Promise<User> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await apiClient.patch('/auth/profile', data);

  // API interceptor wraps response as { data: user }
  const user = response.data || response;

  // Update stored user
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }

  return user;
}

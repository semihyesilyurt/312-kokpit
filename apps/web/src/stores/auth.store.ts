/**
 * Auth Store - Zustand store for authentication state
 * Manages user session and authentication status
 * Turkish: Kimlik dogrulama durumu icin Zustand store
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, LoginCredentials } from '@/types';
import * as authService from '@/services/auth';
import { getAccessToken, clearTokens } from '@/services/api';

interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,

      // Initialize auth state on app start
      initialize: async () => {
        const state = get();
        if (state.isInitialized) return;

        set({ isLoading: true });

        try {
          const token = getAccessToken();
          if (token) {
            const user = await authService.fetchCurrentUser();
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
              error: null,
            });
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              error: null,
            });
          }
        } catch {
          clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            error: null,
          });
        }
      },

      // Login action
      // Turkish: Giris yap
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authService.login(credentials);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Giris yapilamadi';
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: message,
          });
          throw err;
        }
      },

      // Logout action
      // Turkish: Cikis yap
      logout: async () => {
        set({ isLoading: true });

        try {
          await authService.logout();
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      // Set user
      // Turkish: Kullaniciyi ayarla
      setUser: (user: User | null) => {
        set({
          user,
          isAuthenticated: !!user,
        });
      },

      // Set tokens (for external token management)
      // Turkish: Tokenlari ayarla
      setToken: (accessToken: string, refreshToken: string) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
        }
      },

      // Set loading state
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      // Set error
      setError: (error: string | null) => {
        set({ error });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Check authentication status
      // Turkish: Kimlik dogrulama durumunu kontrol et
      checkAuth: async () => {
        const state = get();

        // If already authenticated, validate with server
        if (state.isAuthenticated && state.user) {
          try {
            const user = await authService.fetchCurrentUser();
            set({ user, isAuthenticated: true });
            return true;
          } catch {
            set({ user: null, isAuthenticated: false });
            return false;
          }
        }

        // Check localStorage for existing session
        const storedUser = authService.getCurrentUser();
        if (storedUser && authService.isAuthenticated()) {
          try {
            const user = await authService.fetchCurrentUser();
            set({ user, isAuthenticated: true });
            return true;
          } catch {
            set({ user: null, isAuthenticated: false });
            return false;
          }
        }

        return false;
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => {
        // Return a no-op storage for SSR
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selector hooks for performance optimization
// Turkish: Performans optimizasyonu icin sektor hook'lari
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useAuthInitialized = () => useAuthStore((state) => state.isInitialized);

// Action hooks
export const useAuthActions = () =>
  useAuthStore((state) => ({
    login: state.login,
    logout: state.logout,
    setUser: state.setUser,
    setToken: state.setToken,
    clearError: state.clearError,
    checkAuth: state.checkAuth,
    initialize: state.initialize,
  }));

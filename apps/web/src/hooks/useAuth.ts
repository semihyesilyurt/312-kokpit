/**
 * useAuth Hook - Authentication state hook with Zustand
 * Provides authentication functionality and state
 * Turkish: Zustand ile kimlik dogrulama durumu hook'u
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  useAuthStore,
  useUser,
  useIsAuthenticated,
  useAuthLoading,
  useAuthError,
  useAuthInitialized,
} from '@/stores/auth.store';
import type { LoginCredentials, User } from '@/types';

interface UseAuthOptions {
  /**
   * Redirect to login if not authenticated
   * Turkish: Kimlik dogrulanmamissa girise yonlendir
   */
  requireAuth?: boolean;
  /**
   * Redirect to dashboard if already authenticated
   * Turkish: Zaten kimlik dogrulanmissa dashboard'a yonlendir
   */
  redirectIfAuthenticated?: boolean;
  /**
   * URL to redirect after login
   * Turkish: Giristen sonra yonlendirilecek URL
   */
  redirectTo?: string;
  /**
   * Custom login redirect URL
   * Turkish: Ozel giris yonlendirme URL'i
   */
  loginUrl?: string;
}

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    requireAuth = false,
    redirectIfAuthenticated = false,
    redirectTo = '/dashboard',
    loginUrl = '/login',
  } = options;

  const router = useRouter();
  const pathname = usePathname();

  const user = useUser();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const isInitialized = useAuthInitialized();
  const error = useAuthError();

  const {
    login: storeLogin,
    logout: storeLogout,
    clearError,
    initialize,
  } = useAuthStore();

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Handle auth redirects after initialization
  useEffect(() => {
    if (!isInitialized || isLoading) return;

    if (requireAuth && !isAuthenticated) {
      // Save intended destination
      const returnUrl = pathname !== loginUrl ? `?returnUrl=${encodeURIComponent(pathname)}` : '';
      router.replace(`${loginUrl}${returnUrl}`);
    }

    if (redirectIfAuthenticated && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [
    isAuthenticated,
    isLoading,
    isInitialized,
    requireAuth,
    redirectIfAuthenticated,
    redirectTo,
    loginUrl,
    pathname,
    router,
  ]);

  // Login wrapper with redirect
  const login = useCallback(
    async (credentials: LoginCredentials) => {
      await storeLogin(credentials);

      // Check for return URL in query params
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const returnUrl = params.get('returnUrl');
        router.replace(returnUrl || redirectTo);
      } else {
        router.replace(redirectTo);
      }
    },
    [storeLogin, router, redirectTo]
  );

  // Logout wrapper with redirect
  const logout = useCallback(async () => {
    await storeLogout();
    router.replace(loginUrl);
  }, [storeLogout, router, loginUrl]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    login,
    logout,
    clearError,
  };
}

/**
 * Hook for protected pages - redirects to login if not authenticated
 * Turkish: Korunmus sayfalar icin hook - kimlik dogrulanmamissa girise yonlendirir
 */
export function useRequireAuth(redirectTo = '/dashboard'): UseAuthReturn {
  return useAuth({ requireAuth: true, redirectTo });
}

/**
 * Hook for guest pages (login, register) - redirects to dashboard if already authenticated
 * Turkish: Misafir sayfalari icin hook - zaten kimlik dogrulanmissa dashboard'a yonlendirir
 */
export function useGuestOnly(redirectTo = '/dashboard'): UseAuthReturn {
  return useAuth({ redirectIfAuthenticated: true, redirectTo });
}

/**
 * Hook to get just the current user without redirect logic
 * Turkish: Yonlendirme mantigi olmadan sadece mevcut kullaniciyi almak icin hook
 */
export function useCurrentUser(): User | null {
  return useUser();
}

/**
 * Hook to check if user has specific role
 * Turkish: Kullanicinin belirli bir role sahip olup olmadigini kontrol etmek icin hook
 */
export function useHasRole(roles: string | string[]): boolean {
  const user = useUser();
  if (!user) return false;

  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return allowedRoles.includes(user.role);
}

/**
 * Hook for role-based access control
 * Turkish: Rol tabanli erisim kontrolu icin hook
 */
export function useRoleGuard(
  allowedRoles: string[],
  fallbackUrl = '/dashboard'
): { hasAccess: boolean; isChecking: boolean } {
  const user = useUser();
  const isInitialized = useAuthInitialized();
  const router = useRouter();

  const hasAccess = user ? allowedRoles.includes(user.role) : false;
  const isChecking = !isInitialized;

  useEffect(() => {
    if (isInitialized && user && !hasAccess) {
      router.replace(fallbackUrl);
    }
  }, [isInitialized, user, hasAccess, fallbackUrl, router]);

  return { hasAccess, isChecking };
}

export default useAuth;

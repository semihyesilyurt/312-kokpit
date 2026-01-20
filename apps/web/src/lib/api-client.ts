/**
 * TanStack Query API Client Wrapper
 * Provides typed query hooks for data fetching with caching and revalidation
 */

'use client';

import {
  QueryClient,
  UseQueryOptions,
  UseMutationOptions,
  useQuery,
  useMutation,
  useQueryClient,
  QueryKey,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  InfiniteData,
} from '@tanstack/react-query';
import apiClient, { ApiError } from '@/services/api';
import type {
  Order,
  OrdersResponse,
  OrderFilters,
  StockItem,
  StockResponse,
  StockFilters,
  Courier,
  DashboardResponse,
  User,
  PaginatedResponse,
} from '@/types';

// ============================================
// Query Client Configuration
// ============================================

/**
 * Create a new QueryClient with default options
 * Turkish: Varsayilan ayarlarla yeni QueryClient olustur
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep cached data for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Retry 3 times on failure
        retry: 3,
        // Don't retry on 401/403
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Refetch on window focus
        refetchOnWindowFocus: true,
        // Don't refetch on reconnect by default
        refetchOnReconnect: true,
      },
      mutations: {
        // Retry once on mutation failure
        retry: 1,
      },
    },
  });
}

// Singleton query client for use outside of React
let queryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = createQueryClient();
  }
  return queryClient;
}

// ============================================
// Query Keys Factory
// ============================================

/**
 * Centralized query keys for consistent caching
 * Turkish: Tutarli onbellekleme icin merkezi sorgu anahtarlari
 */
export const queryKeys = {
  // Auth
  auth: {
    all: ['auth'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
  },

  // Orders
  orders: {
    all: ['orders'] as const,
    lists: () => [...queryKeys.orders.all, 'list'] as const,
    list: (filters: OrderFilters) => [...queryKeys.orders.lists(), filters] as const,
    details: () => [...queryKeys.orders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.orders.details(), id] as const,
    stats: () => [...queryKeys.orders.all, 'stats'] as const,
  },

  // Stock
  stock: {
    all: ['stock'] as const,
    lists: () => [...queryKeys.stock.all, 'list'] as const,
    list: (filters: StockFilters) => [...queryKeys.stock.lists(), filters] as const,
    details: () => [...queryKeys.stock.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.stock.details(), id] as const,
    critical: () => [...queryKeys.stock.all, 'critical'] as const,
    movements: (itemId: string) => [...queryKeys.stock.all, 'movements', itemId] as const,
  },

  // Couriers
  couriers: {
    all: ['couriers'] as const,
    lists: () => [...queryKeys.couriers.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.couriers.lists(), filters] as const,
    details: () => [...queryKeys.couriers.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.couriers.details(), id] as const,
    active: () => [...queryKeys.couriers.all, 'active'] as const,
    locations: () => [...queryKeys.couriers.all, 'locations'] as const,
  },

  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => [...queryKeys.dashboard.all, 'stats'] as const,
    full: () => [...queryKeys.dashboard.all, 'full'] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    unread: () => [...queryKeys.notifications.all, 'unread'] as const,
  },
} as const;

// ============================================
// Generic Query Hooks
// ============================================

/**
 * Generic query hook factory
 */
export function useApiQuery<TData>(
  queryKey: QueryKey,
  endpoint: string,
  options?: Omit<UseQueryOptions<TData, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<TData, ApiError>({
    queryKey,
    queryFn: () => apiClient.get<TData>(endpoint),
    ...options,
  });
}

/**
 * Generic mutation hook factory
 */
export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, ApiError, TVariables>, 'mutationFn'>
) {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    ...options,
  });
}

// ============================================
// Dashboard Hooks
// ============================================

/**
 * Fetch full dashboard data
 * Turkish: Tum dashboard verilerini getir
 */
export function useDashboard(
  options?: Omit<UseQueryOptions<DashboardResponse, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<DashboardResponse, ApiError>({
    queryKey: queryKeys.dashboard.full(),
    queryFn: () => apiClient.get<DashboardResponse>('/dashboard'),
    // Dashboard should refresh frequently
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Every minute
    ...options,
  });
}

// ============================================
// Orders Hooks
// ============================================

/**
 * Fetch orders with filters
 * Turkish: Filtrelerle siparisleri getir
 */
export function useOrders(
  filters: OrderFilters = {},
  options?: Omit<UseQueryOptions<OrdersResponse, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<OrdersResponse, ApiError>({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => apiClient.get<OrdersResponse>('/orders', filters as Record<string, unknown>),
    staleTime: 30 * 1000,
    ...options,
  });
}

/**
 * Fetch single order by ID
 * Turkish: ID ile tek siparis getir
 */
export function useOrder(
  orderId: string,
  options?: Omit<UseQueryOptions<Order, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Order, ApiError>({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn: () => apiClient.get<Order>(`/orders/${orderId}`),
    enabled: !!orderId,
    ...options,
  });
}

/**
 * Infinite scroll orders
 * Turkish: Sonsuz kaydirmali siparis listesi
 */
export function useInfiniteOrders(
  filters: Omit<OrderFilters, 'page'> = {}
) {
  return useInfiniteQuery({
    queryKey: queryKeys.orders.list({ ...filters, page: 'infinite' as unknown as number }),
    queryFn: async ({ pageParam }) => {
      return apiClient.get<OrdersResponse>('/orders', { ...filters, page: pageParam } as Record<string, unknown>);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: OrdersResponse) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
  });
}

/**
 * Update order status mutation
 * Turkish: Siparis durumu guncelleme mutasyonu
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation<Order, ApiError, { orderId: string; status: string }>({
    mutationFn: ({ orderId, status }) =>
      apiClient.patch<Order>(`/orders/${orderId}/status`, { status }),
    onSuccess: (data, { orderId }) => {
      // Update single order cache
      queryClient.setQueryData(queryKeys.orders.detail(orderId), data);
      // Invalidate orders list
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

/**
 * Assign courier to order
 * Turkish: Siparise kurye ata
 */
export function useAssignCourier() {
  const queryClient = useQueryClient();

  return useMutation<Order, ApiError, { orderId: string; courierId: string }>({
    mutationFn: ({ orderId, courierId }) =>
      apiClient.patch<Order>(`/orders/${orderId}/assign`, { courierId }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(queryKeys.orders.detail(orderId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.couriers.all });
    },
  });
}

// ============================================
// Stock Hooks
// ============================================

/**
 * Fetch stock items with filters
 * Turkish: Filtrelerle stok ogelerini getir
 */
export function useStock(
  filters: StockFilters = {},
  options?: Omit<UseQueryOptions<StockResponse, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<StockResponse, ApiError>({
    queryKey: queryKeys.stock.list(filters),
    queryFn: () => apiClient.get<StockResponse>('/stock', filters as Record<string, unknown>),
    ...options,
  });
}

/**
 * Fetch single stock item
 * Turkish: Tek stok ogesi getir
 */
export function useStockItem(
  itemId: string,
  options?: Omit<UseQueryOptions<StockItem, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<StockItem, ApiError>({
    queryKey: queryKeys.stock.detail(itemId),
    queryFn: () => apiClient.get<StockItem>(`/stock/${itemId}`),
    enabled: !!itemId,
    ...options,
  });
}

/**
 * Fetch critical stock items
 * Turkish: Kritik stok ogelerini getir
 */
export function useCriticalStock(
  options?: Omit<UseQueryOptions<StockItem[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<StockItem[], ApiError>({
    queryKey: queryKeys.stock.critical(),
    queryFn: () => apiClient.get<StockItem[]>('/stock/critical'),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Update stock quantity
 * Turkish: Stok miktarini guncelle
 */
export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation<
    StockItem,
    ApiError,
    { itemId: string; quantity: number; type: 'in' | 'out' | 'adjustment'; reason?: string }
  >({
    mutationFn: ({ itemId, ...data }) =>
      apiClient.post<StockItem>(`/stock/${itemId}/movement`, data),
    onSuccess: (data, { itemId }) => {
      queryClient.setQueryData(queryKeys.stock.detail(itemId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.stock.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.stock.critical() });
    },
  });
}

// ============================================
// Courier Hooks
// ============================================

/**
 * Fetch all couriers
 * Turkish: Tum kuryeleri getir
 */
export function useCouriers(
  filters?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<Courier[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Courier[], ApiError>({
    queryKey: queryKeys.couriers.list(filters),
    queryFn: () => apiClient.get<Courier[]>('/delivery/couriers', filters),
    ...options,
  });
}

/**
 * Fetch single courier
 * Turkish: Tek kurye getir
 */
export function useCourier(
  courierId: string,
  options?: Omit<UseQueryOptions<Courier, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Courier, ApiError>({
    queryKey: queryKeys.couriers.detail(courierId),
    queryFn: () => apiClient.get<Courier>(`/couriers/${courierId}`),
    enabled: !!courierId,
    ...options,
  });
}

/**
 * Fetch active couriers
 * Turkish: Aktif kuryeleri getir
 */
export function useActiveCouriers(
  options?: Omit<UseQueryOptions<Courier[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Courier[], ApiError>({
    queryKey: queryKeys.couriers.active(),
    queryFn: () => apiClient.get<Courier[]>('/couriers/active'),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Update courier status
 * Turkish: Kurye durumunu guncelle
 */
export function useUpdateCourierStatus() {
  const queryClient = useQueryClient();

  return useMutation<Courier, ApiError, { courierId: string; status: string }>({
    mutationFn: ({ courierId, status }) =>
      apiClient.patch<Courier>(`/couriers/${courierId}/status`, { status }),
    onSuccess: (data, { courierId }) => {
      queryClient.setQueryData(queryKeys.couriers.detail(courierId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.couriers.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.couriers.active() });
    },
  });
}

// ============================================
// Auth Hooks
// ============================================

/**
 * Fetch current user
 * Turkish: Mevcut kullaniciyi getir
 */
export function useCurrentUser(
  options?: Omit<UseQueryOptions<User, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<User, ApiError>({
    queryKey: queryKeys.auth.me(),
    queryFn: () => apiClient.get<User>('/auth/me'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry auth failures
    ...options,
  });
}

// ============================================
// Cache Utilities
// ============================================

/**
 * Invalidate all order queries
 * Turkish: Tum siparis sorgularini gecersiz kil
 */
export function invalidateOrders(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
}

/**
 * Invalidate all stock queries
 * Turkish: Tum stok sorgularini gecersiz kil
 */
export function invalidateStock(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.stock.all });
}

/**
 * Invalidate all courier queries
 * Turkish: Tum kurye sorgularini gecersiz kil
 */
export function invalidateCouriers(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.couriers.all });
}

/**
 * Prefetch orders for a specific filter
 * Turkish: Belirli bir filtre icin siparisleri onceden yukle
 */
export async function prefetchOrders(
  queryClient: QueryClient,
  filters: OrderFilters = {}
): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => apiClient.get<OrdersResponse>('/orders', filters as Record<string, unknown>),
  });
}

/**
 * Optimistically update order in cache
 * Turkish: Siparisi onbellekte iyimser olarak guncelle
 */
export function optimisticUpdateOrder(
  queryClient: QueryClient,
  orderId: string,
  updates: Partial<Order>
): () => void {
  // Get current order data
  const previousOrder = queryClient.getQueryData<Order>(queryKeys.orders.detail(orderId));

  // Optimistically update
  if (previousOrder) {
    queryClient.setQueryData(queryKeys.orders.detail(orderId), {
      ...previousOrder,
      ...updates,
    });
  }

  // Return rollback function
  return () => {
    if (previousOrder) {
      queryClient.setQueryData(queryKeys.orders.detail(orderId), previousOrder);
    }
  };
}

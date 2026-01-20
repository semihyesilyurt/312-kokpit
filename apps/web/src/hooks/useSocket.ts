/**
 * useSocket Hook - WebSocket connection hook
 * Manages real-time communication with the server
 * Turkish: Sunucu ile gercek zamanli iletisimi yoneten WebSocket baglanti hook'u
 */

'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useIsAuthenticated } from '@/stores/auth.store';
import { getAccessToken } from '@/services/api';
import { queryKeys } from '@/lib/api-client';
import type {
  WebSocketEvents,
  Order,
  OrderStatus,
  CourierStatus,
  StockItem,
} from '@/types';

// Socket server URL
const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

// Event callback type
type EventCallback<T> = (data: T) => void;

// Available namespaces
type SocketNamespace = 'orders' | 'delivery' | 'notifications' | 'stock';

interface UseSocketOptions {
  /**
   * Auto-connect on mount when authenticated
   * Turkish: Kimlik dogrulandiginda otomatik baglan
   */
  autoConnect?: boolean;
  /**
   * Namespaces to subscribe to
   * Turkish: Abone olunacak namespace'ler
   */
  namespaces?: SocketNamespace[];
  /**
   * Reconnection attempts
   * Turkish: Yeniden baglanti denemeleri
   */
  reconnectionAttempts?: number;
  /**
   * Reconnection delay in ms
   * Turkish: Yeniden baglanti gecikmesi (ms)
   */
  reconnectionDelay?: number;
  /**
   * Auto-update React Query cache on socket events
   * Turkish: Socket olaylarinda React Query onbellegini otomatik guncelle
   */
  syncWithQueryCache?: boolean;
}

interface UseSocketReturn {
  /**
   * Socket instance
   */
  socket: Socket | null;
  /**
   * Connection status
   * Turkish: Baglanti durumu
   */
  isConnected: boolean;
  /**
   * Connecting status
   * Turkish: Baglaniliyor durumu
   */
  isConnecting: boolean;
  /**
   * Connection error
   * Turkish: Baglanti hatasi
   */
  error: string | null;
  /**
   * Connect to socket server
   * Turkish: Socket sunucusuna baglan
   */
  connect: () => void;
  /**
   * Disconnect from socket server
   * Turkish: Socket sunucusundan ayril
   */
  disconnect: () => void;
  /**
   * Emit an event
   * Turkish: Olay yayinla
   */
  emit: <K extends keyof WebSocketEvents>(event: K, data: WebSocketEvents[K]) => void;
  /**
   * Subscribe to new orders
   * Turkish: Yeni siparislere abone ol
   */
  onNewOrder: (callback: EventCallback<Order>) => () => void;
  /**
   * Subscribe to order updates
   * Turkish: Siparis guncellemelerine abone ol
   */
  onOrderUpdated: (callback: EventCallback<Order>) => () => void;
  /**
   * Subscribe to order status changes
   * Turkish: Siparis durumu degisikliklerine abone ol
   */
  onOrderStatus: (callback: EventCallback<{ orderId: string; status: OrderStatus }>) => () => void;
  /**
   * Subscribe to courier location updates
   * Turkish: Kurye konum guncellemelerine abone ol
   */
  onCourierLocation: (callback: EventCallback<{ courierId: string; lat: number; lng: number }>) => () => void;
  /**
   * Subscribe to courier status changes
   * Turkish: Kurye durumu degisikliklerine abone ol
   */
  onCourierStatus: (callback: EventCallback<{ courierId: string; status: CourierStatus }>) => () => void;
  /**
   * Subscribe to stock alerts
   * Turkish: Stok uyarilarina abone ol
   */
  onStockAlert: (callback: EventCallback<StockItem>) => () => void;
  /**
   * Subscribe to generic notifications
   * Turkish: Genel bildirimlere abone ol
   */
  onNotification: (callback: EventCallback<{ type: string; message: string; data?: unknown }>) => () => void;
  /**
   * Join a specific room
   * Turkish: Belirli bir odaya katil
   */
  joinRoom: (room: string) => void;
  /**
   * Leave a specific room
   * Turkish: Belirli bir odadan ayril
   */
  leaveRoom: (room: string) => void;
}

export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const {
    autoConnect = true,
    namespaces = ['orders', 'delivery', 'notifications'],
    reconnectionAttempts = 5,
    reconnectionDelay = 3000,
    syncWithQueryCache = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const isConnectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();

  // Memoize namespaces to prevent unnecessary reconnections
  const namespacesKey = namespaces.join(',');

  // Initialize socket connection
  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (socketRef.current?.connected) return;
    if (isConnectingRef.current) return;
    if (socketRef.current?.active) return; // Socket.IO is already trying to connect

    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    const accessToken = getAccessToken();

    if (!accessToken) {
      isConnectingRef.current = false;
      setIsConnecting(false);
      setError('Kimlik dogrulama token\'i bulunamadi');
      return;
    }

    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    socketRef.current = io(SOCKET_URL, {
      auth: {
        token: accessToken,
      },
      reconnectionAttempts,
      reconnectionDelay,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
      timeout: 10000, // Reduced from 20s to 10s for faster initial connection
      forceNew: false,
      upgrade: true, // Enable upgrade from polling to websocket
    });

    // Connection events
    socketRef.current.on('connect', () => {
      isConnectingRef.current = false;
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      console.log('[Socket] Baglanti kuruldu');

      // Join namespace rooms
      const nsArray = namespacesKey.split(',');
      nsArray.forEach((ns) => {
        socketRef.current?.emit('join', ns);
      });
    });

    socketRef.current.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('[Socket] Baglanti kesildi:', reason);
      // Let Socket.IO handle reconnection automatically - don't manually reconnect
    });

    socketRef.current.on('connect_error', (err) => {
      isConnectingRef.current = false;
      setIsConnecting(false);
      setError(err.message || 'Baglanti hatasi');
      console.error('[Socket] Baglanti hatasi:', err.message);
    });

    socketRef.current.on('error', (err) => {
      setError(typeof err === 'string' ? err : 'Socket hatasi');
      console.error('[Socket] Hata:', err);
    });

    // Handle reconnection
    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Yeniden baglandi, deneme:', attemptNumber);
      isConnectingRef.current = false;
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] Yeniden baglanma denemesi:', attemptNumber);
    });

    socketRef.current.on('reconnect_failed', () => {
      isConnectingRef.current = false;
      setIsConnecting(false);
      setError('Yeniden baglanti basarisiz');
      console.error('[Socket] Yeniden baglanti basarisiz');
    });

    // Set up cache sync if enabled
    if (syncWithQueryCache) {
      setupCacheSync(socketRef.current);
    }
  }, [reconnectionAttempts, reconnectionDelay, namespacesKey, syncWithQueryCache]);

  // Set up cache synchronization with React Query
  const setupCacheSync = useCallback(
    (socket: Socket) => {
      // Sync new orders
      socket.on('order:new', (order: Order) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      });

      // Sync order updates
      socket.on('order:updated', (order: Order) => {
        queryClient.setQueryData(queryKeys.orders.detail(order.id), order);
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
      });

      // Sync order status changes
      socket.on('order:status', ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
        queryClient.setQueryData(
          queryKeys.orders.detail(orderId),
          (oldData: Order | undefined) => (oldData ? { ...oldData, status } : undefined)
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      });

      // Sync courier updates
      socket.on('courier:status', () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.couriers.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      });

      // Sync stock alerts
      socket.on('stock:alert', (item: StockItem) => {
        queryClient.setQueryData(queryKeys.stock.detail(item.id), item);
        queryClient.invalidateQueries({ queryKey: queryKeys.stock.critical() });
      });
    },
    [queryClient]
  );

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnectingRef.current = false;
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, []);

  // Emit event
  const emit = useCallback(
    <K extends keyof WebSocketEvents>(event: K, data: WebSocketEvents[K]) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit(event as string, data);
      } else {
        console.warn('[Socket] Olay gonderilemedi - bagli degil');
      }
    },
    []
  );

  // Subscribe to event (returns unsubscribe function)
  const subscribe = useCallback(<T>(event: string, callback: EventCallback<T>) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, callback);
      }
    };
  }, []);

  // Join room
  const joinRoom = useCallback((room: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join', room);
    }
  }, []);

  // Leave room
  const leaveRoom = useCallback((room: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave', room);
    }
  }, []);

  // Event subscription helpers - memoized to prevent unnecessary re-renders
  const onNewOrder = useCallback(
    (callback: EventCallback<Order>) => subscribe('order:new', callback),
    [subscribe]
  );

  const onOrderUpdated = useCallback(
    (callback: EventCallback<Order>) => subscribe('order:updated', callback),
    [subscribe]
  );

  const onOrderStatus = useCallback(
    (callback: EventCallback<{ orderId: string; status: OrderStatus }>) =>
      subscribe('order:status', callback),
    [subscribe]
  );

  const onCourierLocation = useCallback(
    (callback: EventCallback<{ courierId: string; lat: number; lng: number }>) =>
      subscribe('courier:location', callback),
    [subscribe]
  );

  const onCourierStatus = useCallback(
    (callback: EventCallback<{ courierId: string; status: CourierStatus }>) =>
      subscribe('courier:status', callback),
    [subscribe]
  );

  const onStockAlert = useCallback(
    (callback: EventCallback<StockItem>) => subscribe('stock:alert', callback),
    [subscribe]
  );

  const onNotification = useCallback(
    (callback: EventCallback<{ type: string; message: string; data?: unknown }>) =>
      subscribe('notification', callback),
    [subscribe]
  );

  // Auto-connect when authenticated - only run on auth state change
  useEffect(() => {
    if (autoConnect && isAuthenticated && !socketRef.current?.connected && !isConnectingRef.current) {
      connect();
    }

    // Cleanup on unmount or when auth state changes to false
    return () => {
      if (!isAuthenticated) {
        disconnect();
      }
    };
  }, [autoConnect, isAuthenticated]); // Intentionally exclude connect/disconnect to prevent loops

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => ({
      socket: socketRef.current,
      isConnected,
      isConnecting,
      error,
      connect,
      disconnect,
      emit,
      onNewOrder,
      onOrderUpdated,
      onOrderStatus,
      onCourierLocation,
      onCourierStatus,
      onStockAlert,
      onNotification,
      joinRoom,
      leaveRoom,
    }),
    [
      isConnected,
      isConnecting,
      error,
      connect,
      disconnect,
      emit,
      onNewOrder,
      onOrderUpdated,
      onOrderStatus,
      onCourierLocation,
      onCourierStatus,
      onStockAlert,
      onNotification,
      joinRoom,
      leaveRoom,
    ]
  );
}

/**
 * Hook for order-specific socket events
 * Turkish: Siparise ozel socket olaylari icin hook
 */
export function useOrderSocket(orderId: string) {
  const { socket, onOrderUpdated, onOrderStatus, joinRoom, leaveRoom } = useSocket({
    namespaces: ['orders'],
  });

  useEffect(() => {
    if (orderId) {
      joinRoom(`order:${orderId}`);
      return () => leaveRoom(`order:${orderId}`);
    }
  }, [orderId, joinRoom, leaveRoom]);

  return { socket, onOrderUpdated, onOrderStatus };
}

/**
 * Hook for courier location tracking
 * Turkish: Kurye konum takibi icin hook
 */
export function useCourierTracking(courierId?: string) {
  const { socket, onCourierLocation, onCourierStatus, joinRoom, leaveRoom } = useSocket({
    namespaces: ['delivery'],
  });

  useEffect(() => {
    if (courierId) {
      joinRoom(`courier:${courierId}`);
      return () => leaveRoom(`courier:${courierId}`);
    }
  }, [courierId, joinRoom, leaveRoom]);

  return { socket, onCourierLocation, onCourierStatus };
}

export default useSocket;

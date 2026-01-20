'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, ChefHat, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import type { Order, OrderStatus } from '@/types';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

// Status configuration for kitchen display (lowercase for frontend)
const KITCHEN_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready'];

// Backend uses uppercase, map to lowercase for comparison
const normalizeStatus = (status: string): OrderStatus => {
  return status.toLowerCase() as OrderStatus;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  confirmed: { label: 'Onaylandi', color: 'text-blue-500', bgColor: 'bg-blue-500/10', icon: <Clock className="h-5 w-5" /> },
  preparing: { label: 'Hazirlaniyor', color: 'text-orange-500', bgColor: 'bg-orange-500/10', icon: <ChefHat className="h-5 w-5" /> },
  ready: { label: 'Hazir', color: 'text-green-500', bgColor: 'bg-green-500/10', icon: <CheckCircle className="h-5 w-5" /> },
};

// Transform backend order to frontend format
interface BackendOrder {
  id: number;
  orderNumber: string;
  platform: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNote?: string;
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: { toNumber?: () => number } | number;
    totalPrice: { toNumber?: () => number } | number;
    notes?: string;
  }>;
  subtotal: { toNumber?: () => number } | number;
  deliveryFee: { toNumber?: () => number } | number;
  discount: { toNumber?: () => number } | number;
  totalAmount: { toNumber?: () => number } | number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

const transformOrder = (order: BackendOrder): Order => {
  const toNumber = (val: { toNumber?: () => number } | number | undefined): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && 'toNumber' in val && typeof val.toNumber === 'function') {
      return val.toNumber();
    }
    return Number(val) || 0;
  };

  return {
    id: String(order.id),
    orderNumber: order.orderNumber,
    platform: order.platform.toLowerCase() as Order['platform'],
    status: normalizeStatus(order.status),
    customer: {
      name: order.customerName,
      phone: order.customerPhone,
      address: order.customerAddress,
      notes: order.customerNote,
    },
    items: order.items.map((item) => ({
      id: String(item.id),
      productId: String(item.productId),
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      totalPrice: toNumber(item.totalPrice),
      notes: item.notes,
    })),
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.deliveryFee),
    discount: toNumber(order.discount),
    total: toNumber(order.totalAmount),
    paymentMethod: order.paymentMethod.toLowerCase() as Order['paymentMethod'],
    isPaid: order.paymentStatus === 'PAID',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

// Kitchen Order Card
function KitchenOrderCard({
  order,
  onStatusChange,
  isUpdating,
  updatingOrderId,
}: {
  order: Order;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  isUpdating: boolean;
  updatingOrderId: string | null;
}) {
  const config = STATUS_CONFIG[order.status];
  const waitTime = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const isUrgent = waitTime > 15;
  const isThisOrderUpdating = isUpdating && updatingOrderId === order.id;

  return (
    <Card className={`${isUrgent ? 'ring-2 ring-destructive' : ''} transition-all`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`p-2 rounded-lg ${config.bgColor} ${config.color}`}>
              {config.icon}
            </span>
            <div>
              <span className="font-bold text-lg">#{order.orderNumber}</span>
              <p className="text-xs text-muted-foreground capitalize">{order.platform}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1 ${isUrgent ? 'text-destructive' : 'text-muted-foreground'}`}>
            {isUrgent && <AlertTriangle className="h-4 w-4" />}
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">{waitTime} dk</span>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2 mb-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg w-8 h-8 flex items-center justify-center bg-primary/10 text-primary rounded">
                  {item.quantity}
                </span>
                <span className="font-medium">{item.productName}</span>
              </div>
              {item.notes && (
                <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded">
                  {item.notes}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Customer Note */}
        {order.customer.notes && (
          <div className="mb-4 p-2 bg-warning/10 border border-warning/20 rounded text-sm">
            <strong>Not:</strong> {order.customer.notes}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {order.status === 'confirmed' && (
            <Button
              className="flex-1"
              onClick={() => onStatusChange(order.id, 'preparing')}
              disabled={isThisOrderUpdating}
            >
              {isThisOrderUpdating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ChefHat className="h-4 w-4 mr-2" />
              )}
              {isThisOrderUpdating ? 'Guncelleniyor...' : 'Hazirlamaya Basla'}
            </Button>
          )}
          {order.status === 'preparing' && (
            <Button
              className="flex-1"
              variant="success"
              onClick={() => onStatusChange(order.id, 'ready')}
              disabled={isThisOrderUpdating}
            >
              {isThisOrderUpdating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              {isThisOrderUpdating ? 'Guncelleniyor...' : 'Hazir'}
            </Button>
          )}
          {order.status === 'ready' && (
            <div className="flex-1 text-center py-2 text-success font-medium">
              Kurye Bekliyor
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function KitchenPage() {
  useRequireAuth();

  const queryClient = useQueryClient();
  const { onNewOrder, onOrderUpdated, isConnected } = useSocket();

  // Track which order is being updated
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Fetch orders from API
  const { data: orders = [], isLoading, refetch, error } = useQuery<Order[]>({
    queryKey: ['kitchen-orders'],
    queryFn: async () => {
      const response = await api.get('/orders', {
        params: {
          statuses: KITCHEN_STATUSES.join(','),
          limit: 100,
          sortBy: 'createdAt',
          sortOrder: 'asc',
        },
      });
      // API returns { data: items, meta: ... } after interceptor unwrap
      const items = response.data || [];
      return items.map((order: BackendOrder) => transformOrder(order));
    },
    refetchInterval: 30000,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      // Backend expects uppercase status
      const backendStatus = status.toUpperCase();
      return api.patch(`/orders/${orderId}/status`, { status: backendStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      setUpdatingOrderId(null);
    },
    onError: () => {
      setUpdatingOrderId(null);
    },
  });

  const handleStatusChange = useCallback((orderId: string, status: OrderStatus) => {
    setUpdatingOrderId(orderId);
    updateStatusMutation.mutate({ orderId, status });
  }, [updateStatusMutation]);

  // Real-time updates
  useEffect(() => {
    const unsubNew = onNewOrder(() => refetch());
    const unsubUpdated = onOrderUpdated(() => refetch());
    return () => {
      unsubNew();
      unsubUpdated();
    };
  }, [onNewOrder, onOrderUpdated, refetch]);

  // Group by status
  const ordersByStatus = KITCHEN_STATUSES.reduce((acc, status) => {
    acc[status] = orders.filter((o: Order) => o.status === status);
    return acc;
  }, {} as Record<string, Order[]>);

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="sticky top-0 z-[5] bg-card border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ChefHat className="h-6 w-6" />
              Mutfak Ekrani
            </h1>
            <p className="text-muted-foreground">
              {orders.length} aktif siparis {isConnected && '(Canli)'}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-destructive font-medium">Siparisler yuklenemedi</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'Bir hata olustu'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {KITCHEN_STATUSES.map((status) => (
              <div key={status} className="space-y-4">
                <div className={`p-3 rounded-lg ${STATUS_CONFIG[status].bgColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={STATUS_CONFIG[status].color}>{STATUS_CONFIG[status].icon}</span>
                      <h2 className={`font-bold ${STATUS_CONFIG[status].color}`}>{STATUS_CONFIG[status].label}</h2>
                    </div>
                  </div>
                </div>
                <div className="animate-pulse space-y-3">
                  <div className="h-32 bg-muted rounded-lg" />
                  <div className="h-32 bg-muted rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kitchen Board */}
      {!isLoading && !error && (
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KITCHEN_STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            const statusOrders = ordersByStatus[status] || [];

            return (
              <div key={status} className="space-y-4">
                {/* Column Header */}
                <div className={`p-3 rounded-lg ${config.bgColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <h2 className={`font-bold ${config.color}`}>{config.label}</h2>
                    </div>
                    <span className={`text-lg font-bold ${config.color}`}>
                      {statusOrders.length}
                    </span>
                  </div>
                </div>

                {/* Orders */}
                <div className="space-y-3">
                  {statusOrders.map((order) => (
                    <KitchenOrderCard
                      key={order.id}
                      order={order}
                      onStatusChange={handleStatusChange}
                      isUpdating={updateStatusMutation.isPending}
                      updatingOrderId={updatingOrderId}
                    />
                  ))}
                  {statusOrders.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                      Siparis yok
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

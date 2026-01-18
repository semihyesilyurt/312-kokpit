'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, ChefHat, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

// Status configuration for kitchen display
const KITCHEN_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  confirmed: { label: 'Onaylandi', color: 'text-blue-500', bgColor: 'bg-blue-500/10', icon: <Clock className="h-5 w-5" /> },
  preparing: { label: 'Hazirlaniyor', color: 'text-orange-500', bgColor: 'bg-orange-500/10', icon: <ChefHat className="h-5 w-5" /> },
  ready: { label: 'Hazir', color: 'text-green-500', bgColor: 'bg-green-500/10', icon: <CheckCircle className="h-5 w-5" /> },
};

// Mock data
const mockKitchenOrders: Order[] = [
  {
    id: '1',
    orderNumber: '128',
    platform: 'yemeksepeti',
    status: 'confirmed',
    customer: { name: 'Ahmet Y.', phone: '5321234567', address: 'Kizilay' },
    items: [
      { id: '1', productId: 'p1', productName: 'Doner Durum', quantity: 2, unitPrice: 35, totalPrice: 70 },
      { id: '2', productId: 'p2', productName: 'Ayran', quantity: 2, unitPrice: 10, totalPrice: 20 },
    ],
    subtotal: 90,
    deliveryFee: 15,
    discount: 0,
    total: 105,
    paymentMethod: 'online',
    isPaid: true,
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    orderNumber: '127',
    platform: 'getir',
    status: 'preparing',
    customer: { name: 'Mehmet D.', phone: '5329876543', address: 'Cankaya' },
    items: [
      { id: '3', productId: 'p3', productName: 'Iskender Porsiyon', quantity: 1, unitPrice: 120, totalPrice: 120 },
      { id: '4', productId: 'p4', productName: 'Mercimek Corbasi', quantity: 1, unitPrice: 25, totalPrice: 25 },
    ],
    subtotal: 145,
    deliveryFee: 20,
    discount: 0,
    total: 165,
    paymentMethod: 'cash',
    isPaid: false,
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    orderNumber: '126',
    platform: 'phone',
    status: 'ready',
    customer: { name: 'Ayse K.', phone: '5335551234', address: 'Bahcelievler' },
    items: [
      { id: '5', productId: 'p5', productName: 'Lahmacun', quantity: 4, unitPrice: 25, totalPrice: 100 },
    ],
    subtotal: 100,
    deliveryFee: 15,
    discount: 0,
    total: 115,
    paymentMethod: 'credit_card',
    isPaid: true,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Kitchen Order Card
function KitchenOrderCard({
  order,
  onStatusChange,
}: {
  order: Order;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
}) {
  const config = STATUS_CONFIG[order.status];
  const waitTime = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const isUrgent = waitTime > 15;

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
              <p className="text-xs text-muted-foreground">{order.platform}</p>
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
            >
              <ChefHat className="h-4 w-4 mr-2" />
              Hazirlamaya Basla
            </Button>
          )}
          {order.status === 'preparing' && (
            <Button
              className="flex-1"
              variant="success"
              onClick={() => onStatusChange(order.id, 'ready')}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Hazir
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

  // Fetch orders
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['kitchen-orders'],
    queryFn: async () => {
      try {
        const response = await api.get('/orders', {
          params: { statuses: KITCHEN_STATUSES.join(',') },
        });
        return response.data;
      } catch {
        return { orders: mockKitchenOrders };
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      return api.patch(`/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
  });

  const handleStatusChange = useCallback((orderId: string, status: OrderStatus) => {
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

  const orders = ordersData?.orders || mockKitchenOrders;

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

      {/* Kitchen Board */}
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
    </div>
  );
}

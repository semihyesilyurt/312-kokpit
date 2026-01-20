'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Grid3X3,
  List,
  RefreshCw,
  ChevronDown,
  X,
  Phone,
  MapPin,
  Clock,
  User,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { formatCurrency, formatRelativeTime, formatTime, getOrderStatusLabel } from '@/lib/utils';
import type { Order, OrderStatus, Platform, OrdersResponse, Courier } from '@/types';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

// Platform colors and labels (lowercase keys for consistency)
const PLATFORM_COLORS: Record<string, string> = {
  yemeksepeti: '#FA0050',
  getir: '#5D3EBC',
  trendyol: '#F27A1A',
  migros: '#FF6000',
  phone: '#22C55E',
  walkin: '#3B82F6',
};

const PLATFORM_LABELS: Record<string, string> = {
  yemeksepeti: 'Yemeksepeti',
  getir: 'Getir',
  trendyol: 'Trendyol',
  migros: 'Migros',
  phone: 'Telefon',
  walkin: 'Gel-Al',
};

// Helper to get platform color/label (case-insensitive)
const getPlatformColor = (platform: string) => PLATFORM_COLORS[platform.toLowerCase()] || '#6B7280';
const getPlatformLabel = (platform: string) => PLATFORM_LABELS[platform.toLowerCase()] || platform;

// Status colors for Kanban columns
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Beklemede', color: 'text-warning', bgColor: 'bg-warning/10' },
  confirmed: { label: 'Onaylandi', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  preparing: { label: 'Hazirlaniyor', color: 'text-info', bgColor: 'bg-info/10' },
  ready: { label: 'Hazir', color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  on_delivery: { label: 'Yolda', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  delivering: { label: 'Yolda', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  delivered: { label: 'Teslim Edildi', color: 'text-success', bgColor: 'bg-success/10' },
  completed: { label: 'Tamamlandi', color: 'text-success', bgColor: 'bg-success/10' },
  cancelled: { label: 'Iptal', color: 'text-destructive', bgColor: 'bg-destructive/10' },
};

// Map backend status to frontend status
const normalizeStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'on_delivery': 'on_delivery',
    'delivering': 'on_delivery',
    'delivered': 'completed',
  };
  const lower = status.toLowerCase();
  return statusMap[lower] || lower;
};

// Helper to get status config (case-insensitive)
const getStatusConfig = (status: string) => STATUS_CONFIG[normalizeStatus(status)] || { label: status, color: 'text-gray-500', bgColor: 'bg-gray-100' };

// Kanban column order (pending first for new orders awaiting confirmation)
const KANBAN_COLUMNS: string[] = ['pending', 'confirmed', 'preparing', 'ready', 'on_delivery', 'completed'];


// Order Card Component
function OrderCard({
  order,
  onSelect,
  onStatusChange,
}: {
  order: Order;
  onSelect: (order: Order) => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
}) {
  const config = getStatusConfig(order.status);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(order)}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: getPlatformColor(order.platform) }}
            >
              {getPlatformLabel(order.platform).charAt(0)}
            </span>
            <span className="font-bold">#{order.platformDisplayId || order.orderNumber}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(order.createdAt)}
          </span>
        </div>

        {/* Customer */}
        <div className="mb-3">
          <p className="font-medium text-sm">{order.customer.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {order.customer.address}
          </p>
        </div>

        {/* Items */}
        <div className="mb-3 text-xs text-muted-foreground">
          {order.items.slice(0, 2).map((item, idx) => (
            <div key={item.id} className={idx > 0 ? 'truncate' : ''}>
              <p>
                {item.quantity}x {item.productName}
              </p>
              {item.notes && (
                <p className="text-xs text-orange-500 font-medium">{item.notes}</p>
              )}
            </div>
          ))}
          {order.items.length > 2 && (
            <p className="text-muted-foreground">+{order.items.length - 2} urun daha</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="font-bold">{formatCurrency(order.total)}</span>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              order.isPaid
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive font-bold'
            }`}
          >
            {order.isPaid ? 'Odendi' : 'Odenmedi'}
          </span>
        </div>

        {/* Courier info if delivering */}
        {order.courierName && order.status === 'on_delivery' && (
          <div className="mt-2 pt-2 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Truck className="h-3 w-3" />
            <span>{order.courierName}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Order Detail Modal
function OrderDetailModal({
  order,
  couriers,
  onClose,
  onStatusChange,
  onAssignCourier,
}: {
  order: Order;
  couriers: Courier[];
  onClose: () => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onAssignCourier: (orderId: string, courierId: string) => void;
}) {
  const config = getStatusConfig(order.status);
  const [showCourierSelect, setShowCourierSelect] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
    >
      <div
        className="bg-card w-full max-w-lg mx-4 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span
              className="h-8 w-8 rounded flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: getPlatformColor(order.platform) }}
            >
              {getPlatformLabel(order.platform).charAt(0)}
            </span>
            <div>
              <h2 id="order-detail-title" className="font-bold text-lg">
                Siparis #{order.platformDisplayId || order.orderNumber}
              </h2>
              <p className="text-sm text-muted-foreground">
                {getPlatformLabel(order.platform)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Status */}
          <div className={`p-3 rounded-lg ${config.bgColor}`}>
            <div className="flex items-center justify-between">
              <span className={`font-medium ${config.color}`}>
                {config.label}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatRelativeTime(order.createdAt)}
              </span>
            </div>
          </div>

          {/* Customer Info */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground">Musteri Bilgileri</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{order.customer.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${order.customer.phone}`} className="text-primary hover:underline">
                  {order.customer.phone}
                </a>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{order.customer.address}</span>
              </div>
              {order.customer.notes && (
                <p className="text-sm text-muted-foreground pl-6">{order.customer.notes}</p>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground">Siparis Icerigi</h3>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    {item.notes && (
                      <p className="text-sm text-muted-foreground">{item.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p>{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                    <p className="font-medium">{formatCurrency(item.totalPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between text-sm">
              <span>Ara Toplam</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Teslimat Ucreti</span>
              <span>{formatCurrency(order.deliveryFee)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Indirim</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>Toplam</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Odeme</span>
              <span className={order.isPaid ? 'text-success' : 'text-destructive font-bold'}>
                {order.isPaid ? 'Odendi' : 'Odenmedi'} ({order.paymentMethod === 'cash' ? 'Nakit' : 'Kart'})
              </span>
            </div>
          </div>

          {/* Courier Assignment */}
          {(order.status.toLowerCase() === 'ready' || order.status === 'on_delivery') && (
            <div className="space-y-2 pt-2 border-t">
              <h3 className="font-medium text-sm text-muted-foreground">Kurye</h3>
              {order.courierName ? (
                <div className="flex items-center justify-between p-3 bg-accent rounded-lg">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    <span className="font-medium">{order.courierName}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCourierSelect(!showCourierSelect)}
                  >
                    Degistir
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowCourierSelect(!showCourierSelect)}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Kurye Ata
                </Button>
              )}

              {showCourierSelect && (
                <div className="space-y-2 mt-2">
                  {couriers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Kurye bulunamadi
                    </p>
                  ) : (
                    couriers.map((courier) => (
                      <button
                        key={courier.id}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          courier.id === order.courierId
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent'
                        }`}
                        onClick={() => {
                          onAssignCourier(order.id, courier.id);
                          setShowCourierSelect(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{courier.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {courier.activeDeliveries} aktif teslimat
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              courier.status === 'available'
                                ? 'bg-success/10 text-success'
                                : courier.status === 'busy'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {courier.status === 'available' ? 'Musait' : courier.status === 'busy' ? 'Mesgul' : 'Cevrimdisi'}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t bg-muted/30 flex gap-2">
          {order.status.toLowerCase() === 'pending' && (
            <>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => onStatusChange(order.id, 'cancelled')}
              >
                Iptal Et
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={() => onStatusChange(order.id, 'confirmed')}
              >
                Onayla
              </Button>
            </>
          )}
          {order.status.toLowerCase() === 'confirmed' && (
            <Button
              variant="default"
              className="flex-1"
              onClick={() => onStatusChange(order.id, 'preparing')}
            >
              Hazirlamaya Basla
            </Button>
          )}
          {order.status.toLowerCase() === 'preparing' && (
            <Button
              variant="default"
              className="flex-1"
              onClick={() => onStatusChange(order.id, 'ready')}
            >
              Hazir
            </Button>
          )}
          {order.status.toLowerCase() === 'ready' && order.courierId && (
            <Button
              variant="default"
              className="flex-1"
              onClick={() => onStatusChange(order.id, 'on_delivery')}
            >
              Yola Cikti
            </Button>
          )}
          {order.status === 'on_delivery' && (
            <Button
              variant="success"
              className="flex-1"
              onClick={() => onStatusChange(order.id, 'completed')}
            >
              Teslim Edildi
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  useRequireAuth();

  const queryClient = useQueryClient();
  const { onNewOrder, onOrderUpdated, onOrderStatus, isConnected } = useSocket();

  // State
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch orders with retry - optimized for kanban view
  const { data: ordersData, isLoading, isError, refetch } = useQuery<OrdersResponse>({
    queryKey: ['orders', selectedStatus, selectedPlatform, searchQuery],
    queryFn: async () => {
      const params: Record<string, string> = {};

      if (selectedStatus !== 'all') {
        params.status = selectedStatus.toUpperCase();
      }

      if (selectedPlatform !== 'all') params.platform = selectedPlatform.toUpperCase();
      if (searchQuery) params.search = searchQuery;

      // Increase limit for better initial load
      params.limit = '50';
      // API interceptor unwraps response to { data: [...], meta: {...} }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await api.get('/orders', { params });

      // Response is already unwrapped by interceptor: { data: [...orders], meta: {...} }
      const ordersArray = response.data || [];
      const metaData = response.meta || { total: ordersArray.length, page: 1, pageSize: 50, totalPages: 1 };

      // Map API response to frontend Order format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedOrders: Order[] = ordersArray.map((item: any) => ({
        id: String(item.id),
        orderNumber: item.orderNumber,
        platform: item.platform,
        platformOrderId: item.platformOrderId,
        platformDisplayId: item.platformDisplayId,
        status: normalizeStatus(item.status),
        customer: {
          name: item.customerName || item.customer?.name || '',
          phone: item.customerPhone || item.customer?.phone || '',
          address: item.customerAddress || '',
          notes: item.customerNote,
        },
        items: (item.items || []).map((orderItem: { id: number; productId: number; productName: string; quantity: number; unitPrice: string; totalPrice: string; notes?: string }) => ({
          id: String(orderItem.id),
          productId: String(orderItem.productId),
          productName: orderItem.productName,
          quantity: orderItem.quantity,
          unitPrice: parseFloat(orderItem.unitPrice) || 0,
          totalPrice: parseFloat(orderItem.totalPrice) || 0,
          notes: orderItem.notes,
        })),
        subtotal: parseFloat(item.subtotal) || 0,
        deliveryFee: parseFloat(item.deliveryFee) || 0,
        discount: parseFloat(item.discount) || 0,
        total: parseFloat(item.totalAmount) || 0,
        paymentMethod: item.paymentMethod?.toLowerCase() || 'cash',
        isPaid: item.paymentStatus === 'PAID',
        courierId: item.courierId ? String(item.courierId) : undefined,
        courierName: item.courier?.user?.name,
        estimatedDeliveryTime: item.estimatedDelivery,
        actualDeliveryTime: item.actualDelivery,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      return {
        orders: mappedOrders,
        total: metaData.total || 0,
        page: metaData.page || 1,
        limit: metaData.pageSize || 50,
        totalPages: metaData.totalPages || 1,
      };
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 5000, // Consider data fresh for 5 seconds to prevent excessive refetches
    refetchOnWindowFocus: false, // Disable refetch on window focus for better performance
  });

  // Fetch couriers for assignment with retry
  const { data: couriersData } = useQuery<Courier[]>({
    queryKey: ['couriers'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await api.get('/delivery/couriers');
      const couriersArray = response.data || [];

      // Map API response to frontend Courier format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return couriersArray.map((c: any) => ({
        id: String(c.id),
        name: c.user?.name || 'Kurye',
        phone: c.user?.phone || '',
        status: (c.status || 'offline').toLowerCase() as 'available' | 'busy' | 'offline',
        vehicleType: (c.vehicleType || 'motorcycle').toLowerCase(),
        activeDeliveries: c._count?.orders || 0,
        todayDeliveries: c.totalDeliveries || 0,
        cashBalance: parseFloat(c.cashBalance) || 0,
        rating: c.rating || 0,
      }));
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      return api.patch(`/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrder(null);
    },
  });

  // Assign courier mutation
  const assignCourierMutation = useMutation({
    mutationFn: async ({ orderId, courierId }: { orderId: string; courierId: string }) => {
      return api.post(`/orders/${orderId}/assign`, { courierId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  // Handle status change
  const handleStatusChange = useCallback((orderId: string, status: OrderStatus) => {
    updateStatusMutation.mutate({ orderId, status });
  }, [updateStatusMutation]);

  // Handle courier assignment
  const handleAssignCourier = useCallback((orderId: string, courierId: string) => {
    assignCourierMutation.mutate({ orderId, courierId });
  }, [assignCourierMutation]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubNew = onNewOrder(() => refetch());
    const unsubUpdated = onOrderUpdated(() => refetch());
    const unsubStatus = onOrderStatus(() => refetch());

    return () => {
      unsubNew();
      unsubUpdated();
      unsubStatus();
    };
  }, [onNewOrder, onOrderUpdated, onOrderStatus, refetch]);

  const orders = ordersData?.orders || [];
  const couriers = couriersData || [];

  // Filter orders for display (case-insensitive comparison)
  const filteredOrders = orders.filter((order) => {
    const orderStatus = order.status.toLowerCase();
    const orderPlatform = order.platform.toLowerCase();
    if (selectedStatus !== 'all' && orderStatus !== selectedStatus) return false;
    if (selectedPlatform !== 'all' && orderPlatform !== selectedPlatform) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.orderNumber.toLowerCase().includes(query) ||
        order.customer.name.toLowerCase().includes(query) ||
        order.customer.phone.includes(query)
      );
    }
    return true;
  });

  // Group orders by status for Kanban view (case-insensitive)
  const ordersByStatus = KANBAN_COLUMNS.reduce((acc, status) => {
    acc[status] = filteredOrders.filter((o) => o.status.toLowerCase() === status);
    return acc;
  }, {} as Record<string, Order[]>);

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 md:p-6 border-b bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Siparisler</h1>
            <p className="text-muted-foreground">
              {filteredOrders.length} siparis {isConnected && '(Canli)'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Siparis ara..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filter Toggle */}
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Filtreleri goster"
            >
              <Filter className="h-4 w-4" />
            </Button>

            {/* View Toggle */}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('kanban')}
                aria-label="Kanban gorunumu"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
                aria-label="Liste gorunumu"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Yenile"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            {/* Status Filter */}
            <select
              className="px-3 py-2 border rounded-md bg-background text-sm"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OrderStatus | 'all')}
              aria-label="Durum filtresi"
            >
              <option value="all">Tum Durumlar</option>
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <option key={status} value={status}>
                  {config.label}
                </option>
              ))}
            </select>

            {/* Platform Filter */}
            <select
              className="px-3 py-2 border rounded-md bg-background text-sm"
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value as Platform | 'all')}
              aria-label="Platform filtresi"
            >
              <option value="all">Tum Platformlar</option>
              {Object.entries(PLATFORM_LABELS).map(([platform, label]) => (
                <option key={platform} value={platform}>
                  {label}
                </option>
              ))}
            </select>

            {/* Clear Filters */}
            {(selectedStatus !== 'all' || selectedPlatform !== 'all' || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedStatus('all');
                  setSelectedPlatform('all');
                  setSearchQuery('');
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Temizle
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {isError && (
        <div className="flex flex-col items-center justify-center p-8 bg-destructive/10 rounded-lg mx-4">
          <p className="text-destructive font-medium mb-2">Siparisler yuklenemedi</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tekrar Dene
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === 'kanban' ? (
          /* Kanban View */
          <div className="h-full overflow-x-auto">
            <div className="flex gap-4 p-4 min-w-max h-full">
              {KANBAN_COLUMNS.map((status) => {
                const config = STATUS_CONFIG[status];
                const columnOrders = ordersByStatus[status] || [];

                return (
                  <div
                    key={status}
                    className="w-80 flex flex-col bg-muted/30 rounded-lg"
                  >
                    {/* Column Header */}
                    <div className={`p-3 rounded-t-lg ${config.bgColor}`}>
                      <div className="flex items-center justify-between">
                        <h3 className={`font-medium ${config.color}`}>
                          {config.label}
                        </h3>
                        <span className={`text-sm ${config.color}`}>
                          {columnOrders.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Content */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {columnOrders.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          onSelect={setSelectedOrder}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                      {columnOrders.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          Siparis yok
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="overflow-auto h-full">
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium">Siparis</th>
                  <th className="text-left p-3 font-medium">Musteri</th>
                  <th className="text-left p-3 font-medium">Platform</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-left p-3 font-medium">Toplam</th>
                  <th className="text-left p-3 font-medium">Zaman</th>
                  <th className="text-left p-3 font-medium">Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const config = getStatusConfig(order.status);
                  return (
                    <tr
                      key={order.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="p-3">
                        <span className="font-bold">#{order.platformDisplayId || order.orderNumber}</span>
                      </td>
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{order.customer.name}</p>
                          <p className="text-sm text-muted-foreground">{order.customer.phone}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium text-white"
                          style={{ backgroundColor: getPlatformColor(order.platform) }}
                        >
                          {getPlatformLabel(order.platform)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{formatCurrency(order.total)}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {formatRelativeTime(order.createdAt)}
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm">
                          Detay
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          couriers={couriers}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
          onAssignCourier={handleAssignCourier}
        />
      )}
    </div>
  );
}

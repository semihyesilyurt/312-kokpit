'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { useRequireAuth } from '@/hooks/useAuth';
import { RefreshCw, AlertTriangle } from 'lucide-react';

// Dashboard data interface matching the API response
interface DashboardData {
  todayOrders: number;
  todayRevenue: number;
  todayNetProfit: number;
  averageDeliveryTime: number | null;
  ordersChangePercent: number;
  revenueChangePercent: number;
  activeOrders: number;
  availableCouriers: number;
  criticalStockCount: number;
  sleepingCustomers: number;
  ordersByPlatform: Array<{ platform: string; count: number; revenue: number }>;
  alerts: Array<{ type: string; message: string; severity: string }>;
}

// Recent order interface
interface RecentOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  totalAmount: string;
  status: string;
  items: Array<{ productName: string; quantity: number }>;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Beklemede', className: 'status-badge-warning' },
    CONFIRMED: { label: 'Onaylandi', className: 'status-badge-info' },
    PREPARING: { label: 'Hazirlaniyor', className: 'status-badge-warning' },
    READY: { label: 'Hazir', className: 'status-badge-info' },
    ON_DELIVERY: { label: 'Yolda', className: 'status-badge-info' },
    DELIVERED: { label: 'Teslim Edildi', className: 'status-badge-success' },
    CANCELLED: { label: 'Iptal', className: 'status-badge-error' },
  };

  const config = statusConfig[status] || { label: status, className: 'status-badge-default' };

  return (
    <span className={`status-badge ${config.className}`}>
      {config.label}
    </span>
  );
}

export default function DashboardPage() {
  useRequireAuth();
  const router = useRouter();

  // Fetch dashboard data
  const { data: dashboardData, isLoading: isDashboardLoading, isError: isDashboardError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await api.get('/reports/dashboard');
      const data = response.data || response || {};

      // Return with safe defaults
      return {
        todayOrders: data.todayOrders ?? 0,
        todayRevenue: data.todayRevenue ?? 0,
        todayNetProfit: data.todayNetProfit ?? 0,
        averageDeliveryTime: data.averageDeliveryTime ?? null,
        ordersChangePercent: data.ordersChangePercent ?? 0,
        revenueChangePercent: data.revenueChangePercent ?? 0,
        activeOrders: data.activeOrders ?? 0,
        availableCouriers: data.availableCouriers ?? 0,
        criticalStockCount: data.criticalStockCount ?? 0,
        sleepingCustomers: data.sleepingCustomers ?? 0,
        ordersByPlatform: data.ordersByPlatform ?? [],
        alerts: data.alerts ?? [],
      };
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch recent orders
  const { data: recentOrdersData, isLoading: isOrdersLoading } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: async (): Promise<RecentOrder[]> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await api.get('/orders', { params: { limit: 5, page: 1 } });
        const orders = response.data || [];
        if (!Array.isArray(orders)) return [];

        return orders.map((order: Record<string, unknown>) => ({
          id: (order.id as number) || 0,
          orderNumber: String(order.orderNumber || ''),
          customerName: String(order.customerName || ''),
          totalAmount: String(order.totalAmount || '0'),
          status: String(order.status || ''),
          items: Array.isArray(order.items) ? order.items as Array<{ productName: string; quantity: number }> : [],
        }));
      } catch {
        return [];
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const dashboard = dashboardData;
  const recentOrders = recentOrdersData || [];

  // Loading state
  if (isDashboardLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (isDashboardError || !dashboard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-medium mb-2">Veriler yuklenemedi</h2>
          <p className="text-muted-foreground">Lutfen sayfayi yenileyin veya daha sonra tekrar deneyin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kontrol Paneli</h1>
          <p className="text-muted-foreground">
            312 Doner yonetim sistemine hos geldiniz
          </p>
        </div>
      </div>

      {/* Alerts */}
      {dashboard.alerts && dashboard.alerts.length > 0 && (
        <div className="space-y-2">
          {dashboard.alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg flex items-center gap-3 ${
                alert.severity === 'critical'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-warning/10 text-warning'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Bugunun Siparisleri"
          value={dashboard.todayOrders.toString()}
          trend={
            dashboard.ordersChangePercent !== 0
              ? {
                  value: Math.abs(dashboard.ordersChangePercent),
                  label: 'dunden bu yana',
                  positive: dashboard.ordersChangePercent > 0,
                }
              : undefined
          }
        />
        <StatCard
          title="Aktif Kuryeler"
          value={dashboard.availableCouriers.toString()}
          description={`${dashboard.activeOrders} aktif siparis`}
        />
        <StatCard
          title="Bugunun Cirosu"
          value={formatCurrency(dashboard.todayRevenue)}
          trend={
            dashboard.revenueChangePercent !== 0
              ? {
                  value: Math.abs(dashboard.revenueChangePercent),
                  label: 'dunden bu yana',
                  positive: dashboard.revenueChangePercent > 0,
                }
              : undefined
          }
        />
        <StatCard
          title="Bekleyen Siparisler"
          value={dashboard.activeOrders.toString()}
          description={
            dashboard.averageDeliveryTime
              ? `Ortalama teslim: ${dashboard.averageDeliveryTime} dk`
              : 'Teslim verisi yok'
          }
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Kar</p>
                <p className="text-2xl font-bold">{formatCurrency(dashboard.todayNetProfit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={dashboard.criticalStockCount > 0 ? 'border-destructive' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Kritik Stok</p>
                <p className={`text-2xl font-bold ${dashboard.criticalStockCount > 0 ? 'text-destructive' : ''}`}>
                  {dashboard.criticalStockCount} urun
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Uyuyan Musteriler</p>
                <p className="text-2xl font-bold">{dashboard.sleepingCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Orders */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Son Siparisler</CardTitle>
            <CardDescription>
              Son 5 siparisin ozeti
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOrdersLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Henuz siparis yok
              </div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between py-3 border-b last:border-0"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          #{order.orderNumber?.slice(-3) || order.id}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{order.customerName || 'Misafir'}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.items?.slice(0, 2).map((item) => `${item.quantity}x ${item.productName}`).join(', ')}
                          {order.items?.length > 2 && ` +${order.items.length - 2} daha`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(parseFloat(order.totalAmount || '0'))}</p>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Hizli Islemler</CardTitle>
            <CardDescription>
              Sik kullanilan islemler
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <button
                onClick={() => router.push('/dashboard/orders')}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Yeni Siparis</p>
                  <p className="text-sm text-muted-foreground">Manuel siparis olustur</p>
                </div>
              </button>
              <button
                onClick={() => router.push('/dashboard/stock')}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-success"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Stok Guncelle</p>
                  <p className="text-sm text-muted-foreground">Urun stoklarini duzenle</p>
                </div>
              </button>
              <button
                onClick={() => router.push('/dashboard/delivery')}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-info"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Kurye Takibi</p>
                  <p className="text-sm text-muted-foreground">Canli harita gorunumu</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Distribution */}
      {dashboard.ordersByPlatform && dashboard.ordersByPlatform.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Platform Dagilimi</CardTitle>
            <CardDescription>Bugunun siparislerinin platform bazli dagilimi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {dashboard.ordersByPlatform.map((platform) => (
                <div key={platform.platform} className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground capitalize">{platform.platform.toLowerCase()}</p>
                  <p className="text-2xl font-bold">{platform.count}</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(platform.revenue)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

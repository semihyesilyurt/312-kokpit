'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Users,
  Truck,
  Calendar,
  Download,
  RefreshCw,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { useRequireAuth } from '@/hooks/useAuth';

// Mock report data
const mockReportData = {
  summary: {
    totalRevenue: 45780,
    totalOrders: 342,
    averageOrderValue: 133.86,
    totalCustomers: 189,
    newCustomers: 23,
    deliveryRate: 94.5,
  },
  revenueByPlatform: [
    { platform: 'Yemeksepeti', revenue: 18500, orders: 145, percentage: 40.4 },
    { platform: 'Getir', revenue: 12300, orders: 98, percentage: 26.9 },
    { platform: 'Trendyol', revenue: 8200, orders: 52, percentage: 17.9 },
    { platform: 'Telefon', revenue: 4280, orders: 32, percentage: 9.4 },
    { platform: 'Gel-Al', revenue: 2500, orders: 15, percentage: 5.4 },
  ],
  topProducts: [
    { name: 'Doner Durum', quantity: 156, revenue: 5460 },
    { name: 'Iskender', quantity: 89, revenue: 10680 },
    { name: 'Lahmacun', quantity: 124, revenue: 3100 },
    { name: 'Adana Kebap', quantity: 67, revenue: 5695 },
    { name: 'Tavuk Doner', quantity: 98, revenue: 4410 },
  ],
  hourlyOrders: [
    { hour: '11:00', orders: 12 },
    { hour: '12:00', orders: 45 },
    { hour: '13:00', orders: 38 },
    { hour: '14:00', orders: 22 },
    { hour: '18:00', orders: 35 },
    { hour: '19:00', orders: 56 },
    { hour: '20:00', orders: 48 },
    { hour: '21:00', orders: 42 },
    { hour: '22:00', orders: 28 },
  ],
  comparison: {
    revenueChange: 12.5,
    ordersChange: 8.3,
    customersChange: 15.2,
  },
};

// Stat Card Component
function StatCard({
  title,
  value,
  change,
  icon: Icon,
  format = 'number',
}: {
  title: string;
  value: number;
  change?: number;
  icon: React.ElementType;
  format?: 'number' | 'currency' | 'percentage';
}) {
  const formattedValue = format === 'currency'
    ? formatCurrency(value)
    : format === 'percentage'
      ? `%${value.toFixed(1)}`
      : value.toLocaleString('tr-TR');

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{formattedValue}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-sm ${change >= 0 ? 'text-success' : 'text-destructive'}`}>
                {change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{Math.abs(change).toFixed(1)}% onceki doneme gore</span>
              </div>
            )}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  useRequireAuth();

  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');

  // Fetch report data
  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['reports', dateRange],
    queryFn: async () => {
      try {
        const response = await api.get('/reports/summary', {
          params: { range: dateRange },
        });
        return response.data;
      } catch {
        return mockReportData;
      }
    },
  });

  const data = reportData || mockReportData;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Raporlar</h1>
          <p className="text-muted-foreground">Satis ve performans analizi</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range */}
          <div className="flex border rounded-md">
            {(['today', 'week', 'month'] as const).map((range) => (
              <Button
                key={range}
                variant={dateRange === range ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setDateRange(range)}
              >
                {range === 'today' ? 'Bugun' : range === 'week' ? 'Hafta' : 'Ay'}
              </Button>
            ))}
          </div>

          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              const reportContent = `312 Doner Rapor - ${dateRange === 'today' ? 'Bugun' : dateRange === 'week' ? 'Bu Hafta' : 'Bu Ay'}

Toplam Gelir: ${data.summary.totalRevenue} TL
Toplam Siparis: ${data.summary.totalOrders}
Ortalama Siparis: ${data.summary.averageOrderValue.toFixed(2)} TL
Teslimat Basarisi: ${data.summary.deliveryRate}%
Toplam Musteri: ${data.summary.totalCustomers}
Yeni Musteri: ${data.summary.newCustomers}

Platform Bazli Gelir:
${data.revenueByPlatform.map((p: { platform: string; revenue: number; orders: number }) => `- ${p.platform}: ${p.revenue} TL (${p.orders} siparis)`).join('\n')}

En Cok Satan Urunler:
${data.topProducts.map((p: { name: string; quantity: number; revenue: number }, i: number) => `${i + 1}. ${p.name}: ${p.quantity} adet - ${p.revenue} TL`).join('\n')}
`;
              const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `rapor-${dateRange}-${new Date().toISOString().split('T')[0]}.txt`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Indir
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Toplam Gelir"
          value={data.summary.totalRevenue}
          change={data.comparison.revenueChange}
          icon={DollarSign}
          format="currency"
        />
        <StatCard
          title="Toplam Siparis"
          value={data.summary.totalOrders}
          change={data.comparison.ordersChange}
          icon={ShoppingBag}
        />
        <StatCard
          title="Ortalama Siparis"
          value={data.summary.averageOrderValue}
          icon={BarChart3}
          format="currency"
        />
        <StatCard
          title="Teslimat Basarisi"
          value={data.summary.deliveryRate}
          icon={Truck}
          format="percentage"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by Platform */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Platform Bazli Gelir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.revenueByPlatform.map((platform: { platform: string; revenue: number; orders: number; percentage: number }) => (
                <div key={platform.platform}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{platform.platform}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(platform.revenue)} ({platform.orders} siparis)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${platform.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              En Cok Satan Urunler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topProducts.map((product: { name: string; quantity: number; revenue: number }, index: number) => (
                <div key={product.name} className="flex items-center gap-4">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {product.quantity} adet - {formatCurrency(product.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Saatlik Siparis Dagilimi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2 h-48">
            {data.hourlyOrders.map((item: { hour: string; orders: number }) => {
              const maxOrders = Math.max(...data.hourlyOrders.map((o: { orders: number }) => o.orders));
              const height = (item.orders / maxOrders) * 100;

              return (
                <div key={item.hour} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col items-center justify-end h-40">
                    <span className="text-xs font-medium mb-1">{item.orders}</span>
                    <div
                      className="w-full bg-primary rounded-t transition-all"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{item.hour}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Customer Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Musteri</p>
                <p className="text-2xl font-bold">{data.summary.totalCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Yeni Musteri</p>
                <p className="text-2xl font-bold">{data.summary.newCustomers}</p>
                <p className="text-xs text-success">+{data.comparison.customersChange}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tekrar Eden</p>
                <p className="text-2xl font-bold">{data.summary.totalCustomers - data.summary.newCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

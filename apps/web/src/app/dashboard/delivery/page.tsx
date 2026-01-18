'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Users,
  Truck,
  Phone,
  RefreshCw,
  Wallet,
  Star,
  Clock,
  Package,
  Navigation,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import type { Courier, CourierStatus, Order } from '@/types';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

// Status configuration
const STATUS_CONFIG: Record<CourierStatus, { label: string; color: string; bgColor: string }> = {
  available: { label: 'Musait', color: 'text-success', bgColor: 'bg-success/10' },
  busy: { label: 'Mesgul', color: 'text-warning', bgColor: 'bg-warning/10' },
  offline: { label: 'Cevrimdisi', color: 'text-muted-foreground', bgColor: 'bg-muted' },
  break: { label: 'Molada', color: 'text-info', bgColor: 'bg-info/10' },
};

// Vehicle type labels
const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: 'Motorsiklet',
  bicycle: 'Bisiklet',
  car: 'Araba',
  walk: 'Yaya',
};

// Ankara center coordinates (312 Doner is in Ankara)
const ANKARA_CENTER: [number, number] = [39.9334, 32.8597];

// Mock couriers with locations
const mockCouriers: (Courier & { currentLocation?: { lat: number; lng: number; updatedAt: string } })[] = [
  {
    id: 'c1',
    name: 'Ali Kurye',
    phone: '5321111111',
    status: 'busy',
    vehicleType: 'motorcycle',
    currentLocation: {
      lat: 39.9234,
      lng: 32.8497,
      updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    activeDeliveries: 2,
    todayDeliveries: 15,
    cashBalance: 450,
    rating: 4.8,
  },
  {
    id: 'c2',
    name: 'Veli Kurye',
    phone: '5322222222',
    status: 'available',
    vehicleType: 'motorcycle',
    currentLocation: {
      lat: 39.9434,
      lng: 32.8697,
      updatedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    },
    activeDeliveries: 0,
    todayDeliveries: 12,
    cashBalance: 320,
    rating: 4.6,
  },
  {
    id: 'c3',
    name: 'Hasan Kurye',
    phone: '5323333333',
    status: 'busy',
    vehicleType: 'bicycle',
    currentLocation: {
      lat: 39.9134,
      lng: 32.8397,
      updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    activeDeliveries: 1,
    todayDeliveries: 8,
    cashBalance: 180,
    rating: 4.5,
  },
  {
    id: 'c4',
    name: 'Mehmet Kurye',
    phone: '5324444444',
    status: 'break',
    vehicleType: 'motorcycle',
    currentLocation: {
      lat: 39.9384,
      lng: 32.8547,
      updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    activeDeliveries: 0,
    todayDeliveries: 10,
    cashBalance: 280,
    rating: 4.7,
  },
  {
    id: 'c5',
    name: 'Ayhan Kurye',
    phone: '5325555555',
    status: 'offline',
    vehicleType: 'car',
    activeDeliveries: 0,
    todayDeliveries: 0,
    cashBalance: 0,
    rating: 4.4,
  },
];

// Mock active deliveries
const mockActiveDeliveries: Order[] = [
  {
    id: 'o1',
    orderNumber: '126',
    platform: 'getir',
    status: 'delivering',
    customer: { name: 'Mehmet Demir', phone: '5329876543', address: 'Cankaya Mah. Sok:8/A' },
    items: [{ id: '1', productId: 'p1', productName: 'Iskender', quantity: 1, unitPrice: 120, totalPrice: 120 }],
    subtotal: 120,
    deliveryFee: 25,
    discount: 0,
    total: 145,
    paymentMethod: 'cash',
    isPaid: false,
    courierId: 'c1',
    courierName: 'Ali Kurye',
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'o2',
    orderNumber: '124',
    platform: 'trendyol',
    status: 'delivering',
    customer: { name: 'Fatma Ozturk', phone: '5341112233', address: 'Ulus Mah. Apt:5' },
    items: [{ id: '2', productId: 'p2', productName: 'Adana Kebap', quantity: 2, unitPrice: 85, totalPrice: 170 }],
    subtotal: 170,
    deliveryFee: 30,
    discount: 10,
    total: 190,
    paymentMethod: 'online',
    isPaid: true,
    courierId: 'c1',
    courierName: 'Ali Kurye',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'o3',
    orderNumber: '125',
    platform: 'yemeksepeti',
    status: 'delivering',
    customer: { name: 'Can Yilmaz', phone: '5357778899', address: 'Kizilay Cad. No:22' },
    items: [{ id: '3', productId: 'p3', productName: 'Doner Durum', quantity: 3, unitPrice: 35, totalPrice: 105 }],
    subtotal: 105,
    deliveryFee: 20,
    discount: 0,
    total: 125,
    paymentMethod: 'credit_card',
    isPaid: true,
    courierId: 'c3',
    courierName: 'Hasan Kurye',
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Courier card component
function CourierCard({
  courier,
  deliveries,
  isSelected,
  onSelect,
}: {
  courier: Courier & { currentLocation?: { lat: number; lng: number; updatedAt: string } };
  deliveries: Order[];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const config = STATUS_CONFIG[courier.status];

  return (
    <Card
      className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {courier.name.charAt(0)}
                </span>
              </div>
              <span
                className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card ${
                  courier.status === 'available'
                    ? 'bg-success'
                    : courier.status === 'busy'
                      ? 'bg-warning'
                      : courier.status === 'break'
                        ? 'bg-info'
                        : 'bg-muted'
                }`}
              />
            </div>
            <div>
              <h3 className="font-medium">{courier.name}</h3>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{courier.phone}</span>
              </div>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${config.bgColor} ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <Package className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Aktif</span>
            </div>
            <p className="font-bold">{courier.activeDeliveries}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <Truck className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Bugun</span>
            </div>
            <p className="font-bold">{courier.todayDeliveries}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <Star className="h-3 w-3 text-warning" />
              <span className="text-xs text-muted-foreground">Puan</span>
            </div>
            <p className="font-bold">{courier.rating}</p>
          </div>
        </div>

        {/* Cash Balance */}
        <div className="flex items-center justify-between p-2 bg-warning/10 rounded-lg">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-warning" />
            <span className="text-sm">Nakit Bakiye</span>
          </div>
          <span className="font-bold">{formatCurrency(courier.cashBalance)}</span>
        </div>

        {/* Vehicle */}
        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
          <Navigation className="h-3 w-3" />
          <span>{VEHICLE_LABELS[courier.vehicleType]}</span>
          {courier.currentLocation && (
            <span className="ml-auto text-xs">
              Son konum: {Math.round((Date.now() - new Date(courier.currentLocation.updatedAt).getTime()) / 60000)} dk once
            </span>
          )}
        </div>

        {/* Active Deliveries */}
        {deliveries.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <p className="text-xs text-muted-foreground">Aktif Teslimatlar:</p>
            {deliveries.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
              >
                <span>#{order.orderNumber}</span>
                <span className="text-muted-foreground">{order.customer.name}</span>
                <span className={order.isPaid ? 'text-success' : 'text-warning'}>
                  {formatCurrency(order.total)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Map component
function DeliveryMap({
  couriers,
  selectedCourierId,
  onSelectCourier,
}: {
  couriers: (Courier & { currentLocation?: { lat: number; lng: number; updatedAt: string } })[];
  selectedCourierId: string | null;
  onSelectCourier: (id: string | null) => void;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg">
        <div className="text-center">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Harita yukleniyor...</p>
        </div>
      </div>
    );
  }

  // Filter couriers with locations
  const couriersWithLocation = couriers.filter((c) => c.currentLocation);

  return (
    <MapContainer
      center={ANKARA_CENTER}
      zoom={13}
      className="h-full w-full rounded-lg"
      style={{ minHeight: '400px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {couriersWithLocation.map((courier) => {
        if (!courier.currentLocation) return null;
        const config = STATUS_CONFIG[courier.status];

        return (
          <Marker
            key={courier.id}
            position={[courier.currentLocation.lat, courier.currentLocation.lng]}
            eventHandlers={{
              click: () => onSelectCourier(courier.id),
            }}
          >
            <Popup>
              <div className="p-2 min-w-[150px]">
                <p className="font-bold">{courier.name}</p>
                <p className={`text-sm ${config.color}`}>{config.label}</p>
                <p className="text-sm text-muted-foreground">
                  {courier.activeDeliveries} aktif teslimat
                </p>
                <p className="text-sm">
                  Nakit: {formatCurrency(courier.cashBalance)}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default function DeliveryPage() {
  useRequireAuth();

  const { onCourierLocation, onCourierStatus, isConnected } = useSocket();

  // State
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CourierStatus | 'all'>('all');

  // Fetch couriers
  const { data: couriersData, isLoading, refetch } = useQuery({
    queryKey: ['couriers'],
    queryFn: async () => {
      try {
        const response = await api.get<typeof mockCouriers>('/delivery/couriers');
        return response.data;
      } catch {
        return mockCouriers;
      }
    },
    refetchInterval: 30000,
  });

  // Fetch active deliveries
  const { data: deliveriesData } = useQuery({
    queryKey: ['active-deliveries'],
    queryFn: async () => {
      try {
        const response = await api.get<Order[]>('/orders', { params: { status: 'delivering' } });
        return response.data;
      } catch {
        return mockActiveDeliveries;
      }
    },
    refetchInterval: 30000,
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubLocation = onCourierLocation(() => refetch());
    const unsubStatus = onCourierStatus(() => refetch());

    return () => {
      unsubLocation();
      unsubStatus();
    };
  }, [onCourierLocation, onCourierStatus, refetch]);

  const couriers = couriersData || mockCouriers;
  const deliveries = deliveriesData || mockActiveDeliveries;

  // Filter couriers
  const filteredCouriers = useMemo(() => {
    if (statusFilter === 'all') return couriers;
    return couriers.filter((c) => c.status === statusFilter);
  }, [couriers, statusFilter]);

  // Get deliveries for a courier
  const getCourierDeliveries = (courierId: string) => {
    return deliveries.filter((d) => d.courierId === courierId);
  };

  // Summary stats
  const stats = useMemo(() => {
    const total = couriers.length;
    const available = couriers.filter((c) => c.status === 'available').length;
    const busy = couriers.filter((c) => c.status === 'busy').length;
    const totalCashBalance = couriers.reduce((sum, c) => sum + c.cashBalance, 0);
    const totalActiveDeliveries = couriers.reduce((sum, c) => sum + c.activeDeliveries, 0);

    return { total, available, busy, totalCashBalance, totalActiveDeliveries };
  }, [couriers]);

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Teslimat Yonetimi</h1>
          <p className="text-muted-foreground">
            Kurye takibi ve teslimat yonetimi {isConnected && '(Canli)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="px-3 py-2 border rounded-md bg-background text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CourierStatus | 'all')}
            aria-label="Durum filtresi"
          >
            <option value="all">Tum Kuryeler</option>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <option key={status} value={status}>
                {config.label}
              </option>
            ))}
          </select>

          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Toplam Kurye</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Musait</p>
                <p className="text-2xl font-bold text-success">{stats.available}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-warning/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Mesgul</p>
                <p className="text-2xl font-bold text-warning">{stats.busy}</p>
              </div>
              <Truck className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktif Teslimat</p>
                <p className="text-2xl font-bold">{stats.totalActiveDeliveries}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Toplam Nakit</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalCashBalance)}</p>
              </div>
              <Wallet className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Map */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Canli Kurye Haritasi
            </CardTitle>
            <CardDescription>
              {couriers.filter((c) => c.currentLocation).length} kurye haritada gorunuyor
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[500px]">
              <DeliveryMap
                couriers={filteredCouriers}
                selectedCourierId={selectedCourierId}
                onSelectCourier={setSelectedCourierId}
              />
            </div>
          </CardContent>
        </Card>

        {/* Courier List */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Kuryeler ({filteredCouriers.length})</h2>
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {filteredCouriers.map((courier) => (
              <CourierCard
                key={courier.id}
                courier={courier}
                deliveries={getCourierDeliveries(courier.id)}
                isSelected={selectedCourierId === courier.id}
                onSelect={() =>
                  setSelectedCourierId(
                    selectedCourierId === courier.id ? null : courier.id
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>

      {/* Active Deliveries Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Aktif Teslimatlar
          </CardTitle>
          <CardDescription>
            Yolda olan tum siparisler
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Su an aktif teslimat bulunmuyor</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Siparis</th>
                    <th className="text-left p-3 font-medium">Musteri</th>
                    <th className="text-left p-3 font-medium">Adres</th>
                    <th className="text-left p-3 font-medium">Kurye</th>
                    <th className="text-right p-3 font-medium">Tutar</th>
                    <th className="text-center p-3 font-medium">Odeme</th>
                    <th className="text-right p-3 font-medium">Sure</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((order) => {
                    const minutes = Math.round(
                      (Date.now() - new Date(order.createdAt).getTime()) / 60000
                    );
                    return (
                      <tr key={order.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <span className="font-bold">#{order.orderNumber}</span>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{order.customer.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {order.customer.phone}
                            </p>
                          </div>
                        </td>
                        <td className="p-3 text-sm max-w-[200px] truncate">
                          {order.customer.address}
                        </td>
                        <td className="p-3">
                          <span className="font-medium">{order.courierName}</span>
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              order.isPaid
                                ? 'bg-success/10 text-success'
                                : 'bg-warning/10 text-warning'
                            }`}
                          >
                            {order.isPaid ? 'Odendi' : 'Nakit'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`text-sm ${
                              minutes > 45
                                ? 'text-destructive'
                                : minutes > 30
                                  ? 'text-warning'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {minutes} dk
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

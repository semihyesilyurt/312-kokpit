'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Users,
  Phone,
  MapPin,
  ShoppingBag,
  Star,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useRequireAuth } from '@/hooks/useAuth';

// Customer status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Aktif', color: 'text-success', bgColor: 'bg-success/10' },
  sleeping: { label: 'Uyuyan', color: 'text-warning', bgColor: 'bg-warning/10' },
  lost: { label: 'Kayip', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  vip: { label: 'VIP', color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
};

// Mock customer data
const mockCustomers = [
  {
    id: '1',
    name: 'Ahmet Yilmaz',
    phone: '5321234567',
    email: 'ahmet@email.com',
    address: 'Kizilay Mah. Ataturk Cad. No:15',
    status: 'vip',
    totalOrders: 45,
    totalSpent: 4250,
    averageOrder: 94.44,
    lastOrderAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    firstOrderAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    loyaltyPoints: 425,
    platform: 'yemeksepeti',
  },
  {
    id: '2',
    name: 'Mehmet Demir',
    phone: '5329876543',
    email: null,
    address: 'Cankaya Mah. Sok:8/A',
    status: 'active',
    totalOrders: 12,
    totalSpent: 1560,
    averageOrder: 130,
    lastOrderAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    firstOrderAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    loyaltyPoints: 156,
    platform: 'getir',
  },
  {
    id: '3',
    name: 'Ayse Kaya',
    phone: '5335551234',
    email: 'ayse.kaya@email.com',
    address: 'Bahcelievler Mah. Cad:22',
    status: 'sleeping',
    totalOrders: 8,
    totalSpent: 720,
    averageOrder: 90,
    lastOrderAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    firstOrderAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    loyaltyPoints: 72,
    platform: 'phone',
  },
  {
    id: '4',
    name: 'Fatma Ozturk',
    phone: '5341112233',
    email: null,
    address: 'Ulus Mah. Apt:5',
    status: 'active',
    totalOrders: 23,
    totalSpent: 2875,
    averageOrder: 125,
    lastOrderAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    firstOrderAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    loyaltyPoints: 287,
    platform: 'trendyol',
  },
  {
    id: '5',
    name: 'Can Yildirim',
    phone: '5357778899',
    email: 'can@email.com',
    address: 'Etlik Mah. No:10',
    status: 'lost',
    totalOrders: 3,
    totalSpent: 285,
    averageOrder: 95,
    lastOrderAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    firstOrderAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(),
    loyaltyPoints: 28,
    platform: 'walkin',
  },
];

// Customer Detail Modal
function CustomerDetailModal({
  customer,
  onClose,
}: {
  customer: typeof mockCustomers[0];
  onClose: () => void;
}) {
  const statusConfig = STATUS_CONFIG[customer.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-lg mx-4 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">
                {customer.name.charAt(0)}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-lg">{customer.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Contact Info */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground">Iletisim</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${customer.phone}`} className="text-primary hover:underline">
                  {customer.phone}
                </a>
              </div>
              {customer.email && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">@</span>
                  <span>{customer.email}</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{customer.address}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Toplam Siparis</p>
              <p className="text-xl font-bold">{customer.totalOrders}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Toplam Harcama</p>
              <p className="text-xl font-bold">{formatCurrency(customer.totalSpent)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Ortalama Siparis</p>
              <p className="text-xl font-bold">{formatCurrency(customer.averageOrder)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Sadakat Puani</p>
              <p className="text-xl font-bold">{customer.loyaltyPoints}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground">Gecmis</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Ilk Siparis</span>
                <span className="text-muted-foreground">{formatDate(customer.firstOrderAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Son Siparis</span>
                <span className="text-muted-foreground">{formatDate(customer.lastOrderAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tercih Ettigi Platform</span>
                <span className="text-muted-foreground capitalize">{customer.platform}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.location.href = `tel:${customer.phone}`}
          >
            <Phone className="h-4 w-4 mr-2" />
            Ara
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onClose();
              alert(`${customer.name} musterisinin siparisleri yakin zamanda eklenecek.`);
            }}
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            Siparisleri Gor
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  useRequireAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | 'all'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<typeof mockCustomers[0] | null>(null);

  // Fetch customers
  const { data: customersData, isLoading, refetch } = useQuery({
    queryKey: ['customers', selectedStatus, searchQuery],
    queryFn: async () => {
      try {
        const params: Record<string, string> = {};
        if (selectedStatus !== 'all') params.status = selectedStatus;
        if (searchQuery) params.search = searchQuery;
        const response = await api.get('/customers', { params });
        return response.data;
      } catch {
        return { customers: mockCustomers, total: mockCustomers.length };
      }
    },
  });

  const customers = customersData?.customers || mockCustomers;

  // Filter customers
  const filteredCustomers = customers.filter((customer: typeof mockCustomers[0]) => {
    if (selectedStatus !== 'all' && customer.status !== selectedStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        customer.name.toLowerCase().includes(query) ||
        customer.phone.includes(query) ||
        customer.email?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: customers.length,
    vip: customers.filter((c: typeof mockCustomers[0]) => c.status === 'vip').length,
    active: customers.filter((c: typeof mockCustomers[0]) => c.status === 'active').length,
    sleeping: customers.filter((c: typeof mockCustomers[0]) => c.status === 'sleeping').length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Musteriler</h1>
          <p className="text-muted-foreground">{customers.length} kayitli musteri</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Musteri ara..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setSelectedStatus('all')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setSelectedStatus('vip')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">VIP</p>
                <p className="text-xl font-bold">{stats.vip}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setSelectedStatus('active')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-xl font-bold">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setSelectedStatus('sleeping')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Uyuyan</p>
                <p className="text-xl font-bold">{stats.sleeping}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedStatus === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedStatus('all')}
        >
          Tumu
        </Button>
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <Button
            key={status}
            variant={selectedStatus === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus(status)}
          >
            {config.label}
          </Button>
        ))}
      </div>

      {/* Customer List */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Musteri</th>
                  <th className="text-left p-3 font-medium">Telefon</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-left p-3 font-medium">Siparisler</th>
                  <th className="text-left p-3 font-medium">Toplam</th>
                  <th className="text-left p-3 font-medium">Son Siparis</th>
                  <th className="text-left p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer: typeof mockCustomers[0]) => {
                  const statusConfig = STATUS_CONFIG[customer.status];
                  return (
                    <tr
                      key={customer.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="font-medium text-primary">
                              {customer.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            {customer.email && (
                              <p className="text-sm text-muted-foreground">{customer.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">{customer.phone}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="p-3">{customer.totalOrders}</td>
                      <td className="p-3 font-medium">{formatCurrency(customer.totalSpent)}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {formatDate(customer.lastOrderAt)}
                      </td>
                      <td className="p-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
  );
}

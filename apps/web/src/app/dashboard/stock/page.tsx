'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  AlertTriangle,
  Package,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ArrowUpDown,
  Clock,
  History,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { formatCurrency, formatDateTime, formatRelativeTime } from '@/lib/utils';
import type { StockItem, StockMovement, StockCategory, StockResponse } from '@/types';
import { useRequireAuth } from '@/hooks/useAuth';

// Category labels
const CATEGORY_LABELS: Record<StockCategory, string> = {
  et: 'Et Urunleri',
  sebze: 'Sebze & Meyve',
  baharat: 'Baharat & Sos',
  icecek: 'Icecekler',
  ambalaj: 'Ambalaj',
  diger: 'Diger',
};

// Category icons
const CATEGORY_ICONS: Record<StockCategory, string> = {
  et: '🥩',
  sebze: '🥬',
  baharat: '🧂',
  icecek: '🥤',
  ambalaj: '📦',
  diger: '📋',
};

// Unit labels
const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  lt: 'lt',
  ml: 'ml',
  adet: 'adet',
  porsiyon: 'porsiyon',
};

// Mock stock data
const mockStockItems: StockItem[] = [
  {
    id: 's1',
    name: 'Dana Eti (Doner)',
    category: 'et',
    unit: 'kg',
    currentStock: 5,
    theoreticalStock: 8,
    minStock: 10,
    maxStock: 50,
    unitCost: 450,
    lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    fireRate: 37.5,
    isLow: true,
    isCritical: true,
  },
  {
    id: 's2',
    name: 'Tavuk Eti',
    category: 'et',
    unit: 'kg',
    currentStock: 12,
    theoreticalStock: 14,
    minStock: 8,
    maxStock: 40,
    unitCost: 180,
    lastUpdated: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    fireRate: 14.3,
    isLow: false,
    isCritical: false,
  },
  {
    id: 's3',
    name: 'Ayran',
    category: 'icecek',
    unit: 'adet',
    currentStock: 15,
    theoreticalStock: 18,
    minStock: 20,
    maxStock: 100,
    unitCost: 8,
    lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    fireRate: 16.7,
    isLow: true,
    isCritical: false,
  },
  {
    id: 's4',
    name: 'Cola 330ml',
    category: 'icecek',
    unit: 'adet',
    currentStock: 48,
    theoreticalStock: 50,
    minStock: 30,
    maxStock: 200,
    unitCost: 15,
    lastUpdated: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    fireRate: 4,
    isLow: false,
    isCritical: false,
  },
  {
    id: 's5',
    name: 'Lavash Ekmek',
    category: 'diger',
    unit: 'adet',
    currentStock: 85,
    theoreticalStock: 90,
    minStock: 50,
    maxStock: 300,
    unitCost: 3,
    lastUpdated: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    fireRate: 5.6,
    isLow: false,
    isCritical: false,
  },
  {
    id: 's6',
    name: 'Domates',
    category: 'sebze',
    unit: 'kg',
    currentStock: 8,
    theoreticalStock: 10,
    minStock: 5,
    maxStock: 30,
    unitCost: 35,
    lastUpdated: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    fireRate: 20,
    isLow: false,
    isCritical: false,
  },
  {
    id: 's7',
    name: 'Sogan',
    category: 'sebze',
    unit: 'kg',
    currentStock: 6,
    theoreticalStock: 7,
    minStock: 3,
    maxStock: 20,
    unitCost: 25,
    lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    fireRate: 14.3,
    isLow: false,
    isCritical: false,
  },
  {
    id: 's8',
    name: 'Sumak',
    category: 'baharat',
    unit: 'kg',
    currentStock: 0.8,
    theoreticalStock: 1,
    minStock: 0.5,
    maxStock: 5,
    unitCost: 120,
    lastUpdated: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    fireRate: 20,
    isLow: false,
    isCritical: false,
  },
  {
    id: 's9',
    name: 'Paket Kutusu (Buyuk)',
    category: 'ambalaj',
    unit: 'adet',
    currentStock: 120,
    theoreticalStock: 125,
    minStock: 100,
    maxStock: 500,
    unitCost: 5,
    lastUpdated: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    fireRate: 4,
    isLow: false,
    isCritical: false,
  },
];

// Mock stock movements
const mockMovements: StockMovement[] = [
  {
    id: 'm1',
    itemId: 's1',
    itemName: 'Dana Eti (Doner)',
    type: 'out',
    quantity: 3,
    previousStock: 8,
    newStock: 5,
    reason: 'Gunluk tuketim',
    userId: 'u1',
    userName: 'Ahmet Yilmaz',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'm2',
    itemId: 's3',
    itemName: 'Ayran',
    type: 'out',
    quantity: 5,
    previousStock: 20,
    newStock: 15,
    reason: 'Siparis teslimati',
    userId: 'u1',
    userName: 'Ahmet Yilmaz',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'm3',
    itemId: 's4',
    itemName: 'Cola 330ml',
    type: 'in',
    quantity: 24,
    previousStock: 26,
    newStock: 50,
    reason: 'Tedarikci teslimati',
    userId: 'u2',
    userName: 'Mehmet Demir',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'm4',
    itemId: 's5',
    itemName: 'Lavash Ekmek',
    type: 'waste',
    quantity: 5,
    previousStock: 90,
    newStock: 85,
    reason: 'Bayat urunler',
    userId: 'u1',
    userName: 'Ahmet Yilmaz',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

// Movement type config
const MOVEMENT_TYPE_CONFIG = {
  in: { label: 'Giris', color: 'text-success', bgColor: 'bg-success/10', icon: '+' },
  out: { label: 'Cikis', color: 'text-info', bgColor: 'bg-info/10', icon: '-' },
  adjustment: { label: 'Duzeltme', color: 'text-warning', bgColor: 'bg-warning/10', icon: '~' },
  waste: { label: 'Fire', color: 'text-destructive', bgColor: 'bg-destructive/10', icon: '!' },
};

// Sort options
type SortField = 'name' | 'currentStock' | 'fireRate' | 'lastUpdated';
type SortDirection = 'asc' | 'desc';

export default function StockPage() {
  useRequireAuth();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<StockCategory | 'all'>('all');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showMovements, setShowMovements] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

  // Fetch stock data
  const { data: stockData, isLoading, refetch } = useQuery<StockResponse>({
    queryKey: ['stock', selectedCategory, showLowOnly, showCriticalOnly],
    queryFn: async () => {
      try {
        const params: Record<string, string | boolean> = {};
        if (selectedCategory !== 'all') params.category = selectedCategory;
        if (showLowOnly) params.isLow = true;
        if (showCriticalOnly) params.isCritical = true;
        const response = await api.get<StockResponse>('/stock', { params });
        return response.data;
      } catch {
        return {
          items: mockStockItems,
          total: mockStockItems.length,
          page: 1,
          limit: 50,
          totalPages: 1,
        };
      }
    },
  });

  // Fetch movement history
  const { data: movementsData } = useQuery<StockMovement[]>({
    queryKey: ['stock-movements', selectedItem?.id],
    queryFn: async () => {
      if (!selectedItem) return mockMovements;
      try {
        const response = await api.get<StockMovement[]>(`/stock/${selectedItem.id}/movements`);
        return response.data;
      } catch {
        return mockMovements.filter(m => m.itemId === selectedItem.id);
      }
    },
    enabled: !!selectedItem || showMovements,
  });

  const stockItems = stockData?.items || mockStockItems;
  const movements = movementsData || mockMovements;

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let items = [...stockItems];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      items = items.filter(item => item.category === selectedCategory);
    }

    // Low stock filter
    if (showLowOnly) {
      items = items.filter(item => item.isLow);
    }

    // Critical stock filter
    if (showCriticalOnly) {
      items = items.filter(item => item.isCritical);
    }

    // Sort
    items.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'tr');
          break;
        case 'currentStock':
          comparison = a.currentStock - b.currentStock;
          break;
        case 'fireRate':
          comparison = (a.fireRate || 0) - (b.fireRate || 0);
          break;
        case 'lastUpdated':
          comparison = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [stockItems, searchQuery, selectedCategory, showLowOnly, showCriticalOnly, sortField, sortDirection]);

  // Summary stats
  const stats = useMemo(() => {
    const total = stockItems.length;
    const low = stockItems.filter(i => i.isLow).length;
    const critical = stockItems.filter(i => i.isCritical).length;
    const totalValue = stockItems.reduce((sum, i) => sum + (i.currentStock * i.unitCost), 0);
    const avgFireRate = stockItems.reduce((sum, i) => sum + (i.fireRate || 0), 0) / total;

    return { total, low, critical, totalValue, avgFireRate };
  }, [stockItems]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Stock level indicator
  const getStockLevel = (item: StockItem) => {
    const percentage = (item.currentStock / item.maxStock) * 100;
    if (item.isCritical) return { color: 'bg-destructive', width: percentage };
    if (item.isLow) return { color: 'bg-warning', width: percentage };
    return { color: 'bg-success', width: percentage };
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stok Yonetimi</h1>
          <p className="text-muted-foreground">
            {filteredItems.length} urun listeleniyor
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showMovements ? 'secondary' : 'outline'}
            onClick={() => setShowMovements(!showMovements)}
          >
            <History className="h-4 w-4 mr-2" />
            Hareketler
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Toplam Urun</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className={stats.critical > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Kritik Stok</p>
                <p className={`text-2xl font-bold ${stats.critical > 0 ? 'text-destructive' : ''}`}>
                  {stats.critical}
                </p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${stats.critical > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </div>
          </CardContent>
        </Card>

        <Card className={stats.low > 0 ? 'border-warning/50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dusuk Stok</p>
                <p className={`text-2xl font-bold ${stats.low > 0 ? 'text-warning' : ''}`}>
                  {stats.low}
                </p>
              </div>
              <TrendingDown className={`h-8 w-8 ${stats.low > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stok Degeri</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                Ort. Fire: %{stats.avgFireRate.toFixed(1)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Urun ara..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category Filter */}
        <select
          className="px-3 py-2 border rounded-md bg-background text-sm"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as StockCategory | 'all')}
          aria-label="Kategori filtresi"
        >
          <option value="all">Tum Kategoriler</option>
          {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
            <option key={cat} value={cat}>
              {CATEGORY_ICONS[cat as StockCategory]} {label}
            </option>
          ))}
        </select>

        {/* Quick Filters */}
        <Button
          variant={showLowOnly ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => {
            setShowLowOnly(!showLowOnly);
            if (!showLowOnly) setShowCriticalOnly(false);
          }}
        >
          <TrendingDown className="h-4 w-4 mr-1" />
          Dusuk Stok
        </Button>

        <Button
          variant={showCriticalOnly ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => {
            setShowCriticalOnly(!showCriticalOnly);
            if (!showCriticalOnly) setShowLowOnly(false);
          }}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Kritik
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stock Table */}
        <Card className={`${showMovements ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('name')}
                      >
                        Urun
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left p-3">Kategori</th>
                    <th className="text-right p-3">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary ml-auto"
                        onClick={() => handleSort('currentStock')}
                      >
                        Mevcut Stok
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-right p-3">Teorik</th>
                    <th className="text-right p-3">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary ml-auto"
                        onClick={() => handleSort('fireRate')}
                      >
                        Fire
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-center p-3">Durum</th>
                    <th className="text-right p-3">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary ml-auto"
                        onClick={() => handleSort('lastUpdated')}
                      >
                        Son Guncelleme
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const level = getStockLevel(item);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b hover:bg-muted/30 cursor-pointer ${
                          item.isCritical ? 'bg-destructive/5' : item.isLow ? 'bg-warning/5' : ''
                        }`}
                        onClick={() => setSelectedItem(item)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{CATEGORY_ICONS[item.category]}</span>
                            <span className="font-medium">{item.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {CATEGORY_LABELS[item.category]}
                        </td>
                        <td className="p-3 text-right">
                          <div className="space-y-1">
                            <span className={`font-bold ${item.isCritical ? 'text-destructive' : item.isLow ? 'text-warning' : ''}`}>
                              {item.currentStock} {UNIT_LABELS[item.unit]}
                            </span>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${level.color} transition-all`}
                                style={{ width: `${Math.min(level.width, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right text-sm text-muted-foreground">
                          {item.theoreticalStock} {UNIT_LABELS[item.unit]}
                        </td>
                        <td className="p-3 text-right">
                          {item.fireRate !== undefined && (
                            <span className={`text-sm ${item.fireRate > 20 ? 'text-destructive' : item.fireRate > 10 ? 'text-warning' : 'text-muted-foreground'}`}>
                              %{item.fireRate.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {item.isCritical ? (
                            <span className="status-badge status-badge-destructive">Kritik</span>
                          ) : item.isLow ? (
                            <span className="status-badge status-badge-warning">Dusuk</span>
                          ) : (
                            <span className="status-badge status-badge-success">Normal</span>
                          )}
                        </td>
                        <td className="p-3 text-right text-sm text-muted-foreground">
                          {formatRelativeTime(item.lastUpdated)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Movement History Panel */}
        {showMovements && (
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Stok Hareketleri
              </CardTitle>
              <CardDescription>
                {selectedItem ? selectedItem.name : 'Son hareketler'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {movements.map((movement) => {
                  const config = MOVEMENT_TYPE_CONFIG[movement.type];
                  return (
                    <div
                      key={movement.id}
                      className={`p-3 rounded-lg ${config.bgColor}`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className={`font-medium ${config.color}`}>
                          {config.icon} {movement.quantity} {UNIT_LABELS[stockItems.find(i => i.id === movement.itemId)?.unit || 'adet']}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{movement.itemName}</p>
                      {movement.reason && (
                        <p className="text-xs text-muted-foreground mt-1">{movement.reason}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{movement.userName}</span>
                        <span>{formatRelativeTime(movement.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Item Detail Modal */}
      {selectedItem && !showMovements && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedItem(null)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{CATEGORY_ICONS[selectedItem.category]}</span>
                <div>
                  <CardTitle>{selectedItem.name}</CardTitle>
                  <CardDescription>{CATEGORY_LABELS[selectedItem.category]}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stock Level */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Mevcut Stok</span>
                  <span className="font-bold">
                    {selectedItem.currentStock} / {selectedItem.maxStock} {UNIT_LABELS[selectedItem.unit]}
                  </span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getStockLevel(selectedItem).color} transition-all`}
                    style={{ width: `${Math.min(getStockLevel(selectedItem).width, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Min: {selectedItem.minStock}</span>
                  <span>Max: {selectedItem.maxStock}</span>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Teorik Stok</p>
                  <p className="font-bold">{selectedItem.theoreticalStock} {UNIT_LABELS[selectedItem.unit]}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Fire Orani</p>
                  <p className={`font-bold ${(selectedItem.fireRate || 0) > 20 ? 'text-destructive' : ''}`}>
                    %{selectedItem.fireRate?.toFixed(1) || '0'}
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Birim Maliyet</p>
                  <p className="font-bold">{formatCurrency(selectedItem.unitCost)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Toplam Deger</p>
                  <p className="font-bold">{formatCurrency(selectedItem.currentStock * selectedItem.unitCost)}</p>
                </div>
              </div>

              {/* Last Updated */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Son guncelleme: {formatDateTime(selectedItem.lastUpdated)}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedItem(null)}
                >
                  Kapat
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setShowMovements(true);
                  }}
                >
                  <History className="h-4 w-4 mr-2" />
                  Hareketler
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

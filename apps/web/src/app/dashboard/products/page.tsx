'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Image,
  Tag,
  DollarSign,
  Package,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { useRequireAuth } from '@/hooks/useAuth';

// Mock categories
const mockCategories = [
  { id: '1', name: 'Donerler', slug: 'donerler', productCount: 8 },
  { id: '2', name: 'Iskenderler', slug: 'iskenderler', productCount: 4 },
  { id: '3', name: 'Pideler', slug: 'pideler', productCount: 6 },
  { id: '4', name: 'Lahmacunlar', slug: 'lahmacunlar', productCount: 3 },
  { id: '5', name: 'Icecekler', slug: 'icecekler', productCount: 12 },
  { id: '6', name: 'Tatlilar', slug: 'tatlilar', productCount: 5 },
];

// Mock products
const mockProducts = [
  {
    id: '1',
    name: 'Doner Durum',
    slug: 'doner-durum',
    categoryId: '1',
    category: 'Donerler',
    basePrice: 45,
    cost: 18,
    isActive: true,
    isAvailable: true,
    preparationTime: 8,
    description: 'Klasik dana doner durum',
    imageUrl: null,
  },
  {
    id: '2',
    name: 'Tavuk Doner',
    slug: 'tavuk-doner',
    categoryId: '1',
    category: 'Donerler',
    basePrice: 40,
    cost: 15,
    isActive: true,
    isAvailable: true,
    preparationTime: 8,
    description: 'Tavuk doner porsiyon',
    imageUrl: null,
  },
  {
    id: '3',
    name: 'Iskender',
    slug: 'iskender',
    categoryId: '2',
    category: 'Iskenderler',
    basePrice: 120,
    cost: 45,
    isActive: true,
    isAvailable: true,
    preparationTime: 12,
    description: 'Ozel sos ve tereyagi ile',
    imageUrl: null,
  },
  {
    id: '4',
    name: 'Lahmacun',
    slug: 'lahmacun',
    categoryId: '4',
    category: 'Lahmacunlar',
    basePrice: 25,
    cost: 8,
    isActive: true,
    isAvailable: false,
    preparationTime: 10,
    description: 'Ince hamur lahmacun',
    imageUrl: null,
  },
  {
    id: '5',
    name: 'Ayran',
    slug: 'ayran',
    categoryId: '5',
    category: 'Icecekler',
    basePrice: 12,
    cost: 4,
    isActive: true,
    isAvailable: true,
    preparationTime: 0,
    description: '300ml ayran',
    imageUrl: null,
  },
];

// Product Card
function ProductCard({
  product,
  onEdit,
  onToggleAvailability,
}: {
  product: typeof mockProducts[0];
  onEdit: (product: typeof mockProducts[0]) => void;
  onToggleAvailability: (productId: string, isAvailable: boolean) => void;
}) {
  const profit = product.basePrice - product.cost;
  const profitMargin = ((profit / product.basePrice) * 100).toFixed(1);

  return (
    <Card className={`${!product.isAvailable ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover rounded-lg" />
              ) : (
                <Package className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="font-bold">{product.name}</h3>
              <p className="text-sm text-muted-foreground">{product.category}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleAvailability(product.id, !product.isAvailable)}
          >
            {product.isAvailable ? (
              <ToggleRight className="h-5 w-5 text-success" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Pricing */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
          <div className="p-2 bg-muted/50 rounded text-center">
            <p className="text-muted-foreground">Fiyat</p>
            <p className="font-bold">{formatCurrency(product.basePrice)}</p>
          </div>
          <div className="p-2 bg-muted/50 rounded text-center">
            <p className="text-muted-foreground">Maliyet</p>
            <p className="font-bold">{formatCurrency(product.cost)}</p>
          </div>
          <div className="p-2 bg-success/10 rounded text-center">
            <p className="text-muted-foreground">Kar</p>
            <p className="font-bold text-success">%{profitMargin}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t">
          <span className="text-sm text-muted-foreground">
            {product.preparationTime > 0 ? `${product.preparationTime} dk` : 'Aninda'}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Product Form Modal
function ProductFormModal({
  product,
  categories,
  onClose,
  onSave,
}: {
  product: typeof mockProducts[0] | null;
  categories: typeof mockCategories;
  onClose: () => void;
  onSave: (data: Partial<typeof mockProducts[0]>) => void;
}) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    categoryId: product?.categoryId || categories[0]?.id || '',
    basePrice: product?.basePrice || 0,
    cost: product?.cost || 0,
    description: product?.description || '',
    preparationTime: product?.preparationTime || 10,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md mx-4 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-lg">
            {product ? 'Urun Duzenle' : 'Yeni Urun'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Urun Adi</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Kategori</label>
            <select
              className="w-full px-3 py-2 border rounded-md bg-background"
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Satis Fiyati (TL)</label>
              <Input
                type="number"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Maliyet (TL)</label>
              <Input
                type="number"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Hazirlama Suresi (dk)</label>
            <Input
              type="number"
              value={formData.preparationTime}
              onChange={(e) => setFormData({ ...formData, preparationTime: Number(e.target.value) })}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Aciklama</label>
            <textarea
              className="w-full px-3 py-2 border rounded-md bg-background resize-none"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Iptal
            </Button>
            <Button type="submit" className="flex-1">
              {product ? 'Guncelle' : 'Ekle'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  useRequireAuth();

  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [editingProduct, setEditingProduct] = useState<typeof mockProducts[0] | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch products
  const { data: productsData, isLoading, refetch } = useQuery({
    queryKey: ['products', selectedCategory, searchQuery],
    queryFn: async () => {
      try {
        const response = await api.get('/products');
        return response.data;
      } catch {
        return { products: mockProducts, categories: mockCategories };
      }
    },
  });

  // Toggle availability mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ productId, isAvailable }: { productId: string; isAvailable: boolean }) => {
      return api.patch(`/products/${productId}`, { isAvailable });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const products = productsData?.products || mockProducts;
  const categories = productsData?.categories || mockCategories;

  // Filter products
  const filteredProducts = products.filter((product: typeof mockProducts[0]) => {
    if (selectedCategory !== 'all' && product.categoryId !== selectedCategory) return false;
    if (searchQuery) {
      return product.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const handleToggleAvailability = (productId: string, isAvailable: boolean) => {
    toggleMutation.mutate({ productId, isAvailable });
  };

  const handleSaveProduct = (data: Partial<typeof mockProducts[0]>) => {
    // In real app, call API
    console.log('Save product:', data);
    setShowForm(false);
    setEditingProduct(null);
    refetch();
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Urunler</h1>
          <p className="text-muted-foreground">{products.length} urun</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Urun ara..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Urun
          </Button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('all')}
        >
          Tumu ({products.length})
        </Button>
        {categories.map((category: typeof mockCategories[0]) => (
          <Button
            key={category.id}
            variant={selectedCategory === category.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category.id)}
          >
            {category.name} ({category.productCount})
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts.map((product: typeof mockProducts[0]) => (
          <ProductCard
            key={product.id}
            product={product}
            onEdit={(p) => {
              setEditingProduct(p);
              setShowForm(true);
            }}
            onToggleAvailability={handleToggleAvailability}
          />
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Urun bulunamadi</p>
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          onClose={() => {
            setShowForm(false);
            setEditingProduct(null);
          }}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
}

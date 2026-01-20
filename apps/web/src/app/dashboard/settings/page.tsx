'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Store,
  Clock,
  Bell,
  Truck,
  CreditCard,
  Shield,
  Users,
  Save,
  RefreshCw,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Plus,
  Pencil,
  Trash2,
  X,
  Bike,
  Car,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { useRequireAuth } from '@/hooks/useAuth';

// Types
interface Courier {
  id: number;
  userId: number;
  branchId: number;
  status: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  totalDeliveries: number;
  performanceScore: number;
  cashBalance: string;
  isOnShift: boolean;
  user: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    status?: string;
  };
  branch: {
    id: number;
    name: string;
  };
}

interface CreateCourierData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  branchId: number;
  vehicleType?: string;
  vehiclePlate?: string;
}

interface UpdateCourierData {
  name?: string;
  phone?: string;
  password?: string;
  branchId?: number;
  vehicleType?: string;
  vehiclePlate?: string;
  isActive?: boolean;
}

// Settings sections
const SETTINGS_SECTIONS = [
  { id: 'general', label: 'Genel', icon: Store, description: 'Isletme bilgileri ve genel ayarlar' },
  { id: 'hours', label: 'Calisma Saatleri', icon: Clock, description: 'Acilis ve kapanis saatleri' },
  { id: 'delivery', label: 'Teslimat', icon: Truck, description: 'Teslimat bolgeleri ve ucretleri' },
  { id: 'couriers', label: 'Kuryeler', icon: Bike, description: 'Kurye yonetimi' },
  { id: 'notifications', label: 'Bildirimler', icon: Bell, description: 'Bildirim tercihleri' },
  { id: 'payments', label: 'Odeme', icon: CreditCard, description: 'Odeme yontemleri' },
  { id: 'users', label: 'Kullanicilar', icon: Users, description: 'Kullanici yonetimi' },
  { id: 'security', label: 'Guvenlik', icon: Shield, description: 'Sifre ve guvenlik ayarlari' },
];

// Mock settings data
const mockSettings = {
  general: {
    businessName: '312 Doner',
    phone: '0312 123 4567',
    email: 'info@312doner.com',
    address: 'Kizilay, Ankara',
    taxNumber: '1234567890',
  },
  hours: {
    monday: { open: '10:00', close: '23:00', isOpen: true },
    tuesday: { open: '10:00', close: '23:00', isOpen: true },
    wednesday: { open: '10:00', close: '23:00', isOpen: true },
    thursday: { open: '10:00', close: '23:00', isOpen: true },
    friday: { open: '10:00', close: '00:00', isOpen: true },
    saturday: { open: '10:00', close: '00:00', isOpen: true },
    sunday: { open: '11:00', close: '22:00', isOpen: true },
  },
  delivery: {
    minOrderAmount: 50,
    freeDeliveryThreshold: 150,
    baseDeliveryFee: 15,
    maxDeliveryDistance: 10,
    estimatedDeliveryTime: 45,
  },
  notifications: {
    newOrderSound: true,
    newOrderPush: true,
    lowStockAlert: true,
    dailyReport: true,
    emailNotifications: false,
  },
  payments: {
    acceptCash: true,
    acceptCard: true,
    acceptOnline: true,
    acceptMealCard: true,
  },
};

const DAYS = [
  { key: 'monday', label: 'Pazartesi' },
  { key: 'tuesday', label: 'Sali' },
  { key: 'wednesday', label: 'Carsamba' },
  { key: 'thursday', label: 'Persembe' },
  { key: 'friday', label: 'Cuma' },
  { key: 'saturday', label: 'Cumartesi' },
  { key: 'sunday', label: 'Pazar' },
];

const VEHICLE_TYPES = [
  { value: 'MOTORCYCLE', label: 'Motosiklet', icon: Bike },
  { value: 'BICYCLE', label: 'Bisiklet', icon: Bike },
  { value: 'CAR', label: 'Araba', icon: Car },
  { value: 'SCOOTER', label: 'Scooter', icon: Bike },
  { value: 'ON_FOOT', label: 'Yaya', icon: User },
];

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  ON_DELIVERY: 'bg-blue-100 text-blue-800',
  RETURNING: 'bg-yellow-100 text-yellow-800',
  OFFLINE: 'bg-gray-100 text-gray-800',
  ON_BREAK: 'bg-orange-100 text-orange-800',
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Musait',
  ON_DELIVERY: 'Teslimatta',
  RETURNING: 'Donuyor',
  OFFLINE: 'Cevrimdisi',
  ON_BREAK: 'Molada',
};

// User Types
interface UserData {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  branchId: number | null;
  createdAt: string;
}

interface CreateUserData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: string;
  branchId?: number;
}

interface UpdateUserData {
  name?: string;
  phone?: string;
  role?: string;
  password?: string;
  branchId?: number;
}

const USER_ROLES = [
  { value: 'ADMIN', label: 'Admin', description: 'Tam yetki' },
  { value: 'OPERATION_MANAGER', label: 'Operasyon Muduru', description: 'Operasyon yonetimi' },
  { value: 'BRANCH_MANAGER', label: 'Sube Muduru', description: 'Sube yonetimi' },
  { value: 'CASHIER', label: 'Kasiyer', description: 'Siparis alma' },
  { value: 'KITCHEN', label: 'Mutfak', description: 'Mutfak islemleri' },
  { value: 'ACCOUNTING', label: 'Muhasebe', description: 'Mali islemler' },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-800',
  OPERATION_MANAGER: 'bg-purple-100 text-purple-800',
  BRANCH_MANAGER: 'bg-blue-100 text-blue-800',
  CASHIER: 'bg-green-100 text-green-800',
  KITCHEN: 'bg-yellow-100 text-yellow-800',
  ACCOUNTING: 'bg-orange-100 text-orange-800',
  COURIER: 'bg-cyan-100 text-cyan-800',
};

// Courier Form Component
function CourierForm({
  courier,
  onSave,
  onCancel,
  isLoading,
}: {
  courier?: Courier;
  onSave: (data: CreateCourierData | UpdateCourierData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    email: courier?.user?.email || '',
    password: '',
    name: courier?.user?.name || '',
    phone: courier?.user?.phone || '',
    branchId: courier?.branchId || 1,
    vehicleType: courier?.vehicleType || 'MOTORCYCLE',
    vehiclePlate: courier?.vehiclePlate || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (courier) {
      // Update - only send changed fields
      const updateData: UpdateCourierData = {
        name: formData.name,
        phone: formData.phone || undefined,
        vehicleType: formData.vehicleType,
        vehiclePlate: formData.vehiclePlate || undefined,
        branchId: formData.branchId,
      };
      if (formData.password) {
        updateData.password = formData.password;
      }
      onSave(updateData);
    } else {
      // Create - send all required fields
      onSave(formData as CreateCourierData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Ad Soyad *</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ahmet Yilmaz"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">E-posta *</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="kurye@ornek.com"
            required
            disabled={!!courier}
          />
        </div>
        <div>
          <label className="text-sm font-medium">
            {courier ? 'Yeni Sifre (bos birakilabilir)' : 'Sifre *'}
          </label>
          <Input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="******"
            required={!courier}
            minLength={6}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Telefon</label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="05XX XXX XX XX"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Arac Tipi</label>
          <select
            value={formData.vehicleType}
            onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
            className="w-full h-10 px-3 border rounded-md bg-background"
          >
            {VEHICLE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Plaka</label>
          <Input
            value={formData.vehiclePlate}
            onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
            placeholder="34ABC123"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Iptal
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Kaydediliyor...' : courier ? 'Guncelle' : 'Olustur'}
        </Button>
      </div>
    </form>
  );
}

// Courier Settings Component
function CourierSettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Fetch couriers
  const { data: couriersData, isLoading } = useQuery({
    queryKey: ['couriers'],
    queryFn: async () => {
      const response = await api.get('/delivery/couriers');
      return response as unknown as { data: Courier[]; meta: { total: number } };
    },
  });

  // Create courier mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateCourierData) => {
      return api.post('/delivery/couriers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['couriers'] });
      setShowForm(false);
    },
  });

  // Update courier mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateCourierData }) => {
      return api.patch(`/delivery/couriers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['couriers'] });
      setEditingCourier(null);
    },
  });

  // Delete courier mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/delivery/couriers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['couriers'] });
      setDeleteConfirm(null);
    },
  });

  const handleSave = (data: CreateCourierData | UpdateCourierData) => {
    if (editingCourier) {
      updateMutation.mutate({ id: editingCourier.id, data: data as UpdateCourierData });
    } else {
      createMutation.mutate(data as CreateCourierData);
    }
  };

  const couriers = couriersData?.data || [];

  if (showForm || editingCourier) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">
            {editingCourier ? 'Kurye Duzenle' : 'Yeni Kurye'}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowForm(false);
              setEditingCourier(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CourierForm
          courier={editingCourier || undefined}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingCourier(null);
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Toplam {couriersData?.meta?.total || 0} kurye
        </p>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Yeni Kurye
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Yukleniyor...</div>
      ) : couriers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Bike className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Henuz kurye eklenmemis</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ilk Kuryeyi Ekle
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {couriers.map((courier) => (
            <div
              key={courier.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{courier.user.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {courier.user.email} {courier.user.phone && `• ${courier.user.phone}`}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[courier.status] || 'bg-gray-100'
                      }`}
                    >
                      {STATUS_LABELS[courier.status] || courier.status}
                    </span>
                    {courier.vehicleType && (
                      <span className="text-xs text-muted-foreground">
                        {VEHICLE_TYPES.find((v) => v.value === courier.vehicleType)?.label}
                        {courier.vehiclePlate && ` • ${courier.vehiclePlate}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <div className="font-medium">{courier.totalDeliveries} teslimat</div>
                  <div className="text-muted-foreground">Puan: {courier.performanceScore}</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingCourier(courier)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {deleteConfirm === courier.id ? (
                    <div className="flex gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(courier.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Sil
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Iptal
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(courier.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// User Form Component
function UserForm({
  user,
  onSave,
  onCancel,
  isLoading,
}: {
  user?: UserData;
  onSave: (data: CreateUserData | UpdateUserData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    password: '',
    name: user?.name || '',
    phone: user?.phone || '',
    role: user?.role || 'CASHIER',
    branchId: 1,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      const updateData: UpdateUserData = {
        name: formData.name,
        phone: formData.phone || undefined,
        role: formData.role,
        branchId: formData.branchId,
      };
      if (formData.password) {
        updateData.password = formData.password;
      }
      onSave(updateData);
    } else {
      onSave(formData as CreateUserData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Ad Soyad *</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ahmet Yilmaz"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">E-posta *</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="kullanici@ornek.com"
            required
            disabled={!!user}
          />
        </div>
        <div>
          <label className="text-sm font-medium">
            {user ? 'Yeni Sifre (bos birakilabilir)' : 'Sifre *'}
          </label>
          <Input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="******"
            required={!user}
            minLength={6}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Telefon</label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="05XX XXX XX XX"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Rol *</label>
          <select
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            className="w-full h-10 px-3 border rounded-md bg-background"
            required
          >
            {USER_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label} - {role.description}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Iptal
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Kaydediliyor...' : user ? 'Guncelle' : 'Olustur'}
        </Button>
      </div>
    </form>
  );
}

// User Settings Component
function UserSettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Fetch users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response as unknown as { items: UserData[]; meta: { total: number } };
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateUserData) => {
      return api.post('/users', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateUserData }) => {
      return api.put(`/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteConfirm(null);
    },
  });

  const handleSave = (data: CreateUserData | UpdateUserData) => {
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: data as UpdateUserData });
    } else {
      createMutation.mutate(data as CreateUserData);
    }
  };

  const users = usersData?.items || [];

  if (showForm || editingUser) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">
            {editingUser ? 'Kullanici Duzenle' : 'Yeni Kullanici'}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowForm(false);
              setEditingUser(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <UserForm
          user={editingUser || undefined}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingUser(null);
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Toplam {usersData?.meta?.total || 0} kullanici
        </p>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Yeni Kullanici
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Yukleniyor...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Henuz kullanici eklenmemis</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ilk Kullaniciyi Ekle
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {user.email} {user.phone && `• ${user.phone}`}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        ROLE_COLORS[user.role] || 'bg-gray-100'
                      }`}
                    >
                      {USER_ROLES.find((r) => r.value === user.role)?.label || user.role}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString('tr-TR')}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingUser(user)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {deleteConfirm === user.id ? (
                    <div className="flex gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(user.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Sil
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Iptal
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(user.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Settings Section Components
function GeneralSettings({ settings, onChange }: { settings: typeof mockSettings.general; onChange: (data: typeof mockSettings.general) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Isletme Adi</label>
          <Input
            value={settings.businessName}
            onChange={(e) => onChange({ ...settings, businessName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Telefon</label>
          <Input
            value={settings.phone}
            onChange={(e) => onChange({ ...settings, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">E-posta</label>
          <Input
            type="email"
            value={settings.email}
            onChange={(e) => onChange({ ...settings, email: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Vergi No</label>
          <Input
            value={settings.taxNumber}
            onChange={(e) => onChange({ ...settings, taxNumber: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Adres</label>
          <Input
            value={settings.address}
            onChange={(e) => onChange({ ...settings, address: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function HoursSettings({ settings, onChange }: { settings: typeof mockSettings.hours; onChange: (data: typeof mockSettings.hours) => void }) {
  return (
    <div className="space-y-3">
      {DAYS.map((day) => {
        const daySettings = settings[day.key as keyof typeof settings];
        return (
          <div key={day.key} className="flex items-center gap-4 p-3 border rounded-lg">
            <div className="w-24 font-medium">{day.label}</div>
            <button
              onClick={() => onChange({
                ...settings,
                [day.key]: { ...daySettings, isOpen: !daySettings.isOpen }
              })}
              className="flex items-center"
            >
              {daySettings.isOpen ? (
                <ToggleRight className="h-6 w-6 text-success" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-muted-foreground" />
              )}
            </button>
            {daySettings.isOpen && (
              <>
                <Input
                  type="time"
                  className="w-32"
                  value={daySettings.open}
                  onChange={(e) => onChange({
                    ...settings,
                    [day.key]: { ...daySettings, open: e.target.value }
                  })}
                />
                <span>-</span>
                <Input
                  type="time"
                  className="w-32"
                  value={daySettings.close}
                  onChange={(e) => onChange({
                    ...settings,
                    [day.key]: { ...daySettings, close: e.target.value }
                  })}
                />
              </>
            )}
            {!daySettings.isOpen && (
              <span className="text-muted-foreground">Kapali</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DeliverySettings({ settings, onChange }: { settings: typeof mockSettings.delivery; onChange: (data: typeof mockSettings.delivery) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Minimum Siparis Tutari (TL)</label>
          <Input
            type="number"
            value={settings.minOrderAmount}
            onChange={(e) => onChange({ ...settings, minOrderAmount: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Ucretsiz Teslimat Limiti (TL)</label>
          <Input
            type="number"
            value={settings.freeDeliveryThreshold}
            onChange={(e) => onChange({ ...settings, freeDeliveryThreshold: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Teslimat Ucreti (TL)</label>
          <Input
            type="number"
            value={settings.baseDeliveryFee}
            onChange={(e) => onChange({ ...settings, baseDeliveryFee: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Maksimum Mesafe (km)</label>
          <Input
            type="number"
            value={settings.maxDeliveryDistance}
            onChange={(e) => onChange({ ...settings, maxDeliveryDistance: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Tahmini Teslimat Suresi (dk)</label>
          <Input
            type="number"
            value={settings.estimatedDeliveryTime}
            onChange={(e) => onChange({ ...settings, estimatedDeliveryTime: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

function NotificationSettings({ settings, onChange }: { settings: typeof mockSettings.notifications; onChange: (data: typeof mockSettings.notifications) => void }) {
  const toggleItems = [
    { key: 'newOrderSound', label: 'Yeni siparis sesi' },
    { key: 'newOrderPush', label: 'Yeni siparis push bildirimi' },
    { key: 'lowStockAlert', label: 'Dusuk stok uyarisi' },
    { key: 'dailyReport', label: 'Gunluk rapor' },
    { key: 'emailNotifications', label: 'E-posta bildirimleri' },
  ];

  return (
    <div className="space-y-3">
      {toggleItems.map((item) => (
        <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
          <span>{item.label}</span>
          <button
            onClick={() => onChange({
              ...settings,
              [item.key]: !settings[item.key as keyof typeof settings]
            })}
          >
            {settings[item.key as keyof typeof settings] ? (
              <ToggleRight className="h-6 w-6 text-success" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

function PaymentSettings({ settings, onChange }: { settings: typeof mockSettings.payments; onChange: (data: typeof mockSettings.payments) => void }) {
  const paymentMethods = [
    { key: 'acceptCash', label: 'Nakit', icon: '💵' },
    { key: 'acceptCard', label: 'Kredi Karti', icon: '💳' },
    { key: 'acceptOnline', label: 'Online Odeme', icon: '🌐' },
    { key: 'acceptMealCard', label: 'Yemek Karti', icon: '🎫' },
  ];

  return (
    <div className="space-y-3">
      {paymentMethods.map((method) => (
        <div key={method.key} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{method.icon}</span>
            <span>{method.label}</span>
          </div>
          <button
            onClick={() => onChange({
              ...settings,
              [method.key]: !settings[method.key as keyof typeof settings]
            })}
          >
            {settings[method.key as keyof typeof settings] ? (
              <ToggleRight className="h-6 w-6 text-success" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  useRequireAuth();

  const [activeSection, setActiveSection] = useState('general');
  const [settings, setSettings] = useState(mockSettings);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch settings
  const { isLoading, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/settings');
        setSettings(response.data);
        return response.data;
      } catch {
        return mockSettings;
      }
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof settings) => {
      return api.put('/settings', data);
    },
    onSuccess: () => {
      setHasChanges(false);
    },
  });

  const handleChange = (section: keyof typeof mockSettings, data: typeof mockSettings[keyof typeof mockSettings]) => {
    setSettings({ ...settings, [section]: data });
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings settings={settings.general} onChange={(data) => handleChange('general', data)} />;
      case 'hours':
        return <HoursSettings settings={settings.hours} onChange={(data) => handleChange('hours', data)} />;
      case 'delivery':
        return <DeliverySettings settings={settings.delivery} onChange={(data) => handleChange('delivery', data)} />;
      case 'couriers':
        return <CourierSettings />;
      case 'notifications':
        return <NotificationSettings settings={settings.notifications} onChange={(data) => handleChange('notifications', data)} />;
      case 'payments':
        return <PaymentSettings settings={settings.payments} onChange={(data) => handleChange('payments', data)} />;
      case 'users':
        return <UserSettings />;
      default:
        return (
          <div className="text-center py-12 text-muted-foreground">
            <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Bu bolum yakin zamanda eklenecek</p>
          </div>
        );
    }
  };

  const activeSectionData = SETTINGS_SECTIONS.find(s => s.id === activeSection);
  const showSaveButton = hasChanges && activeSection !== 'couriers' && activeSection !== 'users';

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="md:w-64 space-y-2">
          <h1 className="text-2xl font-bold mb-4">Ayarlar</h1>
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{section.label}</span>
                <ChevronRight className="h-4 w-4 ml-auto" />
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{activeSectionData?.label}</CardTitle>
                  <CardDescription>{activeSectionData?.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {activeSection !== 'couriers' && activeSection !== 'users' && (
                    <Button variant="outline" size="icon" onClick={() => refetch()}>
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                  {showSaveButton && (
                    <Button onClick={handleSave} disabled={saveMutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      Kaydet
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderContent()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

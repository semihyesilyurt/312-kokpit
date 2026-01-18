// Type definitions for Kokpit application

// ============================================
// Auth Types
// ============================================
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'staff' | 'courier';
  branchId?: string;
  avatar?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

// ============================================
// Order Types
// ============================================
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'on_delivery'
  | 'delivering'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'online';

export type Platform = 'yemeksepeti' | 'getir' | 'trendyol' | 'migros' | 'phone' | 'walkin';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  options?: OrderItemOption[];
}

export interface OrderItemOption {
  name: string;
  value: string;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  platform: Platform;
  platformOrderId?: string;
  status: OrderStatus;
  customer: {
    name: string;
    phone: string;
    address: string;
    notes?: string;
  };
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  isPaid: boolean;
  courierId?: string;
  courierName?: string;
  estimatedDeliveryTime?: string;
  actualDeliveryTime?: string;
  preparedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFilters {
  status?: OrderStatus | OrderStatus[];
  platform?: Platform | Platform[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  courierId?: string;
  page?: number;
  limit?: number;
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// Stock Types
// ============================================
export type StockUnit = 'kg' | 'g' | 'lt' | 'ml' | 'adet' | 'porsiyon';

export type StockCategory = 'et' | 'sebze' | 'baharat' | 'icecek' | 'ambalaj' | 'diger';

export interface StockItem {
  id: string;
  name: string;
  category: StockCategory;
  unit: StockUnit;
  currentStock: number;
  theoreticalStock: number;
  minStock: number;
  maxStock: number;
  unitCost: number;
  lastUpdated: string;
  fireRate?: number; // Difference between current and theoretical
  isLow: boolean;
  isCritical: boolean;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out' | 'adjustment' | 'waste';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface StockFilters {
  category?: StockCategory;
  isLow?: boolean;
  isCritical?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface StockResponse {
  items: StockItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// Courier & Delivery Types
// ============================================
export type CourierStatus = 'available' | 'busy' | 'offline' | 'break';

export interface Courier {
  id: string;
  name: string;
  phone: string;
  status: CourierStatus;
  vehicleType: 'motorcycle' | 'bicycle' | 'car' | 'walk';
  currentLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
  activeDeliveries: number;
  todayDeliveries: number;
  cashBalance: number;
  rating: number;
  avatar?: string;
}

export interface DeliveryAssignment {
  orderId: string;
  courierId: string;
}

// ============================================
// Dashboard Types
// ============================================
export interface DashboardStats {
  todayOrders: number;
  todayOrdersTrend: number;
  todayRevenue: number;
  todayRevenueTrend: number;
  netProfit: number;
  netProfitTrend: number;
  avgDeliveryTime: number;
  avgDeliveryTimeTrend: number;
  activeCouriers: number;
  totalCouriers: number;
  pendingOrders: number;
  preparingOrders: number;
  deliveringOrders: number;
}

export interface PlatformDistribution {
  platform: Platform;
  count: number;
  percentage: number;
  revenue: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  platformDistribution: PlatformDistribution[];
  recentOrders: Order[];
  criticalStock: StockItem[];
  activeCouriers: Courier[];
}

// ============================================
// WebSocket Event Types
// ============================================
export interface WebSocketEvents {
  'order:new': Order;
  'order:updated': Order;
  'order:status': { orderId: string; status: OrderStatus };
  'courier:location': { courierId: string; lat: number; lng: number };
  'courier:status': { courierId: string; status: CourierStatus };
  'stock:alert': StockItem;
}

// ============================================
// API Response Types
// ============================================
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

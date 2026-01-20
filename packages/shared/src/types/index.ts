// ============================================================================
// ENUMS
// ============================================================================

/**
 * User roles within the Kokpit system
 */
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  BRANCH_MANAGER = 'branch_manager',
  KITCHEN_STAFF = 'kitchen_staff',
  CASHIER = 'cashier',
  COURIER = 'courier',
  CALL_CENTER = 'call_center',
}

/**
 * User account status
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

/**
 * Supported delivery platforms
 */
export enum Platform {
  YEMEKSEPETI = 'yemeksepeti',
  GETIR = 'getir',
  TRENDYOL = 'trendyol',
  MIGROS = 'migros',
  PHONE = 'phone',
  WEBSITE = 'website',
  POS = 'pos',
}

/**
 * Order lifecycle status
 */
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * Available payment methods
 */
export enum PaymentMethod {
  CASH = 'cash',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  ONLINE = 'online',
  PLATFORM_PAYMENT = 'platform_payment',
}

/**
 * Payment transaction status
 */
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

/**
 * Courier availability status
 */
export enum CourierStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  OFFLINE = 'offline',
  ON_BREAK = 'on_break',
}

/**
 * Stock movement types for inventory tracking
 */
export enum StockMovementType {
  IN = 'in',
  OUT = 'out',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer',
  WASTE = 'waste',
  RETURN = 'return',
}

/**
 * Customer loyalty status
 */
export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
  VIP = 'vip',
}

/**
 * Notification types for the system
 */
export enum NotificationType {
  ORDER_NEW = 'order_new',
  ORDER_STATUS = 'order_status',
  ORDER_CANCELLED = 'order_cancelled',
  STOCK_LOW = 'stock_low',
  STOCK_OUT = 'stock_out',
  COURIER_ASSIGNED = 'courier_assigned',
  PAYMENT_RECEIVED = 'payment_received',
  SYSTEM_ALERT = 'system_alert',
  PROMOTION = 'promotion',
}

/**
 * Notification delivery channels
 */
export enum NotificationChannel {
  PUSH = 'push',
  SMS = 'sms',
  EMAIL = 'email',
  IN_APP = 'in_app',
  WEBHOOK = 'webhook',
}

/**
 * Automation rule status
 */
export enum RuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft',
}

/**
 * Automation rule action types
 */
export enum RuleActionType {
  NOTIFY = 'notify',
  UPDATE_STATUS = 'update_status',
  ASSIGN_COURIER = 'assign_courier',
  APPLY_DISCOUNT = 'apply_discount',
  SEND_SMS = 'send_sms',
  SEND_EMAIL = 'send_email',
  CREATE_TASK = 'create_task',
  ESCALATE = 'escalate',
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Base interface for all entities with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User entity representing system users
 */
export interface User extends BaseEntity {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  branchId?: string;
  branch?: Branch;
  avatar?: string;
  lastLoginAt?: Date;
  passwordHash: string;
  refreshToken?: string;
  settings?: UserSettings;
}

/**
 * User settings and preferences
 */
export interface UserSettings {
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  theme: 'light' | 'dark' | 'system';
}

/**
 * Branch entity representing physical locations
 */
export interface Branch extends BaseEntity {
  name: string;
  code: string;
  address: Address;
  phone: string;
  email?: string;
  isActive: boolean;
  openingHours: OpeningHours;
  deliveryRadius: number;
  minOrderAmount: number;
  deliveryFee: number;
  taxRate: number;
  coordinates: Coordinates;
  platformConfigs?: PlatformConfig[];
  users?: User[];
}

/**
 * Address structure
 */
export interface Address {
  street: string;
  district: string;
  city: string;
  postalCode?: string;
  country: string;
  fullAddress: string;
  notes?: string;
}

/**
 * Geographic coordinates
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Opening hours configuration
 */
export interface OpeningHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

/**
 * Daily operating hours
 */
export interface DayHours {
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  breakStart?: string;
  breakEnd?: string;
}

/**
 * Order entity representing customer orders
 */
export interface Order extends BaseEntity {
  orderNumber: string;
  branchId: string;
  branch?: Branch;
  customerId?: string;
  customer?: Customer;
  courierId?: string;
  courier?: Courier;
  platform: Platform;
  platformOrderId?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryAddress?: Address;
  deliveryCoordinates?: Coordinates;
  notes?: string;
  customerNotes?: string;
  kitchenNotes?: string;
  estimatedDeliveryTime?: Date;
  actualDeliveryTime?: Date;
  preparedAt?: Date;
  assignedAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  rating?: number;
  feedback?: string;
}

/**
 * Order item representing a product in an order
 */
export interface OrderItem extends BaseEntity {
  orderId: string;
  productId: string;
  product?: Product;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  modifiers?: OrderItemModifier[];
}

/**
 * Order item modifier for customizations
 */
export interface OrderItemModifier {
  name: string;
  price: number;
  quantity: number;
}

/**
 * Product entity representing menu items
 */
export interface Product extends BaseEntity {
  name: string;
  description?: string;
  categoryId: string;
  category?: Category;
  price: number;
  discountedPrice?: number;
  image?: string;
  images?: string[];
  isActive: boolean;
  isAvailable: boolean;
  preparationTime: number;
  calories?: number;
  allergens?: string[];
  tags?: string[];
  recipe?: RecipeItem[];
  modifierGroups?: ModifierGroup[];
  sortOrder: number;
}

/**
 * Modifier group for product customizations
 */
export interface ModifierGroup {
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: Modifier[];
}

/**
 * Individual modifier option
 */
export interface Modifier {
  name: string;
  price: number;
  isDefault: boolean;
}

/**
 * Category entity for product organization
 */
export interface Category extends BaseEntity {
  name: string;
  description?: string;
  image?: string;
  parentId?: string;
  parent?: Category;
  children?: Category[];
  isActive: boolean;
  sortOrder: number;
  products?: Product[];
}

/**
 * Ingredient entity for inventory management
 */
export interface Ingredient extends BaseEntity {
  name: string;
  unit: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  maximumStock?: number;
  costPerUnit: number;
  supplierId?: string;
  isActive: boolean;
  expiryTracking: boolean;
}

/**
 * Recipe item linking products to ingredients
 */
export interface RecipeItem {
  ingredientId: string;
  ingredient?: Ingredient;
  quantity: number;
  unit: string;
  notes?: string;
}

/**
 * Stock item for branch-level inventory
 */
export interface StockItem extends BaseEntity {
  branchId: string;
  branch?: Branch;
  ingredientId: string;
  ingredient?: Ingredient;
  currentQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lastCountedAt?: Date;
  lastOrderedAt?: Date;
}

/**
 * Stock movement for inventory tracking
 */
export interface StockMovement extends BaseEntity {
  stockItemId: string;
  stockItem?: StockItem;
  branchId: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  performedBy: string;
  performedByUser?: User;
  notes?: string;
}

/**
 * Courier entity for delivery personnel
 */
export interface Courier extends BaseEntity {
  userId: string;
  user?: User;
  branchId: string;
  branch?: Branch;
  vehicleType: 'motorcycle' | 'bicycle' | 'car' | 'on_foot';
  vehiclePlate?: string;
  status: CourierStatus;
  currentLocation?: Coordinates;
  lastLocationUpdate?: Date;
  activeOrderId?: string;
  activeOrder?: Order;
  completedDeliveries: number;
  averageRating: number;
  totalRatings: number;
  isOnline: boolean;
}

/**
 * Customer entity for customer management
 */
export interface Customer extends BaseEntity {
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  status: CustomerStatus;
  addresses: CustomerAddress[];
  defaultAddressId?: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderAt?: Date;
  notes?: string;
  tags?: string[];
  loyaltyPoints: number;
  marketingConsent: boolean;
}

/**
 * Customer address with metadata
 */
export interface CustomerAddress extends Address {
  id: string;
  label: string;
  isDefault: boolean;
  coordinates?: Coordinates;
}

/**
 * Platform configuration for third-party integrations
 */
export interface PlatformConfig extends BaseEntity {
  branchId: string;
  branch?: Branch;
  platform: Platform;
  isEnabled: boolean;
  credentials: PlatformCredentials;
  settings: PlatformSettings;
  lastSyncAt?: Date;
  syncStatus?: 'synced' | 'error' | 'pending';
  syncError?: string;
}

/**
 * Platform API credentials (encrypted storage recommended)
 */
export interface PlatformCredentials {
  apiKey?: string;
  apiSecret?: string;
  merchantId?: string;
  storeId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

/**
 * Platform-specific settings
 */
export interface PlatformSettings {
  autoAccept: boolean;
  autoReject: boolean;
  syncMenu: boolean;
  syncStock: boolean;
  markupPercentage: number;
  preparationTimeBuffer: number;
  webhookUrl?: string;
}

/**
 * Automation rule entity
 */
export interface Rule extends BaseEntity {
  name: string;
  description?: string;
  branchId?: string;
  branch?: Branch;
  status: RuleStatus;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  executionCount: number;
  lastExecutedAt?: Date;
}

/**
 * Rule trigger configuration
 */
export interface RuleTrigger {
  event: string;
  source?: Platform | 'all';
}

/**
 * Rule condition for evaluation
 */
export interface RuleCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
  value: string | number | boolean | string[];
  logicalOperator?: 'and' | 'or';
}

/**
 * Rule action to execute
 */
export interface RuleAction {
  type: RuleActionType;
  params: Record<string, unknown>;
  delay?: number;
}

/**
 * Notification entity
 */
export interface Notification extends BaseEntity {
  userId?: string;
  user?: User;
  branchId?: string;
  branch?: Branch;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failureReason?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Date range filter
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Order filter parameters
 */
export interface OrderFilter {
  branchId?: string;
  platform?: Platform;
  status?: OrderStatus | OrderStatus[];
  paymentStatus?: PaymentStatus;
  dateRange?: DateRange;
  search?: string;
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  activeDeliveries: number;
  availableCouriers: number;
}

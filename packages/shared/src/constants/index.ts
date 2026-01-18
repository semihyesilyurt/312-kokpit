import { OrderStatus, Platform, UserRole } from '../types';

// ============================================================================
// ORDER STATUS TRANSITIONS
// ============================================================================

/**
 * Defines valid state transitions for order status.
 * Key: current status, Value: array of valid next statuses
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.PREPARING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PREPARING]: [
    OrderStatus.READY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED, // For pickup orders
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERED]: [
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.CANCELLED]: [
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.REFUNDED]: [],
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): boolean {
  const validTransitions = ORDER_STATUS_TRANSITIONS[currentStatus];
  return validTransitions.includes(newStatus);
}

/**
 * Get human-readable status label
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Beklemede',
  [OrderStatus.CONFIRMED]: 'Onaylandi',
  [OrderStatus.PREPARING]: 'Hazirlaniyor',
  [OrderStatus.READY]: 'Hazir',
  [OrderStatus.OUT_FOR_DELIVERY]: 'Yolda',
  [OrderStatus.DELIVERED]: 'Teslim Edildi',
  [OrderStatus.CANCELLED]: 'Iptal Edildi',
  [OrderStatus.REFUNDED]: 'Iade Edildi',
};

/**
 * Status colors for UI
 */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '#FFA500',
  [OrderStatus.CONFIRMED]: '#3B82F6',
  [OrderStatus.PREPARING]: '#8B5CF6',
  [OrderStatus.READY]: '#10B981',
  [OrderStatus.OUT_FOR_DELIVERY]: '#06B6D4',
  [OrderStatus.DELIVERED]: '#22C55E',
  [OrderStatus.CANCELLED]: '#EF4444',
  [OrderStatus.REFUNDED]: '#6B7280',
};

// ============================================================================
// ROLE PERMISSIONS
// ============================================================================

/**
 * Permission identifiers for the system
 */
export const PERMISSIONS = {
  // Order permissions
  ORDER_VIEW: 'order:view',
  ORDER_CREATE: 'order:create',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REFUND: 'order:refund',
  ORDER_ASSIGN: 'order:assign',

  // Product permissions
  PRODUCT_VIEW: 'product:view',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',

  // Category permissions
  CATEGORY_VIEW: 'category:view',
  CATEGORY_MANAGE: 'category:manage',

  // Stock permissions
  STOCK_VIEW: 'stock:view',
  STOCK_UPDATE: 'stock:update',
  STOCK_TRANSFER: 'stock:transfer',
  STOCK_ADJUST: 'stock:adjust',

  // User permissions
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  // Branch permissions
  BRANCH_VIEW: 'branch:view',
  BRANCH_MANAGE: 'branch:manage',
  BRANCH_ALL: 'branch:all',

  // Courier permissions
  COURIER_VIEW: 'courier:view',
  COURIER_MANAGE: 'courier:manage',
  COURIER_TRACK: 'courier:track',

  // Customer permissions
  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_MANAGE: 'customer:manage',

  // Report permissions
  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',
  REPORT_FINANCIAL: 'report:financial',

  // Settings permissions
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',

  // Platform permissions
  PLATFORM_VIEW: 'platform:view',
  PLATFORM_MANAGE: 'platform:manage',

  // Notification permissions
  NOTIFICATION_VIEW: 'notification:view',
  NOTIFICATION_MANAGE: 'notification:manage',

  // Rule permissions
  RULE_VIEW: 'rule:view',
  RULE_MANAGE: 'rule:manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Role-based permission mappings
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [UserRole.BRANCH_MANAGER]: [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.ORDER_REFUND,
    PERMISSIONS.ORDER_ASSIGN,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.CATEGORY_VIEW,
    PERMISSIONS.CATEGORY_MANAGE,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_UPDATE,
    PERMISSIONS.STOCK_TRANSFER,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.BRANCH_VIEW,
    PERMISSIONS.COURIER_VIEW,
    PERMISSIONS.COURIER_MANAGE,
    PERMISSIONS.COURIER_TRACK,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.PLATFORM_VIEW,
    PERMISSIONS.PLATFORM_MANAGE,
    PERMISSIONS.NOTIFICATION_VIEW,
    PERMISSIONS.NOTIFICATION_MANAGE,
    PERMISSIONS.RULE_VIEW,
    PERMISSIONS.RULE_MANAGE,
  ],

  [UserRole.KITCHEN_STAFF]: [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],

  [UserRole.CASHIER]: [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_MANAGE,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],

  [UserRole.COURIER]: [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.COURIER_VIEW,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],

  [UserRole.CALL_CENTER]: [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_MANAGE,
    PERMISSIONS.COURIER_VIEW,
    PERMISSIONS.COURIER_TRACK,
    PERMISSIONS.NOTIFICATION_VIEW,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}

// ============================================================================
// PLATFORM COMMISSION RATES
// ============================================================================

/**
 * Commission rates for each platform (percentage)
 */
export const PLATFORM_COMMISSION_RATES: Record<Platform, number> = {
  [Platform.YEMEKSEPETI]: 25.0,
  [Platform.GETIR]: 28.0,
  [Platform.TRENDYOL]: 20.0,
  [Platform.MIGROS]: 22.0,
  [Platform.PHONE]: 0.0,
  [Platform.WEBSITE]: 0.0,
  [Platform.POS]: 0.0,
};

/**
 * Platform display names
 */
export const PLATFORM_LABELS: Record<Platform, string> = {
  [Platform.YEMEKSEPETI]: 'Yemeksepeti',
  [Platform.GETIR]: 'Getir Yemek',
  [Platform.TRENDYOL]: 'Trendyol Yemek',
  [Platform.MIGROS]: 'Migros Yemek',
  [Platform.PHONE]: 'Telefon',
  [Platform.WEBSITE]: 'Website',
  [Platform.POS]: 'POS',
};

/**
 * Platform colors for UI
 */
export const PLATFORM_COLORS: Record<Platform, string> = {
  [Platform.YEMEKSEPETI]: '#FA0050',
  [Platform.GETIR]: '#5D3EBC',
  [Platform.TRENDYOL]: '#F27A1A',
  [Platform.MIGROS]: '#FF6600',
  [Platform.PHONE]: '#3B82F6',
  [Platform.WEBSITE]: '#10B981',
  [Platform.POS]: '#6B7280',
};

/**
 * Calculate commission amount for an order
 */
export function calculateCommission(platform: Platform, orderTotal: number): number {
  const rate = PLATFORM_COMMISSION_RATES[platform];
  return Number(((orderTotal * rate) / 100).toFixed(2));
}

/**
 * Calculate net amount after commission
 */
export function calculateNetAmount(platform: Platform, orderTotal: number): number {
  const commission = calculateCommission(platform, orderTotal);
  return Number((orderTotal - commission).toFixed(2));
}

// ============================================================================
// OTHER CONSTANTS
// ============================================================================

/**
 * Default pagination values
 */
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * Order timing constants (in minutes)
 */
export const ORDER_TIMING = {
  DEFAULT_PREPARATION_TIME: 20,
  DEFAULT_DELIVERY_TIME: 30,
  LATE_THRESHOLD: 15,
  CRITICAL_THRESHOLD: 30,
} as const;

/**
 * Stock alert thresholds
 */
export const STOCK_THRESHOLDS = {
  LOW_STOCK_PERCENTAGE: 20,
  CRITICAL_STOCK_PERCENTAGE: 10,
} as const;

/**
 * Currency configuration
 */
export const CURRENCY = {
  CODE: 'TRY',
  SYMBOL: '\u20BA',
  LOCALE: 'tr-TR',
  DECIMAL_PLACES: 2,
} as const;

/**
 * Date format patterns
 */
export const DATE_FORMATS = {
  DATE: 'dd.MM.yyyy',
  TIME: 'HH:mm',
  DATETIME: 'dd.MM.yyyy HH:mm',
  DATETIME_FULL: 'dd.MM.yyyy HH:mm:ss',
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
} as const;

/**
 * User role labels in Turkish
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.BRANCH_MANAGER]: 'Sube Muduru',
  [UserRole.KITCHEN_STAFF]: 'Mutfak Personeli',
  [UserRole.CASHIER]: 'Kasiyer',
  [UserRole.COURIER]: 'Kurye',
  [UserRole.CALL_CENTER]: 'Cagri Merkezi',
};

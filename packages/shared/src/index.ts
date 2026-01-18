/**
 * @kokpit/shared
 *
 * Shared TypeScript package for Kokpit restaurant management system.
 * Contains types, constants, and utilities used across all applications.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types - All enums and interfaces
// ============================================================================
export {
  // Enums
  UserRole,
  UserStatus,
  Platform,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  CourierStatus,
  StockMovementType,
  CustomerStatus,
  NotificationType,
  NotificationChannel,
  RuleStatus,
  RuleActionType,
  // Core Interfaces
  BaseEntity,
  User,
  UserSettings,
  Branch,
  Address,
  Coordinates,
  OpeningHours,
  DayHours,
  Order,
  OrderItem,
  OrderItemModifier,
  Product,
  ModifierGroup,
  Modifier,
  Category,
  Ingredient,
  RecipeItem,
  StockItem,
  StockMovement,
  Courier,
  Customer,
  CustomerAddress,
  PlatformConfig,
  PlatformCredentials,
  PlatformSettings,
  Rule,
  RuleTrigger,
  RuleCondition,
  RuleAction,
  Notification,
  // Utility Types
  PaginationParams,
  PaginatedResponse,
  ApiResponse,
  ApiError,
  DateRange,
  OrderFilter,
  DashboardStats,
} from './types';

// ============================================================================
// Constants - Status transitions, permissions, rates
// ============================================================================
export {
  // Order Status
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  isValidStatusTransition,
  // Permissions
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  getRolePermissions,
  // Platform
  PLATFORM_COMMISSION_RATES,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  calculateCommission,
  calculateNetAmount,
  // Other Constants
  PAGINATION_DEFAULTS,
  ORDER_TIMING,
  STOCK_THRESHOLDS,
  CURRENCY,
  DATE_FORMATS,
  USER_ROLE_LABELS,
} from './constants';

export type { Permission } from './constants';

// ============================================================================
// Utilities - Helper functions
// ============================================================================
export {
  // Order utilities
  generateOrderNumber,
  generateUniqueId,
  // Distance utilities
  calculateDistance,
  isWithinRadius,
  estimateDeliveryTime,
  // Currency utilities
  formatCurrency,
  parseCurrency,
  formatPercentage,
  // Date utilities
  formatDate,
  startOfDay,
  endOfDay,
  isToday,
  addMinutes,
  // Validation utilities
  isValidTurkishPhone,
  formatTurkishPhone,
  isValidEmail,
  // String utilities
  truncate,
  capitalizeWords,
  slugify,
  // Object utilities
  deepClone,
  pick,
  omit,
  isEmpty,
} from './utils';

export type { CurrencyFormatOptions, DateFormatType } from './utils';

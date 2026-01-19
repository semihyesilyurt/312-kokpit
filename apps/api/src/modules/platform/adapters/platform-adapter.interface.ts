/**
 * Platform Adapter Interface
 * Standardized interface for external platform integrations
 * Implementations: GetirAdapter, YemeksepetiAdapter, TrendyolAdapter
 */

import { Platform, OrderStatus } from '@prisma/client';

/**
 * Order data received from external platform
 */
export interface PlatformOrder {
  platformOrderId: string;
  platformDisplayId?: string; // Platform's visible order number (e.g., Trendyol orderCode, Getir confirmationId)
  platform: Platform;
  platformStatus?: OrderStatus; // Status from platform (mapped to internal status)
  customer: {
    name: string;
    phone: string;
    address: string;
    latitude?: number;
    longitude?: number;
    note?: string;
  };
  items: Array<{
    platformProductId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  totalAmount: number;
  paymentMethod: 'CASH' | 'CREDIT_CARD' | 'ONLINE';
  estimatedDeliveryMinutes?: number;
  createdAt: Date;
}

/**
 * Product data for menu sync
 */
export interface PlatformProduct {
  platformProductId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  categoryName?: string;
}

/**
 * Restaurant status on platform
 */
export interface RestaurantStatus {
  isOpen: boolean;
  isBusy: boolean;
  estimatedDeliveryTime?: number;
  pauseReason?: string;
}

/**
 * Sync result for logging
 */
export interface SyncResult {
  success: boolean;
  recordsCount: number;
  duration: number;
  errorMessage?: string;
  data?: unknown;
}

/**
 * Platform Adapter Interface
 * All platform integrations must implement this interface
 */
export interface PlatformAdapter {
  /**
   * Platform identifier
   */
  readonly platform: Platform;

  /**
   * Fetch new orders from the platform
   * @returns Array of platform orders
   */
  fetchOrders(): Promise<PlatformOrder[]>;

  /**
   * Accept an order on the platform
   * @param platformOrderId - Platform's order ID
   * @param estimatedMinutes - Estimated preparation time
   */
  acceptOrder(platformOrderId: string, estimatedMinutes?: number): Promise<boolean>;

  /**
   * Reject an order on the platform
   * @param platformOrderId - Platform's order ID
   * @param reason - Rejection reason
   */
  rejectOrder(platformOrderId: string, reason: string): Promise<boolean>;

  /**
   * Update order status on the platform
   * @param platformOrderId - Platform's order ID
   * @param status - New status
   */
  updateOrderStatus(platformOrderId: string, status: OrderStatus): Promise<boolean>;

  /**
   * Sync menu to the platform
   * @param products - Products to sync
   */
  syncMenu(products: PlatformProduct[]): Promise<SyncResult>;

  /**
   * Set restaurant status on platform (open/close/busy)
   * @param status - Restaurant status
   */
  setRestaurantStatus(status: RestaurantStatus): Promise<boolean>;

  /**
   * Get current restaurant status from platform
   */
  getRestaurantStatus(): Promise<RestaurantStatus>;

  /**
   * Verify API credentials are valid
   */
  verifyCredentials(): Promise<boolean>;
}

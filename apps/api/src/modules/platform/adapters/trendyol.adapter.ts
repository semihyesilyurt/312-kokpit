/**
 * Trendyol GO Yemek Platform Adapter
 * Real implementation for Trendyol GO Yemek Partner Portal integration
 * - Playwright-based login (Cloudflare protection bypass)
 * - JWT token-based API authentication
 * - 10-second order polling
 * - Order status synchronization
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Platform, OrderStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  PlatformAdapter,
  PlatformOrder,
  PlatformProduct,
  RestaurantStatus,
  SyncResult,
} from './platform-adapter.interface';

/**
 * Trendyol API response types
 */
interface TrendyolLoginResponse {
  refreshToken: string;
  token: string; // API returns 'token' not 'accessToken'
  accessToken?: string; // Some endpoints may use accessToken
}

/**
 * Trendyol order line item (nested in orderLines)
 */
interface TrendyolOrderLineItem {
  id: number;
  status: string;
  packageItemId: string;
  isCancelled: boolean;
}

/**
 * Trendyol modifier product (portion/size info)
 */
interface TrendyolModifierProduct {
  id: number;
  modifierGroupId?: number;
  name: string;
  price: number;
  count?: number;
}

/**
 * Trendyol order line (product)
 */
interface TrendyolOrderLine {
  id: number;
  name: string;
  orderLineItems: TrendyolOrderLineItem[];
  isClaimRateExceeded?: boolean;
  // Price can be in various fields depending on API version
  price?: number;
  productPrice?: number;
  salePrice?: number;
  unitPrice?: number;
  totalPrice?: number;
  amount?: number;
  quantity?: number;
  // Modifier and ingredient info from detail endpoint
  modifierProducts?: TrendyolModifierProduct[];
  extraIngredients?: string[];
  removedIngredients?: string[];
  description?: string;
}

/**
 * Trendyol order payment info
 */
interface TrendyolOrderPayment {
  paymentType: string; // 'PAY_WITH_CARD', 'PAY_AT_DOOR_WITH_CASH', etc.
  mealCard: string | null;
  onDelivery: string | null;
}

/**
 * Trendyol delivery address info
 */
interface TrendyolDeliveryAddress {
  id?: number;
  address?: string;
  description?: string;
  doorDescription?: string;
  buildingNo?: string;
  apartmentNo?: string;
  floor?: string;
  district?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Trendyol customer info
 */
interface TrendyolCustomer {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  sellerBasedNewUser?: boolean;
  // Extended address fields
  deliveryAddress?: TrendyolDeliveryAddress;
  addressDescription?: string;
}

/**
 * Trendyol order structure (actual API response)
 */
interface TrendyolOrder {
  orderId: number;
  orderCode: string;
  packageId: string;
  orderParentId: number;
  orderStatus: string;
  totalOrderPrice: number;
  packageCreationDate: number; // Unix timestamp in milliseconds
  customer: TrendyolCustomer;
  orderLines: TrendyolOrderLine[];
  orderPayment: TrendyolOrderPayment;
  deliveryType: 'GO' | 'PICKUP';
  eta?: string;
  preparationTime?: number;
  estimatedDeliveryEndDate?: number;
  // Note and address fields
  orderNote?: string;
  customerNote?: string;
  note?: string;
  notes?: string;
  deliveryNote?: string;
  description?: string;
  addressDescription?: string;
  deliveryAddress?: TrendyolDeliveryAddress;
  // Legacy fields for backward compatibility
  id?: string;
  packageId_legacy?: string;
  orderNumber?: string;
  status?: string;
  totalAmount?: number;
  createdAt?: string;
  items?: { id: string; name: string; productName: string; quantity: number; price: number; notes?: string }[];
  paymentMethod?: string;
}

interface TrendyolActiveOrdersResponse {
  newOrders: TrendyolOrder[];
  pickedOrders: TrendyolOrder[];
  invoicedOrders: TrendyolOrder[];
  shippedOrders: TrendyolOrder[];
  cancelledPackageIds: string[];
}

/**
 * Trendyol status to internal status mapping
 */
const TRENDYOL_STATUS_MAP: Record<string, OrderStatus> = {
  NEW: 'PENDING',
  PICKED: 'PREPARING',
  INVOICED: 'READY',
  SHIPPED: 'ON_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/**
 * Internal status to Trendyol status mapping
 */
const INTERNAL_TO_TRENDYOL_STATUS: Record<string, string> = {
  PENDING: 'NEW',
  CONFIRMED: 'PICKED',
  PREPARING: 'PICKED',
  READY: 'INVOICED',
  ON_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/**
 * Trendyol commission rate (20%)
 */
const TRENDYOL_COMMISSION_RATE = 20;

@Injectable()
export class TrendyolAdapter implements PlatformAdapter, OnModuleInit {
  private readonly logger = new Logger(TrendyolAdapter.name);
  readonly platform = Platform.TRENDYOL;

  // API Configuration
  private readonly baseUrl = 'https://api-venus.tgoapis.com/order-meal-seller-order-gw-service';
  private readonly baseUrl2 = 'https://api.tgoapis.com';
  private readonly partnerPortal = 'https://partner.tgoyemek.com';

  // Store Configuration (312 Döner & Izgara)
  private readonly sellerId = 953726;
  private readonly storeId = 279757;

  // Credentials
  private readonly email = 'newness.pinch@gmail.com';
  private readonly password = '1Viz2yon3*';

  // Token cache
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private isLoggingIn = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize adapter on module start
   */
  async onModuleInit() {
    this.logger.log('Trendyol GO Yemek adapter initialized');
    await this.checkAndRefreshLogin();
  }

  /**
   * Check if login is needed and perform automatic login
   */
  async checkAndRefreshLogin(): Promise<void> {
    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.TRENDYOL },
      });

      // If no config or token expired, perform login
      if (!config?.accessToken || !config?.tokenExpiresAt) {
        this.logger.log('No Trendyol token found, initiating automatic login...');
        await this.performAutomaticLogin();
        return;
      }

      // Check if token will expire in the next 30 minutes
      const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
      if (config.tokenExpiresAt < thirtyMinutesFromNow) {
        this.logger.log('Trendyol token expiring soon, performing login...');
        await this.performAutomaticLogin();
      } else {
        // Load cached token
        this.accessToken = config.accessToken;
        this.refreshToken = config.refreshToken;
        this.tokenExpiresAt = config.tokenExpiresAt;
        this.logger.log('Trendyol token loaded from database');
      }
    } catch (error) {
      this.logger.error(`Login check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform automatic login using direct API calls
   * GO Yemek uses 2-step login: login-attempt then login-without-otp
   */
  async performAutomaticLogin(): Promise<boolean> {
    if (this.isLoggingIn) {
      this.logger.debug('Login already in progress, skipping...');
      return false;
    }

    this.isLoggingIn = true;

    try {
      this.logger.log('Starting automatic Trendyol GO Yemek API login...');

      // Step 1: Login attempt (check if 2FA is required)
      const attemptResponse = await fetch(
        `${this.baseUrl2}/localcommerce-seller-seller-center-account-bff-service/user/login-attempt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
          }),
        },
      );

      if (!attemptResponse.ok) {
        const errorText = await attemptResponse.text();
        throw new Error(`Login attempt failed: ${attemptResponse.status} - ${errorText.substring(0, 200)}`);
      }

      const attemptData = await attemptResponse.json();

      // Check if 2FA is required
      if (attemptData.twoFactorAuthenticationEnabled) {
        throw new Error('2FA is enabled on this account. Please disable it in GO Yemek settings.');
      }

      this.logger.debug('Login attempt successful, no 2FA required');

      // Step 2: Login without OTP
      const loginResponse = await fetch(
        `${this.baseUrl2}/localcommerce-seller-seller-center-account-bff-service/user/login-without-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
          }),
        },
      );

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`Login failed: ${loginResponse.status} - ${errorText.substring(0, 200)}`);
      }

      const loginData: TrendyolLoginResponse = await loginResponse.json();

      // API returns 'token' field, not 'accessToken'
      const accessToken = loginData.token || loginData.accessToken;

      if (!accessToken) {
        throw new Error('No access token in login response');
      }

      // Store tokens
      await this.storeTokens(accessToken, loginData.refreshToken);

      // Update sync status
      await this.prisma.platformConfig.update({
        where: { platform: Platform.TRENDYOL },
        data: {
          syncStatus: 'success',
          syncError: null,
        },
      });

      this.logger.log('Trendyol GO Yemek API login successful!');
      return true;
    } catch (error) {
      this.logger.error(`Automatic login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Update platform config with error status
      await this.prisma.platformConfig.upsert({
        where: { platform: Platform.TRENDYOL },
        update: {
          syncStatus: 'login_failed',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
        create: {
          platform: Platform.TRENDYOL,
          commissionRate: TRENDYOL_COMMISSION_RATE,
          syncStatus: 'login_failed',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return false;
    } finally {
      this.isLoggingIn = false;
    }
  }

  /**
   * Get API request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: this.partnerPortal,
      Referer: `${this.partnerPortal}/`,
    };
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<string> {
    // Check if token is still valid (with 5-minute buffer)
    if (this.accessToken && this.tokenExpiresAt) {
      const bufferTime = 5 * 60 * 1000;
      if (new Date().getTime() < this.tokenExpiresAt.getTime() - bufferTime) {
        return this.accessToken;
      }
    }

    // Load token from database
    const config = await this.prisma.platformConfig.findUnique({
      where: { platform: Platform.TRENDYOL },
    });

    if (!config) {
      const loginSuccess = await this.performAutomaticLogin();
      if (loginSuccess && this.accessToken) {
        return this.accessToken;
      }
      throw new Error('Trendyol platform configuration not found and automatic login failed');
    }

    // Check database token validity
    if (config.accessToken && config.tokenExpiresAt) {
      const bufferTime = 5 * 60 * 1000;
      if (new Date().getTime() < config.tokenExpiresAt.getTime() - bufferTime) {
        this.accessToken = config.accessToken;
        this.refreshToken = config.refreshToken;
        this.tokenExpiresAt = config.tokenExpiresAt;
        return this.accessToken;
      }
    }

    // Token expired - perform new login
    this.logger.log('Token expired, performing automatic login...');
    const loginSuccess = await this.performAutomaticLogin();
    if (loginSuccess && this.accessToken) {
      return this.accessToken;
    }

    throw new Error('Trendyol token expired and automatic login failed');
  }

  /**
   * Make authenticated API request to Trendyol
   */
  private async apiRequest<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: unknown,
  ): Promise<T> {
    const token = await this.ensureValidToken();

    const options: RequestInit = {
      method,
      headers: {
        ...this.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Handle 401 - try re-login once
    if (response.status === 401) {
      this.logger.warn('Received 401, attempting re-login...');
      this.accessToken = null;
      this.tokenExpiresAt = null;

      const loginSuccess = await this.performAutomaticLogin();
      if (loginSuccess) {
        // Retry the request
        const retryResponse = await fetch(url, {
          ...options,
          headers: {
            ...this.getHeaders(),
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
        }
        return retryResponse.json();
      }

      throw new Error('Authentication failed. Manual login required.');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch active orders from Trendyol GO Yemek
   */
  async fetchOrders(): Promise<PlatformOrder[]> {
    this.logger.debug('Fetching orders from Trendyol GO Yemek...');

    try {
      const response = await this.apiRequest<TrendyolActiveOrdersResponse>(
        `${this.baseUrl}/sellers/packages/stores/${this.storeId}`,
      );

      const totalOrders = (response.newOrders?.length || 0) +
                         (response.pickedOrders?.length || 0) +
                         (response.invoicedOrders?.length || 0) +
                         (response.shippedOrders?.length || 0);

      const orders: PlatformOrder[] = [];

      // Helper to process orders with details
      const processOrdersWithDetails = async (orderList: TrendyolOrder[], status: string) => {
        for (const order of orderList || []) {
          // Fetch detailed info including notes and orderLines with modifiers
          const details = await this.fetchOrderDetails(order.packageId, order.orderId);

          // Merge details into order
          if (details) {
            if (details.customerNote) {
              (order as any).customerNote = details.customerNote;
            }
            if (details.deliveryAddress) {
              (order as any).deliveryAddress = details.deliveryAddress;
            }
            if (details.customerPhone && details.customerPhone.length > 0) {
              order.customer = { ...order.customer, phone: details.customerPhone };
            }
            // Replace orderLines with detailed version (includes modifierProducts, removedIngredients, etc.)
            if (details.orderLines && details.orderLines.length > 0) {
              order.orderLines = details.orderLines;
            }
          }

          orders.push(this.transformOrder(order, status));
        }
      };

      // Process all order types
      await processOrdersWithDetails(response.newOrders, 'NEW');
      await processOrdersWithDetails(response.pickedOrders, 'PICKED');
      await processOrdersWithDetails(response.invoicedOrders, 'INVOICED');
      await processOrdersWithDetails(response.shippedOrders, 'SHIPPED');

      this.logger.log(`Fetched ${orders.length} orders from Trendyol GO Yemek`);
      return orders;
    } catch (error) {
      this.logger.error(`Failed to fetch Trendyol orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Transform Trendyol order to PlatformOrder format
   */
  private transformOrder(trendyolOrder: TrendyolOrder, status: string): PlatformOrder {
    // Get total amount from new API field or legacy field
    const totalAmount = trendyolOrder.totalOrderPrice ?? trendyolOrder.totalAmount ?? 0;
    const deliveryFee = 0; // Trendyol includes delivery in platform fee
    const discount = 0;
    const subtotal = totalAmount;

    // Map payment method from new API structure
    let paymentMethod: 'CASH' | 'CREDIT_CARD' | 'ONLINE' = 'ONLINE';
    const paymentType = trendyolOrder.orderPayment?.paymentType || trendyolOrder.paymentMethod || '';
    if (paymentType.toLowerCase().includes('cash') || paymentType.includes('DOOR')) {
      paymentMethod = 'CASH';
    } else if (paymentType.toLowerCase().includes('card')) {
      paymentMethod = 'CREDIT_CARD';
    }

    // Transform items from new API structure (orderLines) or legacy (items)
    let items: { platformProductId: string; name: string; quantity: number; unitPrice: number; notes?: string }[] = [];

    if (trendyolOrder.orderLines && trendyolOrder.orderLines.length > 0) {
      // New API structure - try to get price from various possible fields
      items = trendyolOrder.orderLines.map((line) => {
        // Count non-cancelled items
        const quantity = line.orderLineItems?.filter(item => !item.isCancelled).length || line.quantity || 1;

        // Try to get price from various possible field names
        // Trendyol API may use different field names in different versions
        const itemPrice = line.price
          ?? line.productPrice
          ?? line.salePrice
          ?? line.unitPrice
          ?? line.totalPrice
          ?? line.amount
          ?? (line as any).fiyat // Turkish field name possibility
          ?? (line as any).birimFiyat
          ?? null;

        // Log if we couldn't find a price (for debugging)
        if (itemPrice === null) {
          this.logger.warn(
            `No price found for Trendyol item "${line.name}" (line id: ${line.id}). ` +
            `Available fields: ${Object.keys(line).join(', ')}. ` +
            `Line data: ${JSON.stringify(line)}`,
          );
        }

        // Build notes from modifiers, removed/extra ingredients
        const noteParts: string[] = [];

        // Add modifier products (portion/size info)
        if (line.modifierProducts && line.modifierProducts.length > 0) {
          const modifierNames = line.modifierProducts.map(m => m.name).filter(Boolean);
          if (modifierNames.length > 0) {
            noteParts.push(modifierNames.join(', '));
          }
        }

        // Add removed ingredients
        if (line.removedIngredients && line.removedIngredients.length > 0) {
          noteParts.push(`Çıkar: ${line.removedIngredients.join(', ')}`);
        }

        // Add extra ingredients
        if (line.extraIngredients && line.extraIngredients.length > 0) {
          noteParts.push(`Ekle: ${line.extraIngredients.join(', ')}`);
        }

        const itemNotes = noteParts.length > 0 ? noteParts.join(' | ') : undefined;

        return {
          platformProductId: `TRENDYOL-${line.id}`,
          name: line.name || 'Bilinmeyen Ürün',
          quantity,
          unitPrice: itemPrice ?? 0, // Use 0 if no price found, don't divide total
          notes: itemNotes,
        };
      });

      // If all items have 0 price, try to distribute total evenly (fallback)
      const totalItemsPrice = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      if (totalItemsPrice === 0 && totalAmount > 0 && items.length > 0) {
        this.logger.warn(
          `All Trendyol items have 0 price for order ${trendyolOrder.orderCode}. ` +
          `Distributing total ${totalAmount} evenly among ${items.length} items. ` +
          `This may indicate an API structure change.`,
        );
        const pricePerItem = totalAmount / items.length;
        items = items.map(item => ({ ...item, unitPrice: pricePerItem / item.quantity }));
      }
    } else if (trendyolOrder.items && trendyolOrder.items.length > 0) {
      // Legacy structure
      items = trendyolOrder.items.map((item) => ({
        platformProductId: `TRENDYOL-${item.id || item.productName || 'unknown'}`,
        name: item.productName || item.name || 'Bilinmeyen Ürün',
        quantity: item.quantity ?? 1,
        unitPrice: item.price ?? 0,
        notes: item.notes,
      }));
    }

    // Build customer name from firstName + lastName or use legacy name
    const customerName = trendyolOrder.customer?.firstName && trendyolOrder.customer?.lastName
      ? `${trendyolOrder.customer.firstName} ${trendyolOrder.customer.lastName}`
      : (trendyolOrder.customer as any)?.name || 'Trendyol Müşteri';

    // Get creation date from timestamp or legacy string
    const createdAt = trendyolOrder.packageCreationDate
      ? new Date(trendyolOrder.packageCreationDate)
      : new Date(trendyolOrder.createdAt || Date.now());

    // Get order ID - prefer packageId
    const orderId = trendyolOrder.packageId || trendyolOrder.id || String(trendyolOrder.orderId);

    // Platform display ID - the order code shown in Trendyol panel
    const platformDisplayId = trendyolOrder.orderCode || String(trendyolOrder.orderId);

    // Calculate estimated delivery from ETA or default
    let estimatedDeliveryMinutes = 35;
    if (trendyolOrder.eta) {
      // Parse "40 - 50 dk" format
      const match = trendyolOrder.eta.match(/(\d+)/);
      if (match) {
        estimatedDeliveryMinutes = parseInt(match[1], 10);
      }
    }

    // Extract customer notes from various possible fields
    const noteParts: string[] = [];

    // Order-level notes
    if (trendyolOrder.orderNote) noteParts.push(trendyolOrder.orderNote);
    if (trendyolOrder.customerNote) noteParts.push(trendyolOrder.customerNote);
    if (trendyolOrder.note) noteParts.push(trendyolOrder.note);
    if (trendyolOrder.notes) noteParts.push(trendyolOrder.notes);
    if (trendyolOrder.deliveryNote) noteParts.push(trendyolOrder.deliveryNote);
    if (trendyolOrder.description) noteParts.push(trendyolOrder.description);
    if (trendyolOrder.addressDescription) noteParts.push(trendyolOrder.addressDescription);

    // Delivery address description/notes
    if (trendyolOrder.deliveryAddress?.description) {
      noteParts.push(trendyolOrder.deliveryAddress.description);
    }
    if (trendyolOrder.deliveryAddress?.doorDescription) {
      noteParts.push(trendyolOrder.deliveryAddress.doorDescription);
    }

    // Customer-level address description
    if (trendyolOrder.customer?.addressDescription) {
      noteParts.push(trendyolOrder.customer.addressDescription);
    }
    if (trendyolOrder.customer?.deliveryAddress?.description) {
      noteParts.push(trendyolOrder.customer.deliveryAddress.description);
    }
    if (trendyolOrder.customer?.deliveryAddress?.doorDescription) {
      noteParts.push(trendyolOrder.customer.deliveryAddress.doorDescription);
    }

    // Combine unique notes
    const customerNote = [...new Set(noteParts.filter(Boolean))].join(' | ');

    // Get address - prefer deliveryAddress if available
    const customerAddress = trendyolOrder.deliveryAddress?.address
      || trendyolOrder.customer?.deliveryAddress?.address
      || trendyolOrder.customer?.address
      || '';

    // Get coordinates if available
    const latitude = trendyolOrder.deliveryAddress?.latitude
      || trendyolOrder.customer?.deliveryAddress?.latitude;
    const longitude = trendyolOrder.deliveryAddress?.longitude
      || trendyolOrder.customer?.deliveryAddress?.longitude;

    // Map Trendyol status to internal status
    const platformStatus = TRENDYOL_STATUS_MAP[status] || 'PENDING';

    return {
      platformOrderId: `TRENDYOL-${orderId}`,
      platformDisplayId,
      platform: Platform.TRENDYOL,
      platformStatus,
      customer: {
        name: customerName,
        phone: trendyolOrder.customer?.phone || '+905000000000',
        address: customerAddress,
        note: customerNote || undefined,
        latitude,
        longitude,
      },
      items,
      subtotal,
      deliveryFee,
      discount,
      totalAmount,
      paymentMethod,
      estimatedDeliveryMinutes,
      createdAt,
    };
  }

  /**
   * Accept order on Trendyol
   */
  async acceptOrder(platformOrderId: string, estimatedMinutes: number = 25): Promise<boolean> {
    this.logger.debug(`Accepting order on Trendyol: ${platformOrderId}, estimated: ${estimatedMinutes}min`);

    try {
      const packageId = platformOrderId.replace('TRENDYOL-', '');

      // Note: Trendyol may have a different endpoint for accepting orders
      // This is a placeholder - actual endpoint needs to be discovered
      const response = await this.apiRequest<{ success?: boolean }>(
        `${this.baseUrl}/sellers/packages/${packageId}/accept`,
        'POST',
        { preparationTime: estimatedMinutes },
      );

      this.logger.log(`Order accepted on Trendyol: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error accepting Trendyol order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Reject order on Trendyol
   */
  async rejectOrder(platformOrderId: string, reason: string): Promise<boolean> {
    this.logger.debug(`Rejecting order on Trendyol: ${platformOrderId}, reason: ${reason}`);

    try {
      const packageId = platformOrderId.replace('TRENDYOL-', '');

      await this.apiRequest(
        `${this.baseUrl}/sellers/packages/${packageId}/reject`,
        'POST',
        { reason },
      );

      this.logger.log(`Order rejected on Trendyol: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error rejecting Trendyol order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Update order status on Trendyol
   */
  async updateOrderStatus(platformOrderId: string, status: OrderStatus): Promise<boolean> {
    this.logger.debug(`Updating order status on Trendyol: ${platformOrderId} -> ${status}`);

    try {
      const packageId = platformOrderId.replace('TRENDYOL-', '');
      const trendyolStatus = INTERNAL_TO_TRENDYOL_STATUS[status];

      if (!trendyolStatus) {
        this.logger.warn(`Unknown status mapping for: ${status}`);
        return false;
      }

      // Trendyol uses different endpoints for each status transition
      // PUT /sellers/packages/{packageId}/{status_lowercase}
      let endpoint: string;
      let method: 'PUT' | 'POST' = 'PUT';

      switch (trendyolStatus) {
        case 'PICKED':
          // Start preparing
          endpoint = `${this.baseUrl}/sellers/packages/${packageId}/picked`;
          break;
        case 'INVOICED':
          // Ready for pickup
          endpoint = `${this.baseUrl}/sellers/packages/${packageId}/invoiced`;
          break;
        case 'SHIPPED':
          // On delivery
          endpoint = `${this.baseUrl}/sellers/packages/${packageId}/shipped`;
          break;
        default:
          this.logger.warn(`No Trendyol endpoint for status: ${trendyolStatus}`);
          return false;
      }

      await this.apiRequest(endpoint, method);

      this.logger.log(`Order status updated on Trendyol: ${platformOrderId} -> ${trendyolStatus}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating Trendyol order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Sync menu to Trendyol (not supported - manage through partner portal)
   */
  async syncMenu(products: PlatformProduct[]): Promise<SyncResult> {
    this.logger.warn('Menu sync not supported for Trendyol - manage menu through Partner Portal');

    return {
      success: false,
      recordsCount: 0,
      duration: 0,
      errorMessage: 'Menu sync not supported for Trendyol. Use Partner Portal.',
    };
  }

  /**
   * Set restaurant status on Trendyol
   */
  async setRestaurantStatus(status: RestaurantStatus): Promise<boolean> {
    this.logger.debug(`Setting restaurant status on Trendyol: isOpen=${status.isOpen}`);

    try {
      const endpoint = `${this.baseUrl2}/delivery-orange-externalgateway-service/seller-gw/stores/${this.storeId}/working-status`;

      await this.apiRequest(endpoint, 'POST', {
        workingStatus: status.isOpen ? 'OPEN' : 'CLOSED',
      });

      this.logger.log(`Restaurant status updated on Trendyol: ${status.isOpen ? 'OPEN' : 'CLOSED'}`);
      return true;
    } catch (error) {
      this.logger.error(`Error setting Trendyol restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Get restaurant status from Trendyol
   */
  async getRestaurantStatus(): Promise<RestaurantStatus> {
    this.logger.debug('Getting restaurant status from Trendyol');

    try {
      const response = await this.apiRequest<{ data: { workingStatus: string } }>(
        `${this.baseUrl2}/delivery-orange-externalgateway-service/seller-gw/stores/${this.storeId}/working-status`,
      );

      const isOpen = response.data?.workingStatus === 'OPEN';

      return {
        isOpen,
        isBusy: response.data?.workingStatus === 'BUSY',
        estimatedDeliveryTime: 30,
      };
    } catch (error) {
      this.logger.error(`Error getting Trendyol restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isOpen: true, isBusy: false, estimatedDeliveryTime: 30 };
    }
  }

  /**
   * Verify API credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.ensureValidToken();
      this.logger.log('Trendyol credentials verified successfully');
      return true;
    } catch (error) {
      this.logger.error(`Trendyol credential verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Store tokens from login
   */
  async storeTokens(accessToken: string, refreshToken?: string): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || null;

    // Set expiration to 4 hours from now (Trendyol tokens typically last 4-6 hours)
    this.tokenExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

    await this.prisma.platformConfig.upsert({
      where: { platform: Platform.TRENDYOL },
      update: {
        accessToken,
        refreshToken: refreshToken || undefined,
        tokenExpiresAt: this.tokenExpiresAt,
        isActive: true,
      },
      create: {
        platform: Platform.TRENDYOL,
        accessToken,
        refreshToken: refreshToken || undefined,
        tokenExpiresAt: this.tokenExpiresAt,
        isActive: true,
        commissionRate: TRENDYOL_COMMISSION_RATE,
      },
    });

    this.logger.log('Trendyol tokens stored successfully');
  }

  /**
   * Get store information
   */
  async getStoreInfo(): Promise<{ id: number; name: string; sellerId: number }> {
    const response = await this.apiRequest<{ data: { id: number; name: string; sellerId: number } }>(
      `${this.baseUrl2}/delivery-orange-externalgateway-service/seller-gw/stores/${this.storeId}`,
    );

    return response.data;
  }

  /**
   * Get delivery hours
   */
  async getDeliveryHours(): Promise<Array<{ dayOfWeek: string; openingTime: string; closingTime: string }>> {
    const response = await this.apiRequest<{
      data: { items: Array<{ dayOfWeek: string; openingTime: string; closingTime: string }> };
    }>(
      `${this.baseUrl2}/delivery-orange-externalgateway-service/seller-gw/stores/${this.storeId}/delivery-hours?deliveryType=GO&separated=false`,
    );

    return response.data?.items || [];
  }

  /**
   * Fetch detailed order information including notes and orderLines with modifiers
   * The list API doesn't include notes or modifierProducts - we need to fetch each order's details
   */
  async fetchOrderDetails(packageId: string, orderId?: number): Promise<{
    customerNote?: string;
    deliveryAddress?: TrendyolDeliveryAddress;
    customerPhone?: string;
    orderLines?: TrendyolOrderLine[];
  } | null> {
    // Try multiple endpoints to find order details with notes
    const endpoints = [
      `${this.baseUrl}/sellers/packages/${packageId}/detail`,
      `${this.baseUrl}/sellers/packages/${packageId}`,
      `${this.baseUrl2}/order-meal-seller-order-gw-service/sellers/${this.sellerId}/orders/${orderId || 'unknown'}`,
      `${this.baseUrl2}/order-meal-seller-order-gw-service/packages/${packageId}`,
      `${this.baseUrl2}/delivery-orange-externalgateway-service/seller-gw/packages/${packageId}`,
      `${this.baseUrl2}/localcommerce-seller-seller-center-order-bff-service/orders/${orderId || 'unknown'}`,
    ];

    for (const endpoint of endpoints) {
      if (endpoint.includes('unknown')) continue;

      try {
        const response = await this.apiRequest<any>(endpoint);

        // Check for notes - customerNote is at response root level in detail endpoint
        const customerNote = response?.customerNote || response?.orderNote ||
          response?.note || response?.notes || response?.specialInstructions ||
          response?.addressNote || response?.deliveryNote ||
          response?.customer?.addressDescription || response?.customer?.note ||
          response?.data?.customerNote || response?.data?.orderNote;

        const deliveryAddress = response?.deliveryAddress || response?.data?.deliveryAddress ||
          response?.customer?.deliveryAddress;
        const customerPhone = response?.customer?.phone || response?.customerPhone ||
          response?.data?.customer?.phone;

        // Get orderLines with modifierProducts from detail endpoint
        const orderLines = response?.orderLines || response?.data?.orderLines;

        // Return if we found customer note, orderLines with modifiers, or other data
        if (customerNote || deliveryAddress || (customerPhone && customerPhone.length > 0) || orderLines) {
          return { customerNote, deliveryAddress, customerPhone, orderLines };
        }
      } catch {
        this.logger.debug(`Endpoint ${endpoint} failed, trying next...`);
      }
    }

    this.logger.debug(`Could not fetch order details with notes for ${packageId}`);
    return null;
  }
}

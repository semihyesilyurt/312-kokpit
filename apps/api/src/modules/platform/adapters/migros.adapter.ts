/**
 * Migros Yemek Platform Adapter
 * Real implementation for Migros Restoran Panel integration
 * - JWT token-based authentication with auto-refresh
 * - Automatic Turnstile CAPTCHA solving for login
 * - 20-second order polling
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
 * Migros API response types
 */
interface MigrosLoginResponse {
  response: {
    data: {
      accessToken: string;
      refreshToken: string;
      expiration: string;
      refExpiration: string;
      user: {
        id: string;
        email: string;
        stores: Array<{ storeId: number; storeName: string }>;
      };
    };
    success: boolean;
  };
}

interface MigrosOrderProduct {
  id: number;
  productId: number;
  name: string;
  price: number;
  priceText: string;
  amount: number;
  note?: string;
  options?: Array<{
    headerName: string;
    itemNames: string;
    optionItemId: number;
    optionType: string;
  }>;
}

interface MigrosOrder {
  id: number;
  userId: number;
  storeName: string;
  storeGroupName: string;
  phoneNumber: string;
  description: string;
  paymentType: string;
  paymentTypeDescription: string;
  totalPrice: number;
  totalPriceText: string;
  discountedPrice: number;
  restaurantDiscountedPrice: number;
  products: MigrosOrderProduct[];
  contactlessDelivery: boolean;
  ringDoorbell: boolean;
  orderNote: string;
  customerFullName: string;
  address: string;
  deliveryLocation: {
    latitude: number;
    longitude: number;
  };
  createdAt: number;
  status: string;
  deliveryProvider: string;
  courierName: string;
}

interface MigrosActiveOrdersResponse {
  data: Array<{
    storeId: number;
    activeOrderDetailsDTOS: MigrosOrder[];
  }>;
  success: boolean;
  errorMessage?: string;
}

/**
 * Migros status to internal status mapping
 */
const MIGROS_STATUS_MAP: Record<string, OrderStatus> = {
  COLLECTING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DELIVERING: 'ON_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/**
 * Internal status to Migros status mapping
 */
const INTERNAL_TO_MIGROS_STATUS: Record<string, string> = {
  PENDING: 'COLLECTING',
  CONFIRMED: 'COLLECTING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  ON_DELIVERY: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

@Injectable()
export class MigrosAdapter implements PlatformAdapter, OnModuleInit {
  private readonly logger = new Logger(MigrosAdapter.name);
  readonly platform = Platform.MIGROS;

  // API Configuration
  private readonly baseUrl = 'https://restoran.migrosonline.com/rest';
  private readonly storeId = 23000000157905; // 312 Döner & Izgara store ID

  // Turnstile Solver Configuration
  private readonly turnstileSolverUrl = 'http://127.0.0.1:5000';
  private readonly migrosLoginUrl = 'https://restoran.migrosonline.com/login';
  private readonly migrosSitekey = '0x4AAAAAAAOPmPrHfYqUm90g';

  // Migros Credentials
  private readonly migrosEmail = 'bilgi@vizyoncatering.com';
  private readonly migrosPassword = '1.Viz2yon3';

  // Token cache (in-memory for quick access)
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private isLoggingIn = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize adapter on module start
   */
  async onModuleInit() {
    this.logger.log('Migros adapter initialized');
    // Check if we need to login on startup
    await this.checkAndRefreshLogin();
  }

  /**
   * Check if login is needed and perform automatic login
   */
  async checkAndRefreshLogin(): Promise<void> {
    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.MIGROS },
      });

      // If no config or token expired, perform login
      if (!config?.accessToken || !config?.tokenExpiresAt) {
        this.logger.log('No Migros token found, initiating automatic login...');
        await this.performAutomaticLogin();
        return;
      }

      // Check if token will expire in the next 10 minutes
      const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
      if (config.tokenExpiresAt < tenMinutesFromNow) {
        this.logger.log('Migros token expiring soon, attempting refresh...');

        // Try refresh token first
        if (config.refreshToken) {
          const refreshed = await this.refreshToken(config.refreshToken);
          if (refreshed) {
            this.logger.log('Token refreshed successfully');
            return;
          }
        }

        // If refresh failed, perform full login
        this.logger.log('Token refresh failed, initiating automatic login...');
        await this.performAutomaticLogin();
      }
    } catch (error) {
      this.logger.error(`Login check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform automatic login using Turnstile Solver token + direct API call
   * This is the working approach from the Python scripts
   */
  async performAutomaticLogin(): Promise<boolean> {
    if (this.isLoggingIn) {
      this.logger.debug('Login already in progress, skipping...');
      return false;
    }

    this.isLoggingIn = true;

    try {
      this.logger.log('Starting automatic Migros login...');

      // Step 1: Get Turnstile token from solver
      const turnstileToken = await this.solveTurnstile();
      if (!turnstileToken) {
        throw new Error('Failed to solve Turnstile CAPTCHA');
      }

      this.logger.log('Turnstile token obtained, performing API login...');

      // Step 2: Login to Migros with Turnstile token (lowercase endpoint!)
      const loginResponse = await fetch(`${this.baseUrl}/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://restoran.migrosonline.com',
          'Referer': 'https://restoran.migrosonline.com/login',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'cf-turnstile-response': turnstileToken,
          'X-Turnstile-Token': turnstileToken,
        },
        body: JSON.stringify({
          email: this.migrosEmail,
          password: this.migrosPassword,
          'cf-turnstile-response': turnstileToken,
        }),
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`Login HTTP error: ${loginResponse.status} - ${errorText.substring(0, 200)}`);
      }

      const loginData = await loginResponse.json();

      if (!loginData.success || !loginData.data?.accessToken) {
        throw new Error(`Login failed: ${loginData.errorMessage || 'Unknown error'}`);
      }

      const tokenData = loginData.data;

      // Step 3: Store tokens
      await this.storeTokens(
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.expiration,
      );

      // Update sync status
      await this.prisma.platformConfig.update({
        where: { platform: Platform.MIGROS },
        data: {
          syncStatus: 'success',
          syncError: null,
        },
      });

      this.logger.log('Migros automatic login successful!');
      return true;
    } catch (error) {
      this.logger.error(`Automatic login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Update platform config with error status
      await this.prisma.platformConfig.upsert({
        where: { platform: Platform.MIGROS },
        update: {
          syncStatus: 'login_failed',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
        create: {
          platform: Platform.MIGROS,
          commissionRate: 13,
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
   * Solve Turnstile CAPTCHA using the local solver service
   */
  private async solveTurnstile(): Promise<string | null> {
    try {
      // Step 1: Request Turnstile solve
      const requestUrl = `${this.turnstileSolverUrl}/turnstile?url=${encodeURIComponent(this.migrosLoginUrl)}&sitekey=${encodeURIComponent(this.migrosSitekey)}`;

      const requestResponse = await fetch(requestUrl);
      if (!requestResponse.ok) {
        throw new Error(`Turnstile solver request failed: ${requestResponse.status}`);
      }

      const requestData = await requestResponse.json();
      const taskId = requestData.task_id;

      if (!taskId) {
        throw new Error('No task_id received from Turnstile solver');
      }

      this.logger.debug(`Turnstile task created: ${taskId}`);

      // Step 2: Poll for result (max 60 seconds)
      const maxAttempts = 30;
      const pollInterval = 2000; // 2 seconds

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await this.delay(pollInterval);

        const resultResponse = await fetch(`${this.turnstileSolverUrl}/result?id=${taskId}`);

        if (resultResponse.status === 422) {
          throw new Error('Turnstile CAPTCHA solve failed');
        }

        if (resultResponse.status === 200) {
          const resultText = await resultResponse.text();

          // Check if it's the "not ready" string
          if (resultText === 'CAPTCHA_NOT_READY') {
            this.logger.debug(`Waiting for Turnstile solve... (attempt ${attempt + 1}/${maxAttempts})`);
            continue;
          }

          // Try to parse as JSON
          try {
            const resultData = JSON.parse(resultText);
            if (resultData.value && resultData.value !== 'CAPTCHA_FAIL') {
              this.logger.debug(`Turnstile solved in ${resultData.elapsed_time}s`);
              return resultData.value;
            }
          } catch {
            this.logger.warn(`Unexpected Turnstile result format: ${resultText.substring(0, 100)}`);
          }
        }

        this.logger.debug(`Waiting for Turnstile solve... (attempt ${attempt + 1}/${maxAttempts})`);
      }

      throw new Error('Turnstile solve timeout');
    } catch (error) {
      this.logger.error(`Turnstile solve error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensure we have a valid access token
   * Refreshes if expired or about to expire (within 5 minutes)
   */
  private async ensureValidToken(): Promise<string> {
    // Check if token is still valid (with 5-minute buffer)
    if (this.accessToken && this.tokenExpiresAt) {
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      if (new Date().getTime() < this.tokenExpiresAt.getTime() - bufferTime) {
        return this.accessToken;
      }
    }

    // Load token from database
    const config = await this.prisma.platformConfig.findUnique({
      where: { platform: Platform.MIGROS },
    });

    if (!config) {
      // No config - try automatic login
      const loginSuccess = await this.performAutomaticLogin();
      if (loginSuccess && this.accessToken) {
        return this.accessToken;
      }
      throw new Error('Migros platform configuration not found and automatic login failed');
    }

    // Check database token validity
    if (config.accessToken && config.tokenExpiresAt) {
      const bufferTime = 5 * 60 * 1000;
      if (new Date().getTime() < config.tokenExpiresAt.getTime() - bufferTime) {
        this.accessToken = config.accessToken;
        this.tokenExpiresAt = config.tokenExpiresAt;
        return this.accessToken;
      }
    }

    // Token expired - try to refresh using refresh token
    if (config.refreshToken) {
      try {
        const refreshed = await this.refreshToken(config.refreshToken);
        if (refreshed) {
          return this.accessToken!;
        }
      } catch (error) {
        this.logger.warn(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // If refresh failed, perform automatic login
    this.logger.log('Token expired, performing automatic login...');
    const loginSuccess = await this.performAutomaticLogin();
    if (loginSuccess && this.accessToken) {
      return this.accessToken;
    }

    throw new Error('Migros token expired and automatic login failed');
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshToken(refreshToken: string): Promise<boolean> {
    try {
      this.logger.debug('Refreshing Migros access token...');

      const response = await fetch(`${this.baseUrl}/User/LoginWithRefreshToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://restoran.migrosonline.com',
          'Referer': 'https://restoran.migrosonline.com/',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.response?.success && data.response?.data?.accessToken) {
        const tokenData = data.response.data;

        // Update in-memory cache
        this.accessToken = tokenData.accessToken;
        this.tokenExpiresAt = new Date(tokenData.expiration);

        // Update database
        await this.prisma.platformConfig.update({
          where: { platform: Platform.MIGROS },
          data: {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            tokenExpiresAt: new Date(tokenData.expiration),
          },
        });

        this.logger.log('Migros token refreshed successfully');
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Make authenticated API request to Migros
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: unknown,
  ): Promise<T> {
    const token = await this.ensureValidToken();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://restoran.migrosonline.com',
      'Referer': 'https://restoran.migrosonline.com/restaurant-awaiting-approval',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
      'no-loader': 'true',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    // Handle 401 - try token refresh once
    if (response.status === 401) {
      this.logger.warn('Received 401, attempting token refresh...');
      this.accessToken = null;
      this.tokenExpiresAt = null;

      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.MIGROS },
      });

      if (config?.refreshToken) {
        const refreshed = await this.refreshToken(config.refreshToken);
        if (refreshed) {
          // Retry the request
          const retryToken = await this.ensureValidToken();
          headers['Authorization'] = `Bearer ${retryToken}`;
          const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });

          if (!retryResponse.ok) {
            throw new Error(`HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
          }
          return retryResponse.json();
        }
      }

      throw new Error('Authentication failed. Manual login required.');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch active orders from Migros
   * Uses /Order/ActiveOrdersWithStores endpoint with storeIds array
   */
  async fetchOrders(): Promise<PlatformOrder[]> {
    this.logger.debug('Fetching orders from Migros...');

    try {
      const response = await this.apiRequest<MigrosActiveOrdersResponse>(
        '/Order/ActiveOrdersWithStores',
        'POST',
        { storeIds: [this.storeId], offset: 0, limit: 30 },
      );

      if (!response.success) {
        this.logger.warn(`Migros API returned error: ${JSON.stringify(response.errorMessage || response)}`);
        return [];
      }

      // Log response structure for debugging
      this.logger.debug(`Migros response data length: ${response.data?.length || 0}`);

      const orders: PlatformOrder[] = [];

      for (const storeData of response.data) {
        for (const migrosOrder of storeData.activeOrderDetailsDTOS) {
          const platformOrder = this.transformOrder(migrosOrder);
          orders.push(platformOrder);
        }
      }

      this.logger.log(`Fetched ${orders.length} orders from Migros`);
      return orders;
    } catch (error) {
      this.logger.error(`Failed to fetch Migros orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Transform Migros order to PlatformOrder format
   */
  private transformOrder(migrosOrder: MigrosOrder): PlatformOrder {
    // Convert prices from cents to TL (divide by 100)
    const totalPrice = migrosOrder.totalPrice / 100;
    const restaurantPrice = migrosOrder.restaurantDiscountedPrice / 100;

    // Calculate delivery fee (assume 0 for now, Migros includes it in platform fee)
    const deliveryFee = 0;

    // Calculate discount (totalPrice - restaurantPrice is the platform commission + discounts)
    const discount = 0;

    // Map payment type
    let paymentMethod: 'CASH' | 'CREDIT_CARD' | 'ONLINE' = 'ONLINE';
    if (migrosOrder.paymentType === 'CASH_ON_DELIVERY') {
      paymentMethod = 'CASH';
    } else if (migrosOrder.paymentType === 'CREDIT_CARD_ON_DELIVERY') {
      paymentMethod = 'CREDIT_CARD';
    }

    // Transform products
    const items = migrosOrder.products.map((product) => {
      // Build item notes from options
      let notes = product.note || '';
      if (product.options && product.options.length > 0) {
        const optionText = product.options
          .map((opt) => `${opt.headerName}: ${opt.itemNames}`)
          .join(', ');
        notes = notes ? `${notes} | ${optionText}` : optionText;
      }

      return {
        platformProductId: `MIGROS-${product.productId}`,
        name: product.name,
        quantity: product.amount,
        unitPrice: product.price / 100, // Convert from cents
        notes: notes || undefined,
      };
    });

    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return {
      platformOrderId: `MIGROS-${migrosOrder.id}`,
      platform: Platform.MIGROS,
      customer: {
        name: migrosOrder.customerFullName,
        phone: this.formatPhone(migrosOrder.phoneNumber),
        address: migrosOrder.address,
        latitude: migrosOrder.deliveryLocation?.latitude,
        longitude: migrosOrder.deliveryLocation?.longitude,
        note: migrosOrder.orderNote || (migrosOrder.contactlessDelivery ? 'Temassız teslimat' : undefined),
      },
      items,
      subtotal,
      deliveryFee,
      discount,
      totalAmount: restaurantPrice, // Use restaurant price as this is what we receive
      paymentMethod,
      estimatedDeliveryMinutes: 30, // Default 30 minutes
      createdAt: new Date(migrosOrder.createdAt),
    };
  }

  /**
   * Format phone number to standard format
   */
  private formatPhone(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Ensure starts with +90 for Turkish numbers
    if (digits.length === 10) {
      return `+90${digits}`;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      return `+90${digits.substring(1)}`;
    } else if (digits.length === 12 && digits.startsWith('90')) {
      return `+${digits}`;
    }

    return `+90${digits.substring(digits.length - 10)}`;
  }

  /**
   * Accept order on Migros
   */
  async acceptOrder(platformOrderId: string, estimatedMinutes: number = 25): Promise<boolean> {
    this.logger.debug(`Accepting order on Migros: ${platformOrderId}, estimated: ${estimatedMinutes}min`);

    try {
      // Extract numeric order ID
      const orderId = platformOrderId.replace('MIGROS-', '');

      const response = await this.apiRequest<{ success: boolean }>(
        '/Order/AcceptOrder',
        'POST',
        {
          orderId: parseInt(orderId, 10),
          preparationTime: estimatedMinutes,
        },
      );

      if (response.success) {
        this.logger.log(`Order accepted on Migros: ${platformOrderId}`);
        return true;
      }

      this.logger.warn(`Failed to accept order on Migros: ${platformOrderId}`);
      return false;
    } catch (error) {
      this.logger.error(`Error accepting Migros order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Reject order on Migros
   */
  async rejectOrder(platformOrderId: string, reason: string): Promise<boolean> {
    this.logger.debug(`Rejecting order on Migros: ${platformOrderId}, reason: ${reason}`);

    try {
      const orderId = platformOrderId.replace('MIGROS-', '');

      const response = await this.apiRequest<{ success: boolean }>(
        '/Order/RejectOrder',
        'POST',
        {
          orderId: parseInt(orderId, 10),
          rejectReason: reason,
        },
      );

      if (response.success) {
        this.logger.log(`Order rejected on Migros: ${platformOrderId}`);
        return true;
      }

      this.logger.warn(`Failed to reject order on Migros: ${platformOrderId}`);
      return false;
    } catch (error) {
      this.logger.error(`Error rejecting Migros order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Update order status on Migros
   */
  async updateOrderStatus(platformOrderId: string, status: OrderStatus): Promise<boolean> {
    this.logger.debug(`Updating order status on Migros: ${platformOrderId} -> ${status}`);

    try {
      const orderId = platformOrderId.replace('MIGROS-', '');
      const migrosStatus = INTERNAL_TO_MIGROS_STATUS[status];

      if (!migrosStatus) {
        this.logger.warn(`Unknown status mapping for: ${status}`);
        return false;
      }

      // Different endpoints for different status updates
      let endpoint = '/Order/UpdateOrderStatus';
      let body: Record<string, unknown> = {
        orderId: parseInt(orderId, 10),
        status: migrosStatus,
      };

      // Special handling for status transitions
      if (status === 'PREPARING') {
        endpoint = '/Order/StartPreparing';
        body = { orderId: parseInt(orderId, 10) };
      } else if (status === 'READY') {
        endpoint = '/Order/MarkAsReady';
        body = { orderId: parseInt(orderId, 10) };
      } else if (status === 'ON_DELIVERY') {
        endpoint = '/Order/MarkAsDelivering';
        body = { orderId: parseInt(orderId, 10) };
      } else if (status === 'DELIVERED') {
        endpoint = '/Order/MarkAsDelivered';
        body = { orderId: parseInt(orderId, 10) };
      }

      const response = await this.apiRequest<{ success: boolean }>(endpoint, 'POST', body);

      if (response.success) {
        this.logger.log(`Order status updated on Migros: ${platformOrderId} -> ${migrosStatus}`);
        return true;
      }

      this.logger.warn(`Failed to update order status on Migros: ${platformOrderId}`);
      return false;
    } catch (error) {
      this.logger.error(`Error updating Migros order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Sync menu to Migros (not supported - Migros manages menu through their panel)
   */
  async syncMenu(products: PlatformProduct[]): Promise<SyncResult> {
    this.logger.warn('Menu sync not supported for Migros - manage menu through Migros Restoran Panel');

    return {
      success: false,
      recordsCount: 0,
      duration: 0,
      errorMessage: 'Menu sync not supported for Migros. Use Migros Restoran Panel.',
    };
  }

  /**
   * Set restaurant status on Migros
   */
  async setRestaurantStatus(status: RestaurantStatus): Promise<boolean> {
    this.logger.debug(`Setting restaurant status on Migros: isOpen=${status.isOpen}`);

    try {
      const endpoint = status.isOpen ? '/Store/OpenStore' : '/Store/CloseStore';

      const response = await this.apiRequest<{ success: boolean }>(endpoint, 'POST', {
        storeId: this.storeId,
        reason: status.pauseReason || undefined,
      });

      if (response.success) {
        this.logger.log(`Restaurant status updated on Migros: ${status.isOpen ? 'OPEN' : 'CLOSED'}`);
        return true;
      }

      this.logger.warn('Failed to update restaurant status on Migros');
      return false;
    } catch (error) {
      this.logger.error(`Error setting Migros restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Get restaurant status from Migros
   */
  async getRestaurantStatus(): Promise<RestaurantStatus> {
    this.logger.debug('Getting restaurant status from Migros');

    try {
      const response = await this.apiRequest<{
        data: { isOpen: boolean; isBusy: boolean; prepareDuration: number };
        success: boolean;
      }>(`/Store/GetStoreInfoV2?storeId=${this.storeId}`, 'GET');

      if (response.success && response.data) {
        return {
          isOpen: response.data.isOpen ?? true,
          isBusy: response.data.isBusy ?? false,
          estimatedDeliveryTime: response.data.prepareDuration ?? 30,
        };
      }

      // Default status if API fails
      return { isOpen: true, isBusy: false, estimatedDeliveryTime: 30 };
    } catch (error) {
      this.logger.error(`Error getting Migros restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isOpen: true, isBusy: false, estimatedDeliveryTime: 30 };
    }
  }

  /**
   * Verify API credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.ensureValidToken();
      this.logger.log('Migros credentials verified successfully');
      return true;
    } catch (error) {
      this.logger.error(`Migros credential verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Store tokens from external login (called after Turnstile CAPTCHA login)
   */
  async storeTokens(accessToken: string, refreshToken: string, expiration: string): Promise<void> {
    this.accessToken = accessToken;
    this.tokenExpiresAt = new Date(expiration);

    await this.prisma.platformConfig.upsert({
      where: { platform: Platform.MIGROS },
      update: {
        accessToken,
        refreshToken,
        tokenExpiresAt: new Date(expiration),
        isActive: true,
      },
      create: {
        platform: Platform.MIGROS,
        accessToken,
        refreshToken,
        tokenExpiresAt: new Date(expiration),
        isActive: true,
        commissionRate: 13, // Migros commission rate
      },
    });

    this.logger.log('Migros tokens stored successfully');
  }
}

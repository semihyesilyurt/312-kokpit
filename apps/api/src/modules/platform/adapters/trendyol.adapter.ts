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

interface TrendyolOrderItem {
  id: string;
  name: string;
  productName: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface TrendyolOrder {
  id: string;
  packageId: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  customer: {
    name: string;
    phone?: string;
    address?: string;
  };
  items: TrendyolOrderItem[];
  deliveryType: 'GO' | 'PICKUP';
  paymentMethod: string;
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

      const orders: PlatformOrder[] = [];

      // Process new orders
      for (const order of response.newOrders || []) {
        orders.push(this.transformOrder(order, 'NEW'));
      }

      // Process picked (preparing) orders
      for (const order of response.pickedOrders || []) {
        orders.push(this.transformOrder(order, 'PICKED'));
      }

      // Process invoiced (ready) orders
      for (const order of response.invoicedOrders || []) {
        orders.push(this.transformOrder(order, 'INVOICED'));
      }

      // Process shipped (on delivery) orders
      for (const order of response.shippedOrders || []) {
        orders.push(this.transformOrder(order, 'SHIPPED'));
      }

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
    const totalAmount = trendyolOrder.totalAmount;
    const deliveryFee = 0; // Trendyol includes delivery in platform fee
    const discount = 0;
    const subtotal = totalAmount;

    // Map payment method
    let paymentMethod: 'CASH' | 'CREDIT_CARD' | 'ONLINE' = 'ONLINE';
    if (trendyolOrder.paymentMethod?.toLowerCase().includes('cash')) {
      paymentMethod = 'CASH';
    } else if (trendyolOrder.paymentMethod?.toLowerCase().includes('card')) {
      paymentMethod = 'CREDIT_CARD';
    }

    // Transform items
    const items = (trendyolOrder.items || []).map((item) => ({
      platformProductId: `TRENDYOL-${item.id || item.productName}`,
      name: item.productName || item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      notes: item.notes,
    }));

    return {
      platformOrderId: `TRENDYOL-${trendyolOrder.packageId || trendyolOrder.id}`,
      platform: Platform.TRENDYOL,
      customer: {
        name: trendyolOrder.customer?.name || 'Trendyol Müşteri',
        phone: trendyolOrder.customer?.phone || '+905000000000',
        address: trendyolOrder.customer?.address || '',
      },
      items,
      subtotal,
      deliveryFee,
      discount,
      totalAmount,
      paymentMethod,
      estimatedDeliveryMinutes: 35,
      createdAt: new Date(trendyolOrder.createdAt || Date.now()),
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

      // Note: Actual endpoint structure depends on Trendyol API
      await this.apiRequest(
        `${this.baseUrl}/sellers/packages/${packageId}/status`,
        'POST',
        { status: trendyolStatus },
      );

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
}

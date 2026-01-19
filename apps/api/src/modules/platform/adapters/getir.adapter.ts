/**
 * Getir Yemek Platform Adapter
 * Real implementation for Getir Yemek Restoran Panel integration
 * - Simple token-based authentication (no CAPTCHA required)
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
 * Getir API response types
 */
interface GetirLoginResponse {
  profile: {
    id: string;
    name: string;
    lastRestaurant: string;
    isAdmin: boolean;
  };
  restaurants: Array<{
    role: number;
    restaurant: string;
    isCompanyAuthority: boolean;
    name: string;
    city: { id: string; name: string };
    town: { id: string; name: string };
    district: { id: string; name: string };
  }>;
  tokenCode: string;
  isTokenV2: boolean;
  shouldRenewPassword: boolean;
}

interface GetirOrderProduct {
  id: string;
  name: string | { text?: string; name?: string };
  price: number;
  count: number;
  optionPrice?: number;
  note?: string;
  options?: Array<{
    name: string;
    price: number;
  }>;
}

interface GetirFoodOrder {
  id: string;
  confirmationId: string;
  status: number;
  totalPrice: number;
  paymentMethodText: string | { text?: string; name?: string };
  doNotKnock: boolean;
  dropOffAtDoor: boolean;
  isScheduled: boolean;
  note?: string;
  client: {
    name: string;
    phone?: string;
    deliveryAddress?: {
      address: string;
      latitude?: number;
      longitude?: number;
      apartmentNo?: string;
      doorNo?: string;
      floor?: string;
    };
  };
  products: GetirOrderProduct[];
  createdAt: string;
  checkoutDate: string;
  courier?: {
    name: string;
    phone?: string;
  };
}

interface GetirOrdersResponse {
  foodOrders: GetirFoodOrder[];
  foodOrdersCount: number;
  totalPrice: number;
  foodOrderDocumentEnabled: boolean;
}

/**
 * Getir status codes mapping
 */
const GETIR_STATUS_MAP: Record<number, OrderStatus> = {
  325: 'PENDING',      // Yeni
  350: 'CONFIRMED',    // Onaylandı
  400: 'PREPARING',    // Hazırlanıyor
  500: 'READY',        // Hazır
  550: 'ON_DELIVERY',  // Yolda
  600: 'DELIVERED',    // Teslim Edildi
  700: 'CANCELLED',    // İptal
  800: 'DELIVERED',    // Tamamlandı
};

/**
 * Internal status to Getir status mapping
 */
const INTERNAL_TO_GETIR_STATUS: Record<string, number> = {
  PENDING: 325,
  CONFIRMED: 350,
  PREPARING: 400,
  READY: 500,
  ON_DELIVERY: 550,
  DELIVERED: 600,
  CANCELLED: 700,
};

/**
 * Getir commission rate (12%)
 */
const GETIR_COMMISSION_RATE = 12;

@Injectable()
export class GetirAdapter implements PlatformAdapter, OnModuleInit {
  private readonly logger = new Logger(GetirAdapter.name);
  readonly platform = Platform.GETIR;

  // API Configuration
  private readonly baseUrl = 'https://food-panel-backend.getirapi.com';

  // Restaurant Configuration (312 Döner & Izgara)
  private restaurantId = '67320ac1295ed7335609aafa';

  // Credentials
  private readonly email = 'bilgi@vizyoncatering.com';
  private readonly password = '1Viz312.';

  // Token cache
  private tokenCode: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private isLoggingIn = false;
  private userId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set restaurant ID for multi-store support
   */
  setRestaurantId(restaurantId: string): void {
    this.restaurantId = restaurantId;
    this.logger.debug(`Restaurant ID set to: ${restaurantId}`);
  }

  /**
   * Get current restaurant ID
   */
  getRestaurantId(): string {
    return this.restaurantId;
  }

  /**
   * Initialize adapter on module start
   */
  async onModuleInit() {
    this.logger.log('Getir Yemek adapter initialized');
    await this.checkAndRefreshLogin();
  }

  /**
   * Check if login is needed and perform automatic login
   */
  async checkAndRefreshLogin(): Promise<void> {
    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.GETIR },
      });

      // If no config or token expired, perform login
      if (!config?.accessToken || !config?.tokenExpiresAt) {
        this.logger.log('No Getir token found, initiating automatic login...');
        await this.performAutomaticLogin();
        return;
      }

      // Check if token will expire in the next 30 minutes
      const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
      if (config.tokenExpiresAt < thirtyMinutesFromNow) {
        this.logger.log('Getir token expiring soon, performing login...');
        await this.performAutomaticLogin();
      } else {
        // Load cached token
        this.tokenCode = config.accessToken;
        this.tokenExpiresAt = config.tokenExpiresAt;
        this.logger.log('Getir token loaded from database');
      }
    } catch (error) {
      this.logger.error(`Login check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform automatic login using direct API calls
   * Getir uses simple token-based auth (no CAPTCHA required)
   */
  async performAutomaticLogin(): Promise<boolean> {
    if (this.isLoggingIn) {
      this.logger.debug('Login already in progress, skipping...');
      return false;
    }

    this.isLoggingIn = true;

    try {
      this.logger.log('Starting automatic Getir Yemek API login...');

      // Check reCAPTCHA status first
      const recaptchaResponse = await fetch(`${this.baseUrl}/users/login-recaptcha-status`);
      const recaptchaData = await recaptchaResponse.json();

      if (recaptchaData.isEnabled) {
        throw new Error('reCAPTCHA is enabled on Getir. Manual login required.');
      }

      this.logger.debug('reCAPTCHA is disabled, proceeding with login...');

      // Perform login
      const loginResponse = await fetch(`${this.baseUrl}/users/login`, {
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
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`Login failed: ${loginResponse.status} - ${errorText.substring(0, 200)}`);
      }

      const loginData: GetirLoginResponse = await loginResponse.json();

      if (!loginData.tokenCode) {
        throw new Error('No token in login response');
      }

      // Store user info
      this.userId = loginData.profile.id;

      // Store token
      await this.storeToken(loginData.tokenCode);

      // Update sync status
      await this.prisma.platformConfig.update({
        where: { platform: Platform.GETIR },
        data: {
          syncStatus: 'success',
          syncError: null,
        },
      });

      this.logger.log('Getir Yemek API login successful!');
      return true;
    } catch (error) {
      this.logger.error(`Automatic login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Update platform config with error status
      await this.prisma.platformConfig.upsert({
        where: { platform: Platform.GETIR },
        update: {
          syncStatus: 'login_failed',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
        create: {
          platform: Platform.GETIR,
          commissionRate: GETIR_COMMISSION_RATE,
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
   * IMPORTANT: Getir uses 'token' header, NOT 'Authorization: Bearer'
   */
  private getHeaders(): Record<string, string> {
    return {
      'token': this.tokenCode || '',
      'restaurantid': this.restaurantId,
      'panel-page': '/r/:id/orders',
      'panel-version': 'v3.660.4',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://restoran.getiryemek.com',
      'Referer': 'https://restoran.getiryemek.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<string> {
    // Check if token is still valid (with 5-minute buffer)
    if (this.tokenCode && this.tokenExpiresAt) {
      const bufferTime = 5 * 60 * 1000;
      if (new Date().getTime() < this.tokenExpiresAt.getTime() - bufferTime) {
        return this.tokenCode;
      }
    }

    // Load token from database
    const config = await this.prisma.platformConfig.findUnique({
      where: { platform: Platform.GETIR },
    });

    if (!config) {
      const loginSuccess = await this.performAutomaticLogin();
      if (loginSuccess && this.tokenCode) {
        return this.tokenCode;
      }
      throw new Error('Getir platform configuration not found and automatic login failed');
    }

    // Check database token validity
    if (config.accessToken && config.tokenExpiresAt) {
      const bufferTime = 5 * 60 * 1000;
      if (new Date().getTime() < config.tokenExpiresAt.getTime() - bufferTime) {
        this.tokenCode = config.accessToken;
        this.tokenExpiresAt = config.tokenExpiresAt;
        return this.tokenCode;
      }
    }

    // Token expired - perform new login
    this.logger.log('Token expired, performing automatic login...');
    const loginSuccess = await this.performAutomaticLogin();
    if (loginSuccess && this.tokenCode) {
      return this.tokenCode;
    }

    throw new Error('Getir token expired and automatic login failed');
  }

  /**
   * Make authenticated API request to Getir
   * Uses 'token' header (not 'Authorization: Bearer')
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: unknown,
  ): Promise<T> {
    await this.ensureValidToken();

    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    // Handle 401 - try re-login once
    if (response.status === 401) {
      this.logger.warn('Received 401, attempting re-login...');
      this.tokenCode = null;
      this.tokenExpiresAt = null;

      const loginSuccess = await this.performAutomaticLogin();
      if (loginSuccess) {
        // Retry the request with new token
        const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers: this.getHeaders(),
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
   * Fetch active orders from Getir Yemek
   */
  async fetchOrders(): Promise<PlatformOrder[]> {
    this.logger.debug('Fetching orders from Getir Yemek...');

    try {
      // Get orders from today
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const response = await this.apiRequest<GetirOrdersResponse>(
        `/restaurants/${this.restaurantId}/food-orders`,
        'POST',
        {
          status: [325, 350, 400, 500, 550], // Active statuses only
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      );

      const orders: PlatformOrder[] = [];

      for (const getirOrder of response.foodOrders || []) {
        orders.push(this.transformOrder(getirOrder));
      }

      this.logger.log(`Fetched ${orders.length} orders from Getir Yemek`);
      return orders;
    } catch (error) {
      this.logger.error(`Failed to fetch Getir orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Fetch ALL orders from Getir (including delivered/cancelled) for status sync
   * Used to sync Kokpit DB with Getir platform statuses
   */
  async fetchAllOrdersForSync(): Promise<PlatformOrder[]> {
    this.logger.debug('Fetching ALL orders from Getir for status sync...');

    try {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      // Include ALL statuses: PENDING(325), CONFIRMED(350), PREPARING(400),
      // READY(500), ON_DELIVERY(550), DELIVERED(600), CANCELLED(700), COMPLETED(800)
      const response = await this.apiRequest<GetirOrdersResponse>(
        `/restaurants/${this.restaurantId}/food-orders`,
        'POST',
        {
          status: [325, 350, 400, 500, 550, 600, 700, 800],
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      );

      const orders: PlatformOrder[] = [];

      for (const getirOrder of response.foodOrders || []) {
        orders.push(this.transformOrder(getirOrder));
      }

      this.logger.log(`Fetched ${orders.length} total orders from Getir for sync`);
      return orders;
    } catch (error) {
      this.logger.error(`Failed to fetch all Getir orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Transform Getir order to PlatformOrder format
   */
  private transformOrder(getirOrder: GetirFoodOrder): PlatformOrder {
    // Debug: log raw order data
    this.logger.debug(`Getir raw order totalPrice: ${getirOrder.totalPrice}`);

    // Getir returns prices in TL (not kuruş) - do NOT divide by 100
    const totalAmount = getirOrder.totalPrice;
    const deliveryFee = 0; // Getir includes delivery

    // Calculate subtotal from products - prices are in TL
    const subtotal = (getirOrder.products || []).reduce((sum, p) => {
      return sum + (p.price * p.count);
    }, 0);

    // Calculate discount as difference between product total and order total
    const discount = subtotal > totalAmount ? subtotal - totalAmount : 0;

    this.logger.debug(`Getir order: subtotal=${subtotal} TL, discount=${discount} TL, totalAmount=${totalAmount} TL`);

    // Map payment method
    let paymentMethod: 'CASH' | 'CREDIT_CARD' | 'ONLINE' = 'ONLINE';
    // paymentMethodText can be string or object with text property
    const paymentTextRaw = getirOrder.paymentMethodText;
    const paymentText = typeof paymentTextRaw === 'string'
      ? paymentTextRaw.toLowerCase()
      : (paymentTextRaw?.text || paymentTextRaw?.name || '').toLowerCase();
    if (paymentText.includes('nakit')) {
      paymentMethod = 'CASH';
    } else if (paymentText.includes('kart') && !paymentText.includes('online')) {
      paymentMethod = 'CREDIT_CARD';
    }

    // Build customer note
    const notes: string[] = [];
    if (getirOrder.doNotKnock) notes.push('Zile basma');
    if (getirOrder.dropOffAtDoor) notes.push('Kapıya bırak');
    if (getirOrder.note) notes.push(getirOrder.note);

    // Transform products - ensure name is string
    const items = (getirOrder.products || []).map((product) => {
      // Debug: log raw product data
      this.logger.debug(`Getir raw product: ${JSON.stringify(product)}`);

      // Extract product name from various possible structures
      let productName = 'Ürün';
      const rawName = product.name;

      if (typeof rawName === 'string') {
        productName = rawName;
      } else if (rawName && typeof rawName === 'object') {
        // Try common nested properties - Getir uses {tr: "...", en: "..."} format
        const nameObj = rawName as Record<string, unknown>;
        productName = String(
          nameObj.tr || nameObj.text || nameObj.name || nameObj.title ||
          nameObj.productName || nameObj.displayName ||
          JSON.stringify(nameObj)
        );
      }

      // Getir prices are in TL - no conversion needed
      const itemPrice = product.price;
      this.logger.debug(`Getir product "${productName}": unitPrice=${itemPrice} TL`);

      return {
        platformProductId: `GETIR-${product.id}`,
        name: productName,
        quantity: product.count,
        unitPrice: itemPrice,
        notes: product.note,
      };
    });

    // Build address
    const address = getirOrder.client?.deliveryAddress;
    let fullAddress = address?.address || '';
    if (address?.floor) fullAddress += `, Kat: ${address.floor}`;
    if (address?.apartmentNo) fullAddress += `, Daire: ${address.apartmentNo}`;
    if (address?.doorNo) fullAddress += `, Kapı: ${address.doorNo}`;

    // Map Getir status to internal status
    const platformStatus = GETIR_STATUS_MAP[getirOrder.status] || 'PENDING';
    this.logger.debug(`Getir order status: raw=${getirOrder.status}, mapped=${platformStatus}`);

    return {
      platformOrderId: `GETIR-${getirOrder.id}`,
      platformDisplayId: getirOrder.confirmationId || String(getirOrder.id),
      platform: Platform.GETIR,
      platformStatus,
      customer: {
        name: getirOrder.client?.name || 'Getir Müşteri',
        phone: getirOrder.client?.phone || '+905000000000',
        address: fullAddress,
        latitude: address?.latitude,
        longitude: address?.longitude,
        note: notes.join(' | ') || undefined,
      },
      items,
      subtotal: subtotal || totalAmount,
      deliveryFee,
      discount,
      totalAmount,
      paymentMethod,
      estimatedDeliveryMinutes: 35,
      createdAt: new Date(getirOrder.checkoutDate || getirOrder.createdAt),
    };
  }

  /**
   * Get current order status from Getir
   * Used to verify order state before making changes
   */
  async getOrderStatus(orderId: string): Promise<string | null> {
    try {
      const response = await this.apiRequest<{ status: number }>(
        `/food-orders/${orderId}`,
        'GET',
      );

      if (response?.status) {
        const mappedStatus = GETIR_STATUS_MAP[response.status];
        this.logger.debug(`Getir order ${orderId} current status: raw=${response.status}, mapped=${mappedStatus}`);
        return mappedStatus || null;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Could not get Getir order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Verify/Confirm order on Getir (auto-accept)
   * This is the primary method to accept pending orders
   */
  async verifyOrder(platformOrderId: string): Promise<boolean> {
    this.logger.debug(`Verifying order on Getir: ${platformOrderId}`);

    try {
      const orderId = platformOrderId.replace('GETIR-', '');

      await this.apiRequest(
        `/food-orders/${orderId}/verify`,
        'POST',
        {},
      );

      this.logger.log(`Order verified on Getir: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error verifying Getir order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Prepare order on Getir (Yola Çıkar / Send to delivery)
   * This marks the order as ready for delivery pickup
   */
  async prepareOrder(platformOrderId: string): Promise<boolean> {
    this.logger.debug(`Preparing order on Getir (Yola Çıkar): ${platformOrderId}`);

    try {
      const orderId = platformOrderId.replace('GETIR-', '');

      // First check current order status on Getir
      const currentStatus = await this.getOrderStatus(orderId);
      if (currentStatus === 'CANCELLED') {
        this.logger.warn(`Cannot prepare order ${platformOrderId}: Order is already CANCELLED on Getir`);
        throw new Error('Order is already cancelled on Getir platform');
      }
      if (currentStatus === 'DELIVERED') {
        this.logger.warn(`Cannot prepare order ${platformOrderId}: Order is already DELIVERED on Getir`);
        throw new Error('Order is already delivered on Getir platform');
      }

      const response = await this.apiRequest<{ success?: boolean; error?: string; message?: string }>(
        `/food-orders/${orderId}/prepare`,
        'POST',
        {},
      );

      // Check for error in response
      if (response?.error || response?.success === false) {
        const errorMsg = response.error || response.message || 'Unknown error from Getir';
        this.logger.error(`Getir rejected prepare request: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      this.logger.log(`Order prepared on Getir: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error preparing Getir order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error; // Re-throw so caller knows it failed
    }
  }

  /**
   * Deliver order on Getir (Teslim Edildi)
   * Marks order as delivered to customer
   */
  async deliverOrder(platformOrderId: string, courierId?: string): Promise<boolean> {
    this.logger.debug(`Delivering order on Getir (Teslim Edildi): ${platformOrderId}`);

    try {
      const orderId = platformOrderId.replace('GETIR-', '');

      await this.apiRequest(
        `/food-orders/${orderId}/deliver`,
        'POST',
        {
          courierId: courierId || '5dc073faf4d28e09f0377cad', // Default courier ID
          isRDU: false, // Restaurant Delivery Unit - false means Getir courier
        },
      );

      this.logger.log(`Order delivered on Getir: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error delivering Getir order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Accept order on Getir (with preparation time)
   */
  async acceptOrder(platformOrderId: string, estimatedMinutes: number = 25): Promise<boolean> {
    this.logger.debug(`Accepting order on Getir: ${platformOrderId}, estimated: ${estimatedMinutes}min`);

    try {
      const orderId = platformOrderId.replace('GETIR-', '');

      await this.apiRequest(
        `/restaurants/${this.restaurantId}/food-orders/${orderId}/accept`,
        'PUT',
        { preparationTime: estimatedMinutes },
      );

      this.logger.log(`Order accepted on Getir: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error accepting Getir order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Reject order on Getir
   */
  async rejectOrder(platformOrderId: string, reason: string): Promise<boolean> {
    this.logger.debug(`Rejecting order on Getir: ${platformOrderId}, reason: ${reason}`);

    try {
      const orderId = platformOrderId.replace('GETIR-', '');

      await this.apiRequest(
        `/restaurants/${this.restaurantId}/food-orders/${orderId}/reject`,
        'PUT',
        { reason },
      );

      this.logger.log(`Order rejected on Getir: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error rejecting Getir order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Update order status on Getir
   * Uses specific endpoints for certain status transitions
   */
  async updateOrderStatus(platformOrderId: string, status: OrderStatus): Promise<boolean> {
    this.logger.debug(`Updating order status on Getir: ${platformOrderId} -> ${status}`);

    try {
      // Use specific endpoints for certain statuses
      switch (status) {
        case 'ON_DELIVERY':
          // Yola Çıkar - use prepare endpoint
          return await this.prepareOrder(platformOrderId);

        case 'DELIVERED':
          // Teslim Edildi - use deliver endpoint
          return await this.deliverOrder(platformOrderId);

        case 'CONFIRMED':
          // Onayla - use verify endpoint
          return await this.verifyOrder(platformOrderId);

        case 'CANCELLED':
          // İptal - use reject endpoint
          return await this.rejectOrder(platformOrderId, 'İptal edildi');

        default:
          // For other statuses, use the generic status update endpoint
          const orderId = platformOrderId.replace('GETIR-', '');
          const getirStatus = INTERNAL_TO_GETIR_STATUS[status];

          if (!getirStatus) {
            this.logger.warn(`Unknown status mapping for: ${status}`);
            return false;
          }

          await this.apiRequest(
            `/restaurants/${this.restaurantId}/food-orders/${orderId}/status`,
            'PUT',
            { status: getirStatus },
          );

          this.logger.log(`Order status updated on Getir: ${platformOrderId} -> ${status}`);
          return true;
      }
    } catch (error) {
      this.logger.error(`Error updating Getir order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Sync menu to Getir (not supported via this API)
   */
  async syncMenu(products: PlatformProduct[]): Promise<SyncResult> {
    this.logger.warn('Menu sync not supported for Getir - manage menu through Getir Restoran Panel');

    return {
      success: false,
      recordsCount: 0,
      duration: 0,
      errorMessage: 'Menu sync not supported for Getir. Use Getir Restoran Panel.',
    };
  }

  /**
   * Set restaurant status on Getir
   */
  async setRestaurantStatus(status: RestaurantStatus): Promise<boolean> {
    this.logger.debug(`Setting restaurant status on Getir: isOpen=${status.isOpen}`);

    try {
      // Getir uses working-hours endpoint for status
      // This is a simplified implementation
      await this.apiRequest(
        `/restaurants/${this.restaurantId}/status`,
        'PUT',
        {
          isOpen: status.isOpen,
          isBusy: status.isBusy,
          pauseReason: status.pauseReason,
        },
      );

      this.logger.log(`Restaurant status updated on Getir: ${status.isOpen ? 'OPEN' : 'CLOSED'}`);
      return true;
    } catch (error) {
      this.logger.error(`Error setting Getir restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Get restaurant status from Getir
   */
  async getRestaurantStatus(): Promise<RestaurantStatus> {
    this.logger.debug('Getting restaurant status from Getir');

    try {
      const response = await this.apiRequest<{ isOpen: boolean; isBusy: boolean }>(
        `/restaurants/${this.restaurantId}/working-hours`,
      );

      return {
        isOpen: response.isOpen ?? true,
        isBusy: response.isBusy ?? false,
        estimatedDeliveryTime: 30,
      };
    } catch (error) {
      this.logger.error(`Error getting Getir restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isOpen: true, isBusy: false, estimatedDeliveryTime: 30 };
    }
  }

  /**
   * Verify API credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.ensureValidToken();
      this.logger.log('Getir credentials verified successfully');
      return true;
    } catch (error) {
      this.logger.error(`Getir credential verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Store token from login
   */
  async storeToken(token: string): Promise<void> {
    this.tokenCode = token;

    // Set expiration to 8 hours from now (Getir tokens typically last longer)
    this.tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await this.prisma.platformConfig.upsert({
      where: { platform: Platform.GETIR },
      update: {
        accessToken: token,
        tokenExpiresAt: this.tokenExpiresAt,
        isActive: true,
      },
      create: {
        platform: Platform.GETIR,
        accessToken: token,
        tokenExpiresAt: this.tokenExpiresAt,
        isActive: true,
        commissionRate: GETIR_COMMISSION_RATE,
      },
    });

    this.logger.log('Getir token stored successfully');
  }

  /**
   * Get working hours
   */
  async getWorkingHours(): Promise<{ restaurant: unknown; courier: unknown }> {
    return this.apiRequest(`/restaurants/${this.restaurantId}/working-hours`);
  }

  /**
   * Get financial info
   */
  async getFinancialInfo(): Promise<unknown> {
    return this.apiRequest(`/restaurants/${this.restaurantId}/financial`);
  }
}

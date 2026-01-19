/**
 * Yemeksepeti Partner Portal Platform Adapter
 * Real implementation for Yemeksepeti Partner Portal integration
 * - Playwright-based login with 2FA (email OTP) support
 * - Session persistence via Playwright storage state
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
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Yemeksepeti API response types
 */
interface YemeksepetiLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

/**
 * Yemeksepeti order item
 */
interface YemeksepetiOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  options?: Array<{
    name: string;
    price: number;
  }>;
}

/**
 * Yemeksepeti delivery/order structure
 */
interface YemeksepetiDelivery {
  id: string;
  deliveryId: string;
  shortCode: string;
  state: string;
  totalPrice: number;
  paymentType: string;
  createdAt: string;
  estimatedPreparationTime?: number;
  customer?: {
    name?: string;
    phone?: string;
  };
  address?: {
    address?: string;
    apartment?: string;
    entrance?: string;
    floor?: string;
    intercom?: string;
    latitude?: number;
    longitude?: number;
  };
  items?: YemeksepetiOrderItem[];
  note?: string;
  riderName?: string;
  riderEta?: string;
}

interface YemeksepetiOrdersResponse {
  deliveries?: YemeksepetiDelivery[];
  data?: {
    deliveries?: YemeksepetiDelivery[];
  };
}

/**
 * Yemeksepeti status to internal status mapping
 */
const YEMEKSEPETI_STATUS_MAP: Record<string, OrderStatus> = {
  new: 'PENDING',
  accepted: 'CONFIRMED',
  preparing: 'PREPARING',
  ready: 'READY',
  picked_up: 'ON_DELIVERY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  rejected: 'CANCELLED',
};

/**
 * Internal status to Yemeksepeti status mapping
 */
const INTERNAL_TO_YEMEKSEPETI_STATUS: Record<string, string> = {
  PENDING: 'new',
  CONFIRMED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  ON_DELIVERY: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

/**
 * Yemeksepeti commission rate (35%)
 */
const YEMEKSEPETI_COMMISSION_RATE = 35;

/**
 * Storage paths for session persistence
 */
const STORAGE_DIR = '/www/wwwroot/312/scr/yemeksepeti';
const AUTH_STORAGE_FILE = path.join(STORAGE_DIR, 'auth-storage.json');
const TOKEN_FILE = path.join(STORAGE_DIR, 'page-token.json');
const LOGIN_STATUS_FILE = path.join(STORAGE_DIR, 'login-status.json');
const AUTO_LOGIN_SCRIPT = path.join(STORAGE_DIR, 'auto-login.js');

@Injectable()
export class YemeksepetiAdapter implements PlatformAdapter, OnModuleInit {
  private readonly logger = new Logger(YemeksepetiAdapter.name);
  readonly platform = Platform.YEMEKSEPETI;

  // API Configuration
  private readonly baseUrl = 'https://bff-api.eu.prd.portal.restaurant';
  private readonly partnerPortal = 'https://partner-app.yemeksepeti.com';

  // Vendor Configuration (312 Döner & Izgara)
  private vendorId: string | null = null;

  // Credentials
  private readonly email = 'bilgi@vizyoncatering.com';
  private readonly password = '1.Viz2yon3';

  // Token cache
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private isLoggingIn = false;

  // Session cookies for API calls
  private sessionCookies: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize adapter on module start
   */
  async onModuleInit() {
    this.logger.log('Yemeksepeti Partner Portal adapter initialized');
    await this.loadStoredSession();
  }

  /**
   * Load stored session from files (Playwright storage state + token)
   */
  private async loadStoredSession(): Promise<void> {
    try {
      // Load token from page-token.json (extracted from localStorage)
      if (fs.existsSync(TOKEN_FILE)) {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        if (tokenData.token) {
          this.accessToken = tokenData.token;
          // Set expiration based on JWT (typically 4 hours)
          this.tokenExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
          this.logger.log('Loaded JWT token from page-token.json');

          // Store in database
          await this.storeTokens(this.accessToken!, null);
        }
      }

      // Load cookies from auth-storage.json (Playwright storage state)
      if (fs.existsSync(AUTH_STORAGE_FILE)) {
        const storageState = JSON.parse(fs.readFileSync(AUTH_STORAGE_FILE, 'utf8'));
        if (storageState.cookies && storageState.cookies.length > 0) {
          // Filter relevant cookies and format for API calls
          const relevantCookies = storageState.cookies.filter(
            (c: { domain: string }) =>
              c.domain.includes('yemeksepeti') ||
              c.domain.includes('portal.restaurant'),
          );

          this.sessionCookies = relevantCookies
            .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
            .join('; ');

          this.logger.log(`Loaded ${relevantCookies.length} session cookies from auth-storage.json`);
        }
      }

      // Also check database for stored token
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.YEMEKSEPETI },
      });

      if (config?.accessToken && config?.tokenExpiresAt) {
        // Use database token if file token is not available or expired
        if (!this.accessToken || (config.tokenExpiresAt > new Date() && config.tokenExpiresAt > (this.tokenExpiresAt || new Date(0)))) {
          this.accessToken = config.accessToken;
          this.refreshToken = config.refreshToken;
          this.tokenExpiresAt = config.tokenExpiresAt;
          this.logger.log('Using token from database');
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load stored session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if login is needed and trigger Playwright-based login
   * Yemeksepeti requires Playwright due to PerimeterX protection
   */
  async checkAndRefreshLogin(): Promise<void> {
    try {
      // Reload stored session first
      await this.loadStoredSession();

      // Check if token is still valid
      if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
        const remainingMinutes = Math.round((this.tokenExpiresAt.getTime() - Date.now()) / 60000);
        this.logger.debug(`Yemeksepeti token valid for ${remainingMinutes} more minutes`);

        // Refresh if expiring in less than 30 minutes
        if (remainingMinutes < 30) {
          this.logger.log('Yemeksepeti token expiring soon, triggering session refresh...');
          await this.triggerPlaywrightLogin();
        }
        return;
      }

      // No valid token - need to login
      this.logger.log('No valid Yemeksepeti token found, triggering Playwright login...');
      await this.triggerPlaywrightLogin();
    } catch (error) {
      this.logger.error(`Login check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Trigger Playwright-based login by running auto-login.js with Xvfb
   * This script handles PerimeterX bypass and 2FA via email OTP automatically
   */
  async triggerPlaywrightLogin(): Promise<boolean> {
    if (this.isLoggingIn) {
      this.logger.debug('Login already in progress, skipping...');
      return false;
    }

    this.isLoggingIn = true;

    try {
      this.logger.log('Starting automatic Yemeksepeti Playwright login with Xvfb...');

      // Update status
      await this.prisma.platformConfig.upsert({
        where: { platform: Platform.YEMEKSEPETI },
        update: {
          syncStatus: 'logging_in',
          syncError: null,
        },
        create: {
          platform: Platform.YEMEKSEPETI,
          commissionRate: YEMEKSEPETI_COMMISSION_RATE,
          syncStatus: 'logging_in',
          syncError: null,
        },
      });

      // Run auto-login.js with xvfb-run for headless server
      const success = await this.runAutoLoginScript();

      if (success) {
        // Reload tokens from saved files
        await this.loadStoredSession();

        if (this.accessToken) {
          this.logger.log('Yemeksepeti automatic login successful!');

          await this.prisma.platformConfig.update({
            where: { platform: Platform.YEMEKSEPETI },
            data: {
              syncStatus: 'success',
              syncError: null,
            },
          });

          return true;
        }
      }

      // Login failed
      const statusFile = fs.existsSync(LOGIN_STATUS_FILE)
        ? JSON.parse(fs.readFileSync(LOGIN_STATUS_FILE, 'utf8'))
        : { message: 'Unknown error' };

      await this.prisma.platformConfig.update({
        where: { platform: Platform.YEMEKSEPETI },
        data: {
          syncStatus: 'login_failed',
          syncError: statusFile.message || 'Automatic login failed',
        },
      });

      this.logger.error(`Yemeksepeti automatic login failed: ${statusFile.message}`);
      return false;
    } catch (error) {
      this.logger.error(`Playwright login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      await this.prisma.platformConfig.upsert({
        where: { platform: Platform.YEMEKSEPETI },
        update: {
          syncStatus: 'login_failed',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
        create: {
          platform: Platform.YEMEKSEPETI,
          commissionRate: YEMEKSEPETI_COMMISSION_RATE,
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
   * Run auto-login.js script with Xvfb for headless environment
   * Returns true if login was successful
   */
  private runAutoLoginScript(): Promise<boolean> {
    return new Promise((resolve) => {
      this.logger.log('Spawning xvfb-run with auto-login.js...');

      // Use xvfb-run to create virtual display for headless server
      const child = spawn('xvfb-run', [
        '--auto-servernum',
        '--server-args=-screen 0 1920x1080x24',
        'node',
        AUTO_LOGIN_SCRIPT,
      ], {
        cwd: STORAGE_DIR,
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log important messages
        if (output.includes('[STATUS]') || output.includes('[SUCCESS]') ||
            output.includes('[ERROR]') || output.includes('[2FA]')) {
          this.logger.log(`[AutoLogin] ${output.trim()}`);
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set timeout for login process (3 minutes max)
      const timeout = setTimeout(() => {
        this.logger.warn('Auto-login script timeout, killing process...');
        child.kill('SIGTERM');
        resolve(false);
      }, 180000);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          this.logger.log('Auto-login script completed successfully');
          resolve(true);
        } else {
          this.logger.error(`Auto-login script exited with code ${code}`);
          if (stderr) {
            this.logger.error(`Stderr: ${stderr.substring(0, 500)}`);
          }
          resolve(false);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        this.logger.error(`Failed to spawn auto-login script: ${err.message}`);
        resolve(false);
      });
    });
  }

  /**
   * Perform automatic login (wrapper for triggerPlaywrightLogin)
   */
  async performAutomaticLogin(): Promise<boolean> {
    return this.triggerPlaywrightLogin();
  }

  /**
   * Get API request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-app-name': 'one-web',
      'Origin': this.partnerPortal,
      'Referer': `${this.partnerPortal}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    if (this.sessionCookies) {
      headers['Cookie'] = this.sessionCookies;
    }

    return headers;
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

    // Reload from files
    await this.loadStoredSession();

    if (this.accessToken) {
      return this.accessToken;
    }

    // No valid token available
    throw new Error('Yemeksepeti token expired. Manual login required via Playwright.');
  }

  /**
   * Make authenticated API request to Yemeksepeti
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: unknown,
  ): Promise<T> {
    const token = await this.ensureValidToken();

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

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

    // Handle 401/403 - need re-login
    if (response.status === 401 || response.status === 403) {
      this.logger.warn(`Received ${response.status}, session expired. Manual login required.`);
      this.accessToken = null;
      this.tokenExpiresAt = null;

      // Update platform config
      await this.prisma.platformConfig.update({
        where: { platform: Platform.YEMEKSEPETI },
        data: {
          syncStatus: 'login_required',
          syncError: 'Session expired. Run: node /www/wwwroot/312/scr/yemeksepeti/hybrid-login.js',
        },
      });

      throw new Error('Authentication failed. Manual Playwright login required.');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    return response.json();
  }

  /**
   * Fetch active orders from Yemeksepeti Partner Portal
   * Note: Yemeksepeti uses WebSocket for live orders, API endpoint returns empty when no active orders
   */
  async fetchOrders(): Promise<PlatformOrder[]> {
    this.logger.debug('Fetching orders from Yemeksepeti Partner Portal...');

    try {
      const token = await this.ensureValidToken();

      // Yemeksepeti API requires specific headers and may use different endpoints
      // Try to get active deliveries
      const headers = {
        ...this.getHeaders(),
        Authorization: `Bearer ${token}`,
      };

      // Try the main deliveries endpoint first
      try {
        const response = await fetch(`${this.baseUrl}/deliveries`, {
          method: 'GET',
          headers,
        });

        if (response.ok) {
          const data = await response.json();
          const deliveries = data?.deliveries || data?.data?.deliveries || [];

          if (Array.isArray(deliveries) && deliveries.length > 0) {
            const orders = deliveries
              .filter((d: YemeksepetiDelivery) => d.state !== 'delivered' && d.state !== 'cancelled')
              .map((delivery: YemeksepetiDelivery) => this.transformOrder(delivery));

            this.logger.log(`Fetched ${orders.length} active orders from Yemeksepeti`);
            return orders;
          }
        }
      } catch (error) {
        this.logger.debug(`Deliveries endpoint error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // If no orders found, return empty array (this is normal when no active orders)
      this.logger.debug('No active orders from Yemeksepeti (this is normal when there are no orders)');
      return [];
    } catch (error) {
      this.logger.error(`Failed to fetch Yemeksepeti orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Transform Yemeksepeti delivery to PlatformOrder format
   */
  private transformOrder(delivery: YemeksepetiDelivery): PlatformOrder {
    const totalAmount = delivery.totalPrice || 0;
    const deliveryFee = 0;
    const discount = 0;
    const subtotal = totalAmount;

    // Map payment method
    let paymentMethod: 'CASH' | 'CREDIT_CARD' | 'ONLINE' = 'ONLINE';
    const paymentType = (delivery.paymentType || '').toLowerCase();
    if (paymentType.includes('cash') || paymentType === 'nakit') {
      paymentMethod = 'CASH';
    } else if (paymentType.includes('card') && !paymentType.includes('online')) {
      paymentMethod = 'CREDIT_CARD';
    }

    // Transform items
    const items = (delivery.items || []).map((item) => ({
      platformProductId: `YEMEKSEPETI-${item.id}`,
      name: item.name,
      quantity: item.quantity || 1,
      unitPrice: item.price || 0,
      notes: item.notes,
    }));

    // Build full address
    let fullAddress = delivery.address?.address || '';
    if (delivery.address?.floor) fullAddress += `, Kat: ${delivery.address.floor}`;
    if (delivery.address?.apartment) fullAddress += `, Daire: ${delivery.address.apartment}`;
    if (delivery.address?.entrance) fullAddress += `, Giriş: ${delivery.address.entrance}`;
    if (delivery.address?.intercom) fullAddress += `, Dahili: ${delivery.address.intercom}`;

    // Build customer note
    const notes: string[] = [];
    if (delivery.note) notes.push(delivery.note);
    if (delivery.riderName) notes.push(`Kurye: ${delivery.riderName}`);
    if (delivery.riderEta) notes.push(`ETA: ${delivery.riderEta}`);

    // Map Yemeksepeti status to internal status
    const platformStatus = YEMEKSEPETI_STATUS_MAP[delivery.state?.toLowerCase()] || 'PENDING';

    return {
      platformOrderId: `YEMEKSEPETI-${delivery.deliveryId || delivery.id}`,
      platformDisplayId: delivery.shortCode || delivery.deliveryId || delivery.id,
      platform: Platform.YEMEKSEPETI,
      platformStatus,
      customer: {
        name: delivery.customer?.name || 'Yemeksepeti Müşteri',
        phone: delivery.customer?.phone || '+905000000000',
        address: fullAddress,
        latitude: delivery.address?.latitude,
        longitude: delivery.address?.longitude,
        note: notes.join(' | ') || undefined,
      },
      items,
      subtotal,
      deliveryFee,
      discount,
      totalAmount,
      paymentMethod,
      estimatedDeliveryMinutes: delivery.estimatedPreparationTime || 35,
      createdAt: new Date(delivery.createdAt || Date.now()),
    };
  }

  /**
   * Accept order on Yemeksepeti
   */
  async acceptOrder(platformOrderId: string, estimatedMinutes: number = 25): Promise<boolean> {
    this.logger.debug(`Accepting order on Yemeksepeti: ${platformOrderId}, estimated: ${estimatedMinutes}min`);

    try {
      const deliveryId = platformOrderId.replace('YEMEKSEPETI-', '');

      await this.apiRequest(
        `/deliveries/${deliveryId}/acceptance`,
        'POST',
        { preparationTime: estimatedMinutes },
      );

      this.logger.log(`Order accepted on Yemeksepeti: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error accepting Yemeksepeti order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Reject order on Yemeksepeti
   */
  async rejectOrder(platformOrderId: string, reason: string): Promise<boolean> {
    this.logger.debug(`Rejecting order on Yemeksepeti: ${platformOrderId}, reason: ${reason}`);

    try {
      const deliveryId = platformOrderId.replace('YEMEKSEPETI-', '');

      await this.apiRequest(
        `/deliveries/${deliveryId}/reasons/reject/restaurant`,
        'POST',
        { reason },
      );

      this.logger.log(`Order rejected on Yemeksepeti: ${platformOrderId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error rejecting Yemeksepeti order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Update order status on Yemeksepeti
   */
  async updateOrderStatus(platformOrderId: string, status: OrderStatus): Promise<boolean> {
    this.logger.debug(`Updating order status on Yemeksepeti: ${platformOrderId} -> ${status}`);

    try {
      const deliveryId = platformOrderId.replace('YEMEKSEPETI-', '');
      const yemeksepetiStatus = INTERNAL_TO_YEMEKSEPETI_STATUS[status];

      if (!yemeksepetiStatus) {
        this.logger.warn(`Unknown status mapping for: ${status}`);
        return false;
      }

      // Different endpoints for different status transitions
      let endpoint = `/deliveries/${deliveryId}/state`;
      let body: Record<string, unknown> = { state: yemeksepetiStatus };

      if (status === 'PREPARING') {
        // No specific endpoint needed, use acceptance
      } else if (status === 'READY') {
        endpoint = `/deliveries/${deliveryId}/preparation-completion`;
        body = {};
      } else if (status === 'ON_DELIVERY') {
        endpoint = `/deliveries/${deliveryId}/received-by-vendor`;
        body = {};
      }

      await this.apiRequest(endpoint, 'POST', body);

      this.logger.log(`Order status updated on Yemeksepeti: ${platformOrderId} -> ${yemeksepetiStatus}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating Yemeksepeti order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Sync menu to Yemeksepeti (not supported - manage through partner portal)
   */
  async syncMenu(products: PlatformProduct[]): Promise<SyncResult> {
    this.logger.warn('Menu sync not supported for Yemeksepeti - manage menu through Partner Portal');

    return {
      success: false,
      recordsCount: 0,
      duration: 0,
      errorMessage: 'Menu sync not supported for Yemeksepeti. Use Partner Portal.',
    };
  }

  /**
   * Set restaurant status on Yemeksepeti
   */
  async setRestaurantStatus(status: RestaurantStatus): Promise<boolean> {
    this.logger.debug(`Setting restaurant status on Yemeksepeti: isOpen=${status.isOpen}`);

    try {
      // Yemeksepeti uses platform config endpoint for availability
      const endpoint = `/platforms/config/availabilities`;

      await this.apiRequest(endpoint, 'POST', {
        isOpen: status.isOpen,
        pauseReason: status.pauseReason,
      });

      this.logger.log(`Restaurant status updated on Yemeksepeti: ${status.isOpen ? 'OPEN' : 'CLOSED'}`);
      return true;
    } catch (error) {
      this.logger.error(`Error setting Yemeksepeti restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Get restaurant status from Yemeksepeti
   */
  async getRestaurantStatus(): Promise<RestaurantStatus> {
    this.logger.debug('Getting restaurant status from Yemeksepeti');

    try {
      const response = await this.apiRequest<{ isOpen?: boolean; isBusy?: boolean }>(
        '/platforms/config/availabilities',
      );

      return {
        isOpen: response.isOpen ?? true,
        isBusy: response.isBusy ?? false,
        estimatedDeliveryTime: 30,
      };
    } catch (error) {
      this.logger.error(`Error getting Yemeksepeti restaurant status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isOpen: true, isBusy: false, estimatedDeliveryTime: 30 };
    }
  }

  /**
   * Verify API credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.ensureValidToken();
      this.logger.log('Yemeksepeti credentials verified successfully');
      return true;
    } catch (error) {
      this.logger.error(`Yemeksepeti credential verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Store tokens from login
   */
  async storeTokens(accessToken: string, refreshToken?: string | null): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || null;

    // Set expiration to 4 hours from now (typical JWT lifetime)
    this.tokenExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

    await this.prisma.platformConfig.upsert({
      where: { platform: Platform.YEMEKSEPETI },
      update: {
        accessToken,
        refreshToken: refreshToken || undefined,
        tokenExpiresAt: this.tokenExpiresAt,
        isActive: true,
      },
      create: {
        platform: Platform.YEMEKSEPETI,
        accessToken,
        refreshToken: refreshToken || undefined,
        tokenExpiresAt: this.tokenExpiresAt,
        isActive: true,
        commissionRate: YEMEKSEPETI_COMMISSION_RATE,
      },
    });

    this.logger.log('Yemeksepeti tokens stored successfully');
  }

  /**
   * Get vendor information
   */
  async getVendorInfo(): Promise<{ id: string; name: string } | null> {
    try {
      const response = await this.apiRequest<{ id: string; name: string }>('/vendors/me');
      this.vendorId = response.id;
      return response;
    } catch (error) {
      this.logger.error(`Error getting vendor info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Get current access token (for sync scheduler)
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get token expiration (for sync scheduler)
   */
  getTokenExpiresAt(): Date | null {
    return this.tokenExpiresAt;
  }
}

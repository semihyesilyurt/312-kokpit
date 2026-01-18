import { Coordinates } from '../types';
import { CURRENCY } from '../constants';

// ============================================================================
// ORDER NUMBER GENERATION
// ============================================================================

/**
 * Generates a unique order number with format: YYYYMMDD-XXXX-RRRR
 * - YYYYMMDD: Date component
 * - XXXX: Branch code (padded)
 * - RRRR: Random alphanumeric sequence
 *
 * @param branchCode - Branch identifier code
 * @returns Unique order number string
 */
export function generateOrderNumber(branchCode: string = '0001'): string {
  const now = new Date();
  const dateStr = formatDateComponent(now);
  const paddedBranchCode = branchCode.padStart(4, '0').slice(0, 4).toUpperCase();
  const randomPart = generateRandomAlphanumeric(4);

  return `${dateStr}-${paddedBranchCode}-${randomPart}`;
}

/**
 * Format date as YYYYMMDD
 */
function formatDateComponent(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Generate random alphanumeric string
 */
function generateRandomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded similar chars: I, O, 0, 1
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique ID with optional prefix
 */
export function generateUniqueId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${randomPart}` : `${timestamp}${randomPart}`;
}

// ============================================================================
// DISTANCE CALCULATION
// ============================================================================

/**
 * Earth radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the distance between two geographic coordinates using the Haversine formula.
 * Returns distance in kilometers.
 *
 * @param point1 - First coordinate point
 * @param point2 - Second coordinate point
 * @returns Distance in kilometers (rounded to 2 decimal places)
 */
export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const lat1Rad = degreesToRadians(point1.latitude);
  const lat2Rad = degreesToRadians(point2.latitude);
  const deltaLat = degreesToRadians(point2.latitude - point1.latitude);
  const deltaLon = degreesToRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Number(distance.toFixed(2));
}

/**
 * Convert degrees to radians
 */
function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if a point is within a radius from a center point
 *
 * @param center - Center coordinate point
 * @param point - Point to check
 * @param radiusKm - Radius in kilometers
 * @returns True if point is within the radius
 */
export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusKm: number
): boolean {
  const distance = calculateDistance(center, point);
  return distance <= radiusKm;
}

/**
 * Calculate estimated delivery time based on distance
 *
 * @param distanceKm - Distance in kilometers
 * @param averageSpeedKmh - Average speed in km/h (default: 25 for urban delivery)
 * @returns Estimated time in minutes
 */
export function estimateDeliveryTime(distanceKm: number, averageSpeedKmh: number = 25): number {
  const timeHours = distanceKm / averageSpeedKmh;
  const timeMinutes = Math.ceil(timeHours * 60);
  // Add buffer time for traffic and pickup
  return timeMinutes + 5;
}

// ============================================================================
// CURRENCY FORMATTING
// ============================================================================

/**
 * Format a number as Turkish Lira currency.
 *
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  options: CurrencyFormatOptions = {}
): string {
  const {
    showSymbol = true,
    locale = CURRENCY.LOCALE,
    decimals = CURRENCY.DECIMAL_PLACES,
  } = options;

  const formatter = new Intl.NumberFormat(locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency: CURRENCY.CODE,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return formatter.format(amount);
}

/**
 * Currency format options
 */
export interface CurrencyFormatOptions {
  showSymbol?: boolean;
  locale?: string;
  decimals?: number;
}

/**
 * Parse a currency string back to number
 *
 * @param currencyString - The currency string to parse
 * @returns Numeric value
 */
export function parseCurrency(currencyString: string): number {
  // Remove currency symbol and thousand separators, replace decimal comma with dot
  const cleaned = currencyString
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Format percentage
 *
 * @param value - The value to format (e.g., 0.25 for 25%)
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `%${(value * 100).toFixed(decimals)}`;
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format a date according to Turkish locale.
 *
 * @param date - The date to format (Date object, timestamp, or ISO string)
 * @param format - Format type: 'date', 'time', 'datetime', 'relative'
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | number | string,
  format: DateFormatType = 'datetime'
): string {
  const dateObj = normalizeDate(date);

  if (!isValidDate(dateObj)) {
    return '-';
  }

  switch (format) {
    case 'date':
      return formatDateOnly(dateObj);
    case 'time':
      return formatTimeOnly(dateObj);
    case 'datetime':
      return formatDateTime(dateObj);
    case 'relative':
      return formatRelativeTime(dateObj);
    case 'iso':
      return dateObj.toISOString();
    default:
      return formatDateTime(dateObj);
  }
}

/**
 * Date format type options
 */
export type DateFormatType = 'date' | 'time' | 'datetime' | 'relative' | 'iso';

/**
 * Normalize various date inputs to Date object
 */
function normalizeDate(date: Date | number | string): Date {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'number') {
    return new Date(date);
  }
  return new Date(date);
}

/**
 * Check if a date is valid
 */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Format date only (DD.MM.YYYY)
 */
function formatDateOnly(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Format time only (HH:mm)
 */
function formatTimeOnly(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format date and time (DD.MM.YYYY HH:mm)
 */
function formatDateTime(date: Date): string {
  return `${formatDateOnly(date)} ${formatTimeOnly(date)}`;
}

/**
 * Format relative time (e.g., "5 dakika once")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Az once';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} dakika once`;
  }
  if (diffHours < 24) {
    return `${diffHours} saat once`;
  }
  if (diffDays < 7) {
    return `${diffDays} gun once`;
  }
  return formatDateOnly(date);
}

/**
 * Get start of day for a date
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day for a date
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate Turkish phone number
 *
 * @param phone - Phone number to validate
 * @returns True if valid Turkish phone format
 */
export function isValidTurkishPhone(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  // Turkish mobile: 05XX XXX XX XX (10 digits starting with 5)
  // With country code: 905XX XXX XX XX (12 digits starting with 90)
  const mobilePattern = /^(90)?5\d{9}$/;
  return mobilePattern.test(cleaned);
}

/**
 * Format Turkish phone number
 *
 * @param phone - Phone number to format
 * @returns Formatted phone string
 */
export function formatTurkishPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('5')) {
    return `0${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('05')) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('90')) {
    return `+90 ${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10)}`;
  }
  return phone;
}

/**
 * Validate email format
 *
 * @param email - Email to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Truncate string with ellipsis
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Capitalize first letter of each word
 *
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate slug from string
 *
 * @param str - String to convert
 * @returns URL-safe slug
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

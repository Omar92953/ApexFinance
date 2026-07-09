import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_CONFIG: Record<string, { locale: string; currency: string }> = {
  USD: { locale: 'en-US', currency: 'USD' },
  EUR: { locale: 'de-DE', currency: 'EUR' },
  GBP: { locale: 'en-GB', currency: 'GBP' },
  AED: { locale: 'ar-AE', currency: 'AED' },
  SAR: { locale: 'ar-SA', currency: 'SAR' },
  EGP: { locale: 'ar-EG', currency: 'EGP' },
};

// Currencies that display as "12,500 CODE" (number first, code after)
const TRAILING_CODE_CURRENCIES = ['EGP', 'SAR', 'AED'];

export function formatCurrency(value: number, currency = 'EGP', precise = false): string {
  const decimals = precise ? 2 : 0;
  if (TRAILING_CODE_CURRENCIES.includes(currency)) {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(precise ? value : Math.round(value));
    return `${formatted} ${currency}`;
  }
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.USD;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(precise ? value : Math.round(value));
}

export function formatCurrencyRounded(value: number, currency = 'EGP'): string {
  if (TRAILING_CODE_CURRENCIES.includes(currency)) {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
    return `${formatted} ${currency}`;
  }
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.USD;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function getCurrencySymbol(currency = 'EGP'): string {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SAR: '﷼', EGP: 'E£',
  };
  return symbols[currency] || '$';
}

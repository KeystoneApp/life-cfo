export type FormatMoneyOptions = {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  fallbackCurrency?: string;
};

const DEFAULT_FALLBACK_CURRENCY = "AUD";

function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resolveDigits(options?: FormatMoneyOptions) {
  const minimumFractionDigits =
    typeof options?.minimumFractionDigits === "number"
      ? options.minimumFractionDigits
      : 2;
  const maximumFractionDigits =
    typeof options?.maximumFractionDigits === "number"
      ? options.maximumFractionDigits
      : 2;

  return {
    minimumFractionDigits,
    maximumFractionDigits: Math.max(maximumFractionDigits, minimumFractionDigits),
  };
}

function hasValidCurrencyCode(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(0);
    return true;
  } catch {
    return false;
  }
}

function decimalAmountString(
  amount: number,
  locale: string | undefined,
  minimumFractionDigits: number,
  maximumFractionDigits: number
): string {
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

export function normalizeCurrencyCode(input?: string | null, fallback?: string): string {
  const preferred = String(input || "")
    .trim()
    .toUpperCase();
  if (preferred) return preferred;

  const fallbackCode = String(fallback || DEFAULT_FALLBACK_CURRENCY)
    .trim()
    .toUpperCase();
  return fallbackCode || DEFAULT_FALLBACK_CURRENCY;
}

export function formatMoneyFromAmount(
  amount: number | null | undefined,
  currency?: string | null,
  options?: FormatMoneyOptions
): string {
  const safeAmount = safeNumber(amount);
  const fallbackCurrency = normalizeCurrencyCode(
    options?.fallbackCurrency,
    DEFAULT_FALLBACK_CURRENCY
  );
  const code = normalizeCurrencyCode(currency, fallbackCurrency);
  const locale = options?.locale;
  const digits = resolveDigits(options);

  if (hasValidCurrencyCode(code)) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        minimumFractionDigits: digits.minimumFractionDigits,
        maximumFractionDigits: digits.maximumFractionDigits,
      }).format(safeAmount);
    } catch {
      // fall through to explicit CODE output below
    }
  }

  return `${code} ${decimalAmountString(
    safeAmount,
    locale,
    digits.minimumFractionDigits,
    digits.maximumFractionDigits
  )}`;
}

export function formatMoneyFromCents(
  cents: number | null | undefined,
  currency?: string | null,
  options?: FormatMoneyOptions
): string {
  const safeCents = safeNumber(cents);
  return formatMoneyFromAmount(safeCents / 100, currency, options);
}

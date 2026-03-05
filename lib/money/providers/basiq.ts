// lib/money/providers/basiq.ts
import type { MoneyProvider } from "./types";

const BASIQ_BASE_URL = process.env.BASIQ_BASE_URL || "https://au-api.basiq.io";
const BASIQ_API_KEY = (process.env.BASIQ_API_KEY || "").trim();

// Basiq uses a version header; docs mention valid versions like 2.0-2.1.
// We'll use 2.1 by default.
const BASIQ_VERSION = (process.env.BASIQ_VERSION || "2.1").trim();

function assertEnv() {
  if (!BASIQ_API_KEY) throw new Error("Missing BASIQ_API_KEY");
}

function buildBasicAuthHeader(apiKey: string) {
  // Basiq token endpoint uses Basic auth with apiKey as username and blank password.
  // That means base64("apiKey:")
  const raw = `${apiKey}:`;
  const encoded = Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

// Simple in-memory token cache (Node runtime). Token is valid ~1 hour.
let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getBasiqBearerToken(): Promise<string> {
  assertEnv();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(BASIQ_API_KEY),
      Accept: "application/json",
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq token error (${res.status}): ${text}`);
  }

  const json: any = await res.json();
  const token = String(json?.access_token || json?.token || "");
  const expiresInSec = Number(json?.expires_in ?? 3600);

  if (!token) {
    throw new Error("Basiq token response missing access_token");
  }

  cachedToken = {
    token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  };

  return token;
}

export async function basiqFetch(path: string, options: RequestInit = {}) {
  const bearer = await getBasiqBearerToken();

  const res = await fetch(`${BASIQ_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq API error (${res.status}): ${text}`);
  }

  return res.json();
}

// Low-level helpers (expect a BASIQ userId) — used later in sync
export async function getBasiqAccounts(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/accounts`);
  return data?.data ?? data ?? [];
}

export async function getBasiqTransactions(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/transactions`);
  return data?.data ?? data ?? [];
}

// Provider stub for now — we’ll wire sync once we store basiq_user_id in external_connections.item_id
export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync() {
    throw new Error(
      "basiqProvider.sync() not wired yet: need basiq_user_id stored on external_connections (we'll do next)."
    );
  },
};
// lib/money/providers/basiq.ts
import type { MoneyProvider } from "./types";

const BASIQ_BASE_URL = process.env.BASIQ_BASE_URL || "https://au-api.basiq.io";
const BASIQ_API_KEY = (process.env.BASIQ_API_KEY || "").trim();

// v3.0 is current in the Quickstart examples; you can override via env if needed.
const BASIQ_VERSION = (process.env.BASIQ_VERSION || "3.0").trim();

// Token scopes: Quickstart uses SERVER_ACCESS for server-to-server API use.
const BASIQ_TOKEN_SCOPE = (process.env.BASIQ_TOKEN_SCOPE || "SERVER_ACCESS").trim();

function assertEnv() {
  if (!BASIQ_API_KEY) throw new Error("Missing BASIQ_API_KEY");
}

// Simple in-memory token cache (Node runtime). Token is valid ~60 minutes.
let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getBasiqBearerToken(): Promise<string> {
  assertEnv();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  // IMPORTANT: /token expects x-www-form-urlencoded body with scope
  const form = new URLSearchParams();
  form.set("scope", BASIQ_TOKEN_SCOPE);

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIQ_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": BASIQ_VERSION,
    },
    body: form.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq token error (${res.status}): ${text}`);
  }

  const json: any = await res.json();
  const token = String(json?.access_token || "");
  const expiresInSec = Number(json?.expires_in ?? 3600);

  if (!token) throw new Error("Basiq token response missing access_token");

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
      Accept: "application/json",
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
      ...(options.headers || {}),
      // keep Authorization LAST so nothing overrides it
      Authorization: `Bearer ${bearer}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq API error (${res.status}): ${text}`);
  }

  return res.json();
}

// Low-level helpers (expect a BASIQ userId)
export async function getBasiqAccounts(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/accounts`);
  return data?.data ?? data ?? [];
}

export async function getBasiqTransactions(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/transactions`);
  return data?.data ?? data ?? [];
}

// Provider stub for now
export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync() {
    throw new Error(
      "basiqProvider.sync() not wired yet: need basiq_user_id stored on external_connections.item_id (we'll do next)."
    );
  },
};
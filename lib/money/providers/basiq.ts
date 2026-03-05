// lib/money/providers/basiq.ts
import type { MoneyProvider } from "./types";

const BASIQ_BASE_URL = process.env.BASIQ_BASE_URL || "https://au-api.basiq.io";
const BASIQ_API_KEY = (process.env.BASIQ_API_KEY || "").trim();

// Basiq docs / quickstart currently use basiq-version: 3.0
const BASIQ_VERSION = (process.env.BASIQ_VERSION || "3.0").trim();

function assertEnv() {
  if (!BASIQ_API_KEY) throw new Error("Missing BASIQ_API_KEY");

  // Very common pitfall: copying only the base64-looking part, but the full key is often like:
  // basiq-api-key=xxxxxxxx
  // If there is no '=' at all, it's extremely likely the key was pasted incomplete.
  if (!BASIQ_API_KEY.includes("=")) {
    throw new Error(
      "BASIQ_API_KEY looks incomplete (no '=' found). Paste the FULL key exactly as shown in the Basiq dashboard (it often includes a prefix like 'basiq-api-key=...')."
    );
  }
}

// Simple in-memory token cache (Node runtime). Token expires ~60 mins; refresh early.
let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getBasiqBearerToken(): Promise<string> {
  assertEnv();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  // Basiq: POST /token
  // Headers:
  //  - Authorization: Basic <YOUR_API_KEY>
  //  - Content-Type: application/x-www-form-urlencoded
  //  - basiq-version: 3.0
  // Body:
  //  - scope=SERVER_ACCESS
  const body = new URLSearchParams({ scope: "SERVER_ACCESS" });

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIQ_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": BASIQ_VERSION,
      Accept: "application/json",
    },
    body,
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

// Low-level helpers (expect a basiq userId) — used later in sync
export async function getBasiqAccounts(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/accounts`);
  return data?.data ?? data ?? [];
}

export async function getBasiqTransactions(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/transactions`);
  return data?.data ?? data ?? [];
}

// Provider stub for now — we’ll wire sync once we store basiq_user_id in external_connections
export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync() {
    throw new Error(
      "basiqProvider.sync() not wired yet: need basiq_user_id stored on external_connections (we'll do next)."
    );
  },
};
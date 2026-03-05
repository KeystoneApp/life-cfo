// lib/money/providers/basiq.ts
import type { MoneyProvider } from "./types";

const BASIQ_BASE_URL = (process.env.BASIQ_BASE_URL || "https://au-api.basiq.io").trim();

// This should be the Base64 credential string shown by Basiq (the part AFTER "Basic ").
// We'll be tolerant if you pasted it with "Basic " prefix.
const BASIQ_API_KEY_RAW = (process.env.BASIQ_API_KEY || "").trim();

const BASIQ_VERSION = (process.env.BASIQ_VERSION || "3.0").trim();

function assertEnv() {
  if (!BASIQ_API_KEY_RAW) throw new Error("Missing BASIQ_API_KEY");
}

function basiqBasicValue() {
  // Accept either:
  // - "YmQ2...==" (recommended)
  // - "Basic YmQ2...==" (we'll normalize)
  const v = BASIQ_API_KEY_RAW;
  return v.toLowerCase().startsWith("basic ") ? v.slice(6).trim() : v;
}

type ParsedBasiq = {
  correlationId?: string;
  code?: string;
  title?: string;
  detail?: string;
};

function parseBasiqPayload(text: string): ParsedBasiq {
  try {
    const j = JSON.parse(text);
    return {
      correlationId: typeof j?.correlationId === "string" ? j.correlationId : undefined,
      code: typeof j?.data?.[0]?.code === "string" ? j.data[0].code : undefined,
      title: typeof j?.data?.[0]?.title === "string" ? j.data[0].title : undefined,
      detail: typeof j?.data?.[0]?.detail === "string" ? j.data[0].detail : undefined,
    };
  } catch {
    return {};
  }
}

export class BasiqError extends Error {
  status: number;
  stage: string;
  bodyText: string;
  basiq: ParsedBasiq;

  constructor(stage: string, status: number, bodyText: string) {
    super(`Basiq ${stage} error (${status}): ${bodyText}`);
    this.name = "BasiqError";
    this.stage = stage;
    this.status = status;
    this.bodyText = bodyText;
    this.basiq = parseBasiqPayload(bodyText);
  }
}

// SERVER_ACCESS bearer cache (Node runtime)
let cachedServerToken: { token: string; expiresAtMs: number } | null = null;

async function fetchToken(params: Record<string, string>, stage: string): Promise<any> {
  assertEnv();

  const body = new URLSearchParams(params);

  const headers = new Headers();
  headers.set("Authorization", `Basic ${basiqBasicValue()}`);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  headers.set("basiq-version", BASIQ_VERSION);

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new BasiqError(stage, res.status, text);

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getBasiqServerBearerToken(): Promise<string> {
  const now = Date.now();
  if (cachedServerToken && cachedServerToken.expiresAtMs > now + 30_000) {
    return cachedServerToken.token;
  }

  // SERVER_ACCESS token (server-side API calls)
  const json: any = await fetchToken({ scope: "SERVER_ACCESS" }, "token:server");

  const token = String(json?.access_token || json?.token || "");
  const expiresInSec = Number(json?.expires_in ?? 3600);
  if (!token) throw new Error("Basiq token response missing access_token");

  cachedServerToken = {
    token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  };

  return token;
}

// CLIENT_ACCESS token bound to a userId (for Consent UI redirect)
export async function getBasiqClientToken(userId: string): Promise<string> {
  const json: any = await fetchToken(
    { scope: "CLIENT_ACCESS", userId: String(userId) },
    "token:client"
  );

  const token = String(json?.access_token || json?.token || "");
  if (!token) throw new Error("Basiq client token response missing access_token");
  return token;
}

function mergeHeadersNoAuth(optionsHeaders: RequestInit["headers"]): Headers {
  const h = new Headers(optionsHeaders || undefined);

  // remove ALL authorization variants (case-insensitive)
  for (const key of Array.from(h.keys())) {
    if (key.toLowerCase() === "authorization") h.delete(key);
  }

  return h;
}

export async function basiqFetch(path: string, options: RequestInit = {}) {
  const bearer = await getBasiqServerBearerToken();

  const headers = mergeHeadersNoAuth(options.headers);

  // Set required headers using Headers.set (overwrites any casing duplicates)
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("basiq-version", BASIQ_VERSION);
  headers.set("Authorization", `Bearer ${bearer}`);

  // Avoid spreading headers from options into the final fetch init (can reintroduce duplicates)
  const { headers: _ignored, ...rest } = options;

  const res = await fetch(`${BASIQ_BASE_URL}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new BasiqError(`api:${path}`, res.status, text);

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync() {
    throw new Error(
      "basiqProvider.sync() not wired yet: need basiq_user_id stored on external_connections.item_id."
    );
  },
};
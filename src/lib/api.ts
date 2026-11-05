import type { ErrorCode } from "./types";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

const GUEST_SECRET_KEY = "pregnancy-care.guest-secret";

/**
 * The anonymous-session secret for guests. The API stores only its hash, so losing it loses
 * access to the guest's data; signing up moves that data into the account.
 */
export const guestSecret = {
  get(): string | null {
    try {
      return window.localStorage.getItem(GUEST_SECRET_KEY);
    } catch {
      return null;
    }
  },
  set(secret: string) {
    try {
      window.localStorage.setItem(GUEST_SECRET_KEY, secret);
    } catch {
      // Private mode or blocked storage: the guest session lasts for this tab only.
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(GUEST_SECRET_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /**
   * Skip the guest credential. The API resolves `Authorization: Anonymous` ahead of the
   * session cookie, so account calls made while a guest secret is stored must opt out.
   */
  asAccount?: boolean;
}

export async function api<T>(
  path: string,
  { method = "GET", body, query, asAccount = false }: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const secret = asAccount ? null : guestSecret.get();
  if (secret) headers.Authorization = `Anonymous ${secret}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK_ERROR",
      "Can't reach the server. Check your connection and try again.",
    );
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw toError(res.status, data);
}

function toError(status: number, data: unknown): ApiRequestError {
  // Nest routes use the ApiError envelope; Better Auth routes return { code, message }.
  const envelope = (data as { error?: Record<string, unknown> } | null)?.error;
  if (envelope && typeof envelope === "object") {
    return new ApiRequestError(
      status,
      String(envelope.code ?? "INTERNAL_ERROR"),
      String(envelope.message ?? "Something went wrong."),
      (envelope.details as { path: string; message: string }[]) ?? [],
    );
  }
  const flat = data as { code?: string; message?: string } | null;
  return new ApiRequestError(
    status,
    flat?.code ?? (status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR"),
    flat?.message ?? "Something went wrong. Please try again.",
  );
}

/** A readable sentence for any thrown value, including field-level validation details. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.details.length > 0) {
      return err.details.map((d) => d.message).join(" ");
    }
    if (err.code === "RATE_LIMITED") {
      return "Too many attempts. Please wait a minute and try again.";
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

export const isNotFound = (err: unknown) =>
  err instanceof ApiRequestError && err.status === 404;

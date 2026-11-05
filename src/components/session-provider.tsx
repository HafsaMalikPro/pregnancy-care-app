"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiRequestError, api, errorMessage, guestSecret } from "@/lib/api";
import type { AnonymousSessionCreated, LinkResult, Me } from "@/lib/types";

interface Credentials {
  email: string;
  password: string;
}

type SignInResult = { status: "signed_in" } | { status: "two_factor" };

interface Session {
  me: Me | null;
  loading: boolean;
  /** True after the visitor signed out or deleted their data here, until they sign in again. */
  signedOut: boolean;
  /** Set after sign-in when guest data could not be moved into the account. */
  linkError: string | null;
  refresh: () => Promise<void>;
  startGuest: () => Promise<void>;
  signUp: (input: Credentials & { name: string }) => Promise<void>;
  signIn: (input: Credentials & { rememberMe?: boolean }) => Promise<SignInResult>;
  verifyTotp: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

async function loadMe(): Promise<Me | null> {
  try {
    return await api<Me>("/v1/me");
  } catch (err) {
    if (!(err instanceof ApiRequestError) || err.status !== 401) throw err;
    if (!guestSecret.get()) return null;
    // Expired or deleted guest session: fall back to any account cookie.
    guestSecret.clear();
    return loadMe();
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadMe();
      setMe(loaded);
      if (loaded) setSignedOut(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  /** Move guest data into the account that just signed in, then drop the guest secret. */
  const linkGuest = useCallback(async () => {
    const secret = guestSecret.get();
    if (!secret) return;
    try {
      await api<LinkResult>("/v1/anonymous-sessions/link", {
        method: "POST",
        body: { secret },
        asAccount: true,
      });
      setLinkError(null);
    } catch (err) {
      setLinkError(
        `Your guest data couldn't be moved into this account: ${errorMessage(err)}`,
      );
    } finally {
      guestSecret.clear();
    }
  }, []);

  const startGuest = useCallback(async () => {
    const created = await api<AnonymousSessionCreated>(
      "/v1/anonymous-sessions",
      { method: "POST", body: { platform: "web" }, asAccount: true },
    );
    guestSecret.set(created.secret);
    await refresh();
  }, [refresh]);

  const signUp = useCallback(
    async (input: Credentials & { name: string }) => {
      await api("/v1/auth/sign-up/email", {
        method: "POST",
        body: input,
        asAccount: true,
      });
      await linkGuest();
      await refresh();
    },
    [linkGuest, refresh],
  );

  const signIn = useCallback(
    async (input: Credentials & { rememberMe?: boolean }): Promise<SignInResult> => {
      const res = await api<{ twoFactorRedirect?: boolean }>(
        "/v1/auth/sign-in/email",
        { method: "POST", body: input, asAccount: true },
      );
      if (res?.twoFactorRedirect) return { status: "two_factor" };
      await linkGuest();
      await refresh();
      return { status: "signed_in" };
    },
    [linkGuest, refresh],
  );

  const verifyTotp = useCallback(
    async (code: string) => {
      await api("/v1/auth/two-factor/verify-totp", {
        method: "POST",
        body: { code },
        asAccount: true,
      });
      await linkGuest();
      await refresh();
    },
    [linkGuest, refresh],
  );

  const signOut = useCallback(async () => {
    if (me?.kind === "user") {
      await api("/v1/auth/sign-out", {
        method: "POST",
        body: {},
        asAccount: true,
      });
    }
    guestSecret.clear();
    setSignedOut(true);
    setMe(null);
  }, [me]);

  const value = useMemo(
    () => ({
      me,
      loading,
      signedOut,
      linkError,
      refresh,
      startGuest,
      signUp,
      signIn,
      verifyTotp,
      signOut,
    }),
    [me, loading, signedOut, linkError, refresh, startGuest, signUp, signIn, verifyTotp, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

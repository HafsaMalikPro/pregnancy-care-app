"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileFields } from "@/components/profile-fields";
import { useSession } from "@/components/session-provider";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Field,
  Input,
  Loading,
  SectionTitle,
} from "@/components/ui";
import { api, errorMessage, guestSecret } from "@/lib/api";
import { CONSENT_COPY, recordConsent } from "@/lib/consent";
import { formatDate } from "@/lib/dates";
import { STAFF_ROLES, humanize } from "@/lib/labels";
import type { ConsentState, Entitlement, PrivacyJob, Profile } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

type Message = { tone: "success" | "danger"; text: string } | null;

export function ProfileSection() {
  const profile = useApi<Profile>("/v1/me/profile");
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <Loading />;
  return <ProfileForm initial={profile.data} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const [draft, setDraft] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/v1/me/profile", { method: "PUT", body: draft });
      setMessage({ tone: "success", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>About you</SectionTitle>
      <form onSubmit={submit} className="grid gap-5">
        <ProfileFields value={draft} onChange={setDraft} />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" busy={busy} className="justify-self-start">
          Save
        </Button>
      </form>
    </Card>
  );
}

export function PrivacySection() {
  const { me } = useSession();
  const jobs = useApi<PrivacyJob[]>(me?.kind === "user" ? "/v1/me/privacy-jobs" : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirmText, setConfirmText] = useState("");

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const exportData = () =>
    run("export", async () => {
      const bundle = await api<unknown>("/v1/me/export", { method: "POST" });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `pregnancy-care-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ tone: "success", text: "Your data has been downloaded." });
      void jobs.reload();
    });

  const deleteEverything = () =>
    run("delete", async () => {
      if (me?.kind === "user") {
        await api("/v1/me/deletion", {
          method: "POST",
          body: { confirm: "DELETE MY ACCOUNT" },
          asAccount: true,
        });
      } else {
        await api("/v1/anonymous-sessions/current", { method: "DELETE" });
      }
      // The API answers only once everything is deleted and every session revoked, so
      // there is nothing left to sign out of. A full load drops all in-memory state.
      guestSecret.clear();
      window.location.replace("/goodbye");
    });

  return (
    <div className="grid gap-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card>
        <SectionTitle>Download your data</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Everything we hold about you, as a JSON file you can keep or take elsewhere.
        </p>
        <Button variant="secondary" busy={busy === "export"} onClick={exportData}>
          Download my data
        </Button>
        {jobs.data && jobs.data.length > 0 && (
          <ul className="mt-4 grid gap-1 text-sm text-muted">
            {jobs.data.slice(0, 5).map((j) => (
              <li key={j.id}>
                {humanize(j.kind)} · {formatDate(j.requestedAt)} · {humanize(j.status)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-danger/40">
        <SectionTitle>Delete everything</SectionTitle>
        <p className="text-sm">
          {me?.kind === "user"
            ? "This permanently deletes your account straight away, including:"
            : "This permanently deletes this guest session straight away, including:"}
        </p>
        <ul className="my-3 list-disc pl-5 text-sm text-muted">
          <li>your pregnancy, due-date history and timeline</li>
          <li>journal entries, checklist progress and notes</li>
          <li>reminders, consent choices and your profile</li>
        </ul>
        <p className="mb-4 text-sm text-muted">
          {me?.kind === "user"
            ? "You'll be signed out on every device. This can't be undone, so download your data first if you want a copy."
            : "This can't be undone."}
        </p>
        <Field label='Type "DELETE" to confirm'>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </Field>
        <Button
          variant="danger"
          className="mt-4"
          disabled={confirmText !== "DELETE"}
          busy={busy === "delete"}
          onClick={deleteEverything}
        >
          Delete permanently
        </Button>
      </Card>
    </div>
  );
}

export function ConsentSection() {
  const consents = useApi<ConsentState[]>("/v1/me/consents");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <SectionTitle>Health data and consent</SectionTitle>
        <p className="mb-5 text-sm text-muted">
          Each choice is recorded with the date and the version of our privacy notice.
        </p>
        {consents.error ? (
          <ErrorState error={consents.error} onRetry={consents.reload} />
        ) : !consents.data ? (
          <Loading />
        ) : (
          <ul className="grid gap-4">
            {consents.data.map((c) => (
              <li key={c.purpose} className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-md">
                  <p className="font-semibold">{CONSENT_COPY[c.purpose].title}</p>
                  <p className="text-sm text-muted">{CONSENT_COPY[c.purpose].body}</p>
                  {c.updatedAt && (
                    <p className="mt-1 text-xs text-muted">Updated {formatDate(c.updatedAt)}</p>
                  )}
                </div>
                <Button
                  variant={c.granted ? "secondary" : "primary"}
                  busy={busy === c.purpose}
                  onClick={() =>
                    run(c.purpose, async () => {
                      if (
                        c.granted &&
                        c.purpose === "health_data_processing" &&
                        !window.confirm(
                          "Without this we can't save new pregnancy or journal details. Withdraw consent?",
                        )
                      ) {
                        return;
                      }
                      const updated = await recordConsent(c.purpose, !c.granted, "web_settings");
                      consents.setData(
                        consents.data!.map((x) => (x.purpose === c.purpose ? updated : x)),
                      );
                    })
                  }
                >
                  {c.granted ? "Withdraw" : "Allow"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}

export function MembershipSection() {
  const { me } = useSession();
  const entitlement = useApi<Entitlement>("/v1/me/entitlement");
  if (entitlement.error) return <ErrorState error={entitlement.error} onRetry={entitlement.reload} />;
  if (!entitlement.data) return <Loading />;
  const e = entitlement.data;
  return (
    <Card>
      <SectionTitle>Membership</SectionTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={e.premium ? "success" : "neutral"}>{e.premium ? "Premium" : "Free"}</Badge>
        {e.status !== "none" && <span className="text-sm text-muted">Status: {humanize(e.status)}</span>}
        {e.expiresAt && (
          <span className="text-sm text-muted">
            {e.premium ? "Renews or ends" : "Ended"} {formatDate(e.expiresAt)}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-muted">
        {e.premium
          ? "You can read every premium article."
          : me?.kind === "anonymous"
            ? "Guest sessions can't hold a membership. Weekly guides, the journal, checklist and reminders are all free."
            : "Weekly guides, the journal, checklist and reminders are all free. Premium memberships can't be bought on the website yet."}
      </p>
    </Card>
  );
}

export function AccountSection() {
  const { me, signOut } = useSession();
  const router = useRouter();

  async function leave() {
    if (
      me?.kind === "anonymous" &&
      !window.confirm(
        "Leaving guest mode means you won't be able to get back to this data on this browser. Continue?",
      )
    ) {
      return;
    }
    await signOut();
    router.replace("/");
  }

  if (me?.kind !== "user") {
    return (
      <Card>
        <SectionTitle>Guest mode</SectionTitle>
        <p className="mb-4 text-muted">
          Your data is linked to this browser only. Create an account to keep it safe and use
          it on other devices — everything moves over automatically.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/signup">Create an account</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            I already have one
          </ButtonLink>
          <Button variant="ghost" onClick={leave}>
            Leave guest mode
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <NameCard name={me.name ?? ""} email={me.email} />
      <SessionsCard onSignOut={leave} />
      <PasswordCard />
      <TwoFactorCard enabled={me.twoFactorEnabled} />
    </div>
  );
}

function NameCard({ name: initial, email }: { name: string; email: string }) {
  const { me, refresh } = useSession();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMessage({ tone: "danger", text: "Enter your name." });
    setBusy(true);
    setMessage(null);
    try {
      await api("/v1/auth/update-user", { method: "POST", body: { name: name.trim() }, asAccount: true });
      await refresh();
      setMessage({ tone: "success", text: "Name updated." });
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Your details</SectionTitle>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Name">
          <Input autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" hint="Changing your email isn't available yet.">
          <Input value={email} readOnly disabled />
        </Field>
        {me?.kind === "user" && me.staffRole && (
          <p className="text-sm">
            Staff role: <Badge>{STAFF_ROLES[me.staffRole]}</Badge>
          </p>
        )}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" busy={busy} className="justify-self-start">
          Save name
        </Button>
      </form>
    </Card>
  );
}

interface AuthSession {
  id: string;
  token: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A readable device label from a user-agent string. */
function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function SessionsCard({ onSignOut }: { onSignOut: () => void }) {
  // Better Auth session routes; tokens stay in memory and are only sent back to revoke.
  const [list, setList] = useState<AuthSession[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [all, mine] = await Promise.all([
        api<AuthSession[]>("/v1/auth/list-sessions", { asAccount: true }),
        api<{ session: { token: string } } | null>("/v1/auth/get-session", { asAccount: true }),
      ]);
      setList(all);
      setCurrent(mine?.session.token ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function revoke(key: string, path: string, body: object) {
    setBusy(key);
    setError(null);
    try {
      await api(path, { method: "POST", body, asAccount: true });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionTitle>Where you&apos;re signed in</SectionTitle>
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      {list === null ? (
        <Button variant="secondary" onClick={load}>
          Show my devices
        </Button>
      ) : (
        <>
          <ul className="grid gap-3">
            {list.map((sess) => (
              <li key={sess.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <div>
                  <p className="font-semibold text-heading">
                    {deviceName(sess.userAgent)}
                    {sess.token === current && <span className="ml-2"><Badge tone="success">This device</Badge></span>}
                  </p>
                  <p className="text-sm text-muted">Signed in {formatDate(sess.createdAt)}, last active {formatDate(sess.updatedAt)}</p>
                </div>
                {sess.token !== current && (
                  <Button
                    variant="ghost"
                    busy={busy === sess.id}
                    onClick={() => revoke(sess.id, "/v1/auth/revoke-session", { token: sess.token })}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            {list.length > 1 && (
              <Button
                variant="secondary"
                busy={busy === "others"}
                onClick={() => revoke("others", "/v1/auth/revoke-other-sessions", {})}
              >
                Sign out of other devices
              </Button>
            )}
          </div>
        </>
      )}
      <div className="mt-5 border-t border-line pt-5">
        <Button variant="secondary" onClick={onSignOut}>
          Sign out of this device
        </Button>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/v1/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        asAccount: true,
      });
      setCurrent("");
      setNew("");
      setMessage({ tone: "success", text: "Password changed. Other devices were signed out." });
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Change password</SectionTitle>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters`}>
          <Input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </Field>
        {message && (
          <div className="sm:col-span-2">
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}
        <Button type="submit" busy={busy} className="justify-self-start">
          Change password
        </Button>
      </form>
    </Card>
  );
}

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const { refresh } = useSession();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const secret = setup ? new URL(setup.totpURI).searchParams.get("secret") : null;

  return (
    <Card>
      <SectionTitle>Two-step verification</SectionTitle>
      <p className="mb-4 text-sm text-muted">
        {enabled
          ? "On. You'll be asked for a code from your authenticator app when you sign in."
          : "Add a code from an authenticator app when signing in. Required for staff accounts."}
      </p>
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      {setup ? (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/v1/auth/two-factor/verify-totp", {
                method: "POST",
                body: { code: code.replace(/\s/g, "") },
                asAccount: true,
              });
              setSetup(null);
              setPassword("");
              await refresh();
              setMessage({ tone: "success", text: "Two-step verification is on." });
            });
          }}
        >
          <div className="rounded-2xl bg-sunk p-4 text-sm">
            <p className="font-semibold">1. Add this key to your authenticator app</p>
            <code className="mt-1 block break-all font-mono text-base">{secret}</code>
            <p className="mt-4 font-semibold">2. Save these backup codes somewhere safe</p>
            <ul className="mt-1 grid grid-cols-2 gap-1 font-mono">
              {setup.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <Field label="3. Enter the 6-digit code from the app">
            <Input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" busy={busy} className="justify-self-start">
            Turn on
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (enabled) {
                await api("/v1/auth/two-factor/disable", { method: "POST", body: { password }, asAccount: true });
                setPassword("");
                await refresh();
                setMessage({ tone: "success", text: "Two-step verification is off." });
              } else {
                setSetup(
                  await api("/v1/auth/two-factor/enable", { method: "POST", body: { password }, asAccount: true }),
                );
              }
            });
          }}
        >
          <div className="min-w-56 flex-1">
            <Field label="Confirm your password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" busy={busy}>
            {enabled ? "Turn off" : "Set up"}
          </Button>
        </form>
      )}
    </Card>
  );
}

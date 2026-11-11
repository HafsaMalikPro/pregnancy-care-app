"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestButton } from "@/app/guest-button";
import { useSession } from "@/components/session-provider";
import { Alert, Button, Checkbox, Field, Input, PasswordInput } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { AuthHeading, OrDivider } from "../auth-heading";
import { nextPath } from "../next-path";

export default function LoginPage() {
  const { signIn, verifyTotp } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "credentials") {
        const result = await signIn({ email, password, rememberMe });
        if (result.status === "two_factor") {
          setStep("totp");
          return;
        }
      } else {
        await verifyTotp(code.replace(/\s/g, ""));
      }
      router.replace(nextPath());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeading
        title={step === "credentials" ? "Welcome back" : "Two-step verification"}
        subtitle={
          step === "credentials"
            ? "Sign in to continue your pregnancy journey."
            : "Enter the 6-digit code from your authenticator app."
        }
      />

      <form onSubmit={submit} className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {step === "credentials" ? (
          <>
            <Field label="Email address">
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Checkbox
              label="Keep me signed in on this device"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
          </>
        ) : (
          <Field label="Authentication code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        )}
        <Button type="submit" busy={busy} className="mt-2">
          {step === "credentials" ? "Sign in" : "Verify and sign in"}
        </Button>
        {step === "credentials" && (
          <p className="text-center text-xs text-muted">
            Forgot your password? Password reset by email isn&apos;t available yet.
          </p>
        )}
      </form>

      <OrDivider />
      <div className="grid justify-items-center gap-6">
        <GuestButton label="Continue as a guest" />
        <p className="text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-clay-strong underline">
            Sign up
          </Link>
        </p>
      </div>
    </>
  );
}

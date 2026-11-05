"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestButton } from "@/app/guest-button";
import { useSession } from "@/components/session-provider";
import { Alert, Button, Field, Input, PasswordInput } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { PASSWORD_MIN_LENGTH, signupProblems } from "@/lib/validation";
import { AuthHeading, OrDivider } from "../auth-heading";

export default function SignupPage() {
  const { me, signUp } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = signupProblems({ name, email, password })[0];
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await signUp({ name: name.trim(), email: email.trim(), password });
      router.replace("/onboarding");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeading
        title="Create your account"
        subtitle={
          me?.kind === "anonymous"
            ? "Everything you've added as a guest will move into your new account."
            : "Free and private. You can delete your account at any time."
        }
      />

      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Full name">
          <Input
            autoComplete="name"
            placeholder="Enter your name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
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
        <Field
          label="Password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easy to remember.`}
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="Create a strong password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline">terms of use</Link> and{" "}
          <Link href="/privacy" className="underline">privacy policy</Link>.
        </p>
        <Button type="submit" busy={busy}>
          Create account
        </Button>
      </form>

      {!me && (
        <>
          <OrDivider />
          <div className="flex justify-center">
            <GuestButton label="Try it first as a guest" />
          </div>
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-clay-strong underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

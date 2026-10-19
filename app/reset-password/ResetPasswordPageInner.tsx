// app/reset-password/ResetPasswordPageInner.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { authButton, authInput, authLabel, authLink } from "@/components/AuthShell";

export default function ResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  useEffect(() => {
    let token = searchParams.get("access_token");
    if (!token && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
      token = hashParams.get("access_token");
    }
    if (!token) setError("This reset link is invalid or has expired. Request a new one.");
    else setRecoveryToken(token);
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!recoveryToken) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else {
        setDone(true);
        setTimeout(() => router.push("/login"), 2000);
      }
    } catch {
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="New password"
      subtitle="Choose a new password for your account"
      footer={
        <Link href="/reset-password-request" className={authLink}>
          Need a new reset link?
        </Link>
      }
    >
      {done ? (
        <div className="text-center">
          <div className="text-4xl">✅</div>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Password updated</h2>
          <p className="mt-1 text-sm text-slate-700">Taking you to sign in...</p>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label htmlFor="password" className={authLabel}>
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`${authInput} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className={authLabel}>
              Confirm new password
            </label>
            <input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={authInput}
            />
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

          <button type="submit" disabled={loading || !recoveryToken} className={authButton}>
            {loading ? "Updating..." : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

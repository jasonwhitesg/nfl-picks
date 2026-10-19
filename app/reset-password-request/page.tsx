"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { authButton, authInput, authLabel, authLink } from "@/components/AuthShell";

export default function ResetPasswordRequest() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(error.message);
      else setSent(true);
    } catch {
      setError("Unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="We'll email you a link to set a new one"
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className={authLink}>
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="text-center">
          <div className="text-4xl">📬</div>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Check your email</h2>
          <p className="mt-1 text-sm text-slate-700">
            If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way.
          </p>
          <button type="button" onClick={() => setSent(false)} className="mt-4 text-sm font-semibold text-sky-800 underline">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleRequest} className="space-y-4">
          <div>
            <label htmlFor="email" className={authLabel}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={authInput}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

          <button type="submit" disabled={loading} className={authButton}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

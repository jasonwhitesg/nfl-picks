"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, { authButton, authInput, authLabel, authLink } from "@/components/AuthShell";

const SignupPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Password match check
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      // 1. Sign up the user
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: "/" },
      });
      if (signUpError) throw signUpError;

      // 2. Automatically sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      const userId = signInData.user?.id;
      if (!userId) throw new Error("Failed to retrieve user session.");

      // 3. Insert into profiles table
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: userId,
        email,
        username,
        first_name: firstName,
        last_name: lastName,
      });

      if (profileError) throw profileError;

      router.push("/make-picks");
    } catch (err: any) {
      setError(err.message || "Unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Join the pool"
      subtitle="Create your account to start picking"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLink}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSignup} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className={authLabel}>
              First name
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={authInput}
              required
            />
          </div>
          <div>
            <label htmlFor="lastName" className={authLabel}>
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={authInput}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="username" className={authLabel}>
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="Shown on the leaderboard"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={authInput}
            required
          />
        </div>

        <div>
          <label htmlFor="email" className={authLabel}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInput}
            required
          />
        </div>

        <div>
          <label htmlFor="password" className={authLabel}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authInput} pr-16`}
              required
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
          <label htmlFor="confirmPassword" className={authLabel}>
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={authInput}
            required
          />
        </div>

        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

        <button type="submit" disabled={loading} className={authButton}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
};

export default SignupPage;

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });
  }, []);

  const login = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setUser(data.user);
    }
  };

  if (user) {
    window.location.href = "/listings";
    return null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-xl">
        <h1 className="text-xl font-semibold">Allen Property System</h1>
        <p className="mt-1 text-sm text-zinc-400">Login to continue</p>

        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="text-sm text-red-400">{error}</div>}

          <button
            onClick={login}
            disabled={loading}
            className="w-full rounded-lg bg-white py-2 text-black font-medium hover:opacity-90"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      </div>
    </main>
  );
}

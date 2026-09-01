import { createClient } from "@supabase/supabase-js";

// Lazy / environment-aware Supabase client helper.
// - On the browser (client), always instantiate a real Supabase client using NEXT_PUBLIC_* env vars.
// - On the server at build time, provide a minimal safe shim so imports don't crash the build.

const isBrowser = typeof window !== "undefined";

let supabase: any;

if (isBrowser) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail fast in the browser so developers notice missing public env vars.
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Please set these environment variables."
    );
  }
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
} else {
  // Server/build-time shim: provide the minimal surface area used during build-time rendering to avoid hard crashes.
  // Note: server routes requiring a full server client should create their own client using createClient with the service role key.
  supabase = {
    auth: {
      // used by client-side code via auth.getUser — on server shim we provide a no-op that returns no user.
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      delete: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      order: function () { return this; },
      eq: function () { return this; },
      in: function () { return this; },
      limit: function () { return this; },
      single: async () => ({ data: null, error: null }),
    }),
  } as any;
}

export { supabase };

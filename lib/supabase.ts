"use client";

import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function normalizeSupabaseUrl(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/rest\/v1\/?$/, "");
  if (!trimmed || trimmed.includes("your-project-ref")) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function normalizeSupabaseKey(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("your-supabase") || trimmed.includes("your-publishable")) {
    return null;
  }

  return trimmed;
}

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseKey = normalizeSupabaseKey(rawSupabaseKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;

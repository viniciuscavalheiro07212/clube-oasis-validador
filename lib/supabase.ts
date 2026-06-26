import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do app validador (React Native / Expo).
 *
 * Aponta para o MESMO projeto Supabase do site clube-oasis, então:
 *  - usa o mesmo Auth (auth.users)
 *  - lê as mesmas tabelas (pedidos, usuarios, admins)
 *  - é governado pelas MESMAS políticas RLS
 *
 * Diferença vs. web: a sessão é persistida em AsyncStorage (não localStorage)
 * e detectSessionInUrl fica desligado (não há redirect de URL no app nativo).
 */
const FALLBACK_SUPABASE_URL = "https://jczgcfibllslffaawjos.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "sb_publishable_oN_OjEEDdOQ13En1DMb1Mw_z7awKfpe";

function resolveSupabaseUrl(value?: string) {
  const url = value?.trim();

  if (!url || url.includes("aBcDe.supabase.co")) {
    return FALLBACK_SUPABASE_URL;
  }

  // Vercel env vars were accidentally saved once with `.supabase.com`.
  // Supabase project URLs use `.supabase.co`.
  return url.replace(".supabase.com", ".supabase.co");
}

const supabaseUrl = resolveSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || FALLBACK_SUPABASE_ANON_KEY;

const noopStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

const webStorage =
  typeof window !== "undefined" && window.localStorage ? window.localStorage : noopStorage;

const authStorage = Platform.OS === "web" ? webStorage : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No web (PWA) o login Google volta do provedor com a sessão na URL —
    // o cliente precisa detectá-la. No nativo não há redirect de URL.
    detectSessionInUrl: Platform.OS === "web",
  },
});

// Renova o token só enquanto o app está em primeiro plano (recomendação oficial
// do Supabase para React Native), evitando refresh em background.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

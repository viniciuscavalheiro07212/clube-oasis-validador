import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
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
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Renova o token só enquanto o app está em primeiro plano (recomendação oficial
// do Supabase para React Native), evitando refresh em background.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

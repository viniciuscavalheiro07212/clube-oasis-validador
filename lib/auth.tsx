import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Contexto de autenticação compartilhado pelo app.
 *
 * Espelha exatamente o gate de admin do site:
 *  - autentica no Supabase Auth (aqui via e-mail/senha)
 *  - confirma que o usuário está na tabela `admins`
 * Só quem é admin tem `isAdmin === true` e acessa a área protegida.
 */
interface AuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

async function checkAdmin(userId: string): Promise<boolean> {
  // Tabela `admins` oficial tem PK `uid` (não `user_id`).
  const { data } = await supabase
    .from("admins")
    .select("uid")
    .eq("uid", userId)
    .maybeSingle();
  return !!data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session ?? null;
      if (!active) return;
      setSession(s);
      setIsAdmin(s ? await checkAdmin(s.user.id) : false);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Adiar a chamada ao Supabase evita o deadlock conhecido quando se
      // invoca o client de dentro do callback de onAuthStateChange.
      setTimeout(async () => {
        setIsAdmin(s ? await checkAdmin(s.user.id) : false);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAdmin,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

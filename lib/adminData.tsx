// ============================================================
// PROVIDER DE DADOS DO PAINEL ADMIN
// Centraliza fetch + Realtime + estado de pedidos/cupons/limites para
// que as 5 abas (tab bar) compartilhem a MESMA fonte de dados sem
// refazer requisições. A lógica/queries são idênticas às do dashboard
// original — apenas foram realocadas para um contexto compartilhado.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import { supabase } from "./supabase";
import type { ItemPedido, Pedido } from "./types";

export interface Cupom {
  id?: string;
  codigo: string;
  desconto: number;
  validade: string;
  criadoEm?: string;
}

export interface LimiteIngressos {
  id: string;
  data: string;
  limite: number | null;
  vendidos: number;
  esgotado: boolean;
  atualizadoEm?: string;
}

// ── Helpers puros compartilhados pelas telas ──

export function qty(items: ItemPedido[] | undefined, id: ItemPedido["id"]): number {
  return items?.find((i) => i.id === id)?.quantity ?? 0;
}

export function buyerDisplayName(pedido: Pedido): string {
  return (
    pedido.comprador?.nome?.trim() ||
    pedido.comprador?.email?.trim() ||
    "Comprador sem nome"
  );
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "--";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function parseISODate(iso: string): Date {
  if (!iso) return new Date();
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12);
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isCupomVigente(validade: string): boolean {
  return validade >= getTodayISO();
}

function isMissingTableError(error: unknown, table: string): boolean {
  const maybeError = error as { code?: string; message?: string } | null;
  return (
    maybeError?.code === "PGRST205" &&
    typeof maybeError.message === "string" &&
    maybeError.message.includes(table)
  );
}

interface AdminDataState {
  pedidos: Pedido[];
  cupons: Cupom[];
  limites: LimiteIngressos[];
  limitesAvailable: boolean;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  fetchAll: () => Promise<void>;
}

const AdminDataContext = createContext<AdminDataState | null>(null);

export function useAdminData(): AdminDataState {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData deve ser usado dentro de <AdminDataProvider>");
  return ctx;
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [limites, setLimites] = useState<LimiteIngressos[]>([]);
  const [limitesAvailable, setLimitesAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    const [pedidosRes, cuponsRes, limitesRes] = await Promise.all([
      supabase.from("pedidos").select("*").order("criadoEm", { ascending: false }),
      supabase.from("cupons").select("*").order("criadoEm", { ascending: false }),
      supabase.from("limites_ingressos").select("*").order("data", { ascending: true }),
    ]);

    if (pedidosRes.error) Alert.alert("Pedidos", pedidosRes.error.message);
    if (cuponsRes.error) Alert.alert("Cupons", cuponsRes.error.message);
    if (limitesRes.error) {
      if (isMissingTableError(limitesRes.error, "limites_ingressos")) {
        setLimitesAvailable(false);
      } else {
        Alert.alert("Limites", limitesRes.error.message);
      }
    } else {
      setLimitesAvailable(true);
    }

    setPedidos((pedidosRes.data as Pedido[]) ?? []);
    setCupons((cuponsRes.data as Cupom[]) ?? []);
    setLimites(limitesRes.error ? [] : ((limitesRes.data as LimiteIngressos[]) ?? []));
  }, []);

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel("admin-mobile")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        void fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cupons" }, () => {
        void fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "limites_ingressos" }, () => {
        void fetchAll();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  return (
    <AdminDataContext.Provider
      value={{
        pedidos,
        cupons,
        limites,
        limitesAvailable,
        loading,
        refreshing,
        onRefresh,
        fetchAll,
      }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}

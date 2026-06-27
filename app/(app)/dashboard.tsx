import { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  Switch,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { fonts, useTheme, formatBRL } from "@/lib/theme";
import { PremiumShell, AppTab } from "@/components/PremiumShell";
import type { ItemPedido, Pedido } from "@/lib/types";

type Tab = "pedidos" | "faturamento" | "cupons" | "limites";

interface Cupom {
  id?: string;
  codigo: string;
  desconto: number;
  validade: string;
  criadoEm?: string;
}

interface LimiteIngressos {
  id: string;
  data: string;
  limite: number | null;
  vendidos: number;
  esgotado: boolean;
  atualizadoEm?: string;
}

function qty(items: ItemPedido[] | undefined, id: ItemPedido["id"]): number {
  return items?.find((i) => i.id === id)?.quantity ?? 0;
}

function buyerDisplayName(pedido: Pedido): string {
  return (
    pedido.comprador?.nome?.trim() ||
    pedido.comprador?.email?.trim() ||
    "Comprador sem nome"
  );
}

function ticketHolderDisplayName(pedido: Pedido): string {
  return pedido.destinatario_nome?.trim() || buyerDisplayName(pedido);
}

function isSharedPedido(pedido: Pedido): boolean {
  return !!pedido.compartilhado_em && !!pedido.destinatario_nome?.trim();
}

function getTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  if (!iso) return "--";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function parseISODate(iso: string): Date {
  if (!iso) return new Date();
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12);
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isCupomVigente(validade: string): boolean {
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

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Dashboard() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { theme } = useTheme();

  const [tab, setTab] = useState<Tab>("pedidos");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [limites, setLimites] = useState<LimiteIngressos[]>([]);
  const [limitesAvailable, setLimitesAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [busca, setBusca] = useState("");
  const [dataFiltro, setDataFiltro] = useState("");

  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoDesconto, setNovoDesconto] = useState("");
  const [novaValidade, setNovaValidade] = useState("");
  const [cupomSaving, setCupomSaving] = useState(false);

  const [limiteData, setLimiteData] = useState(getTodayISO());
  const [limiteQtd, setLimiteQtd] = useState("");
  const [limiteEsgotado, setLimiteEsgotado] = useState(false);
  const [limiteSaving, setLimiteSaving] = useState(false);

  // Sync tab from URL params (navigation from scanner)
  useEffect(() => {
    const t = params.tab as Tab;
    const valid: Tab[] = ["pedidos", "faturamento", "cupons", "limites"];
    if (t && valid.includes(t)) setTab(t);
  }, [params.tab]);

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

  const hoje = useMemo(() => getTodayISO(), []);
  const pedidosFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return pedidos.filter((pedido) => {
      const matchData = dataFiltro ? pedido.visitDate === dataFiltro : true;
      const matchBusca = term
        ? pedido.comprador?.nome?.toLowerCase().includes(term) ||
          pedido.comprador?.cpf?.includes(term) ||
          pedido.comprador?.email?.toLowerCase().includes(term) ||
          pedido.destinatario_nome?.toLowerCase().includes(term) ||
          pedido.destinatario_cpf?.includes(term)
        : true;
      return matchData && matchBusca;
    });
  }, [pedidos, busca, dataFiltro]);

  const ingressosVendidosPorData = useMemo(() => {
    return pedidos.reduce<Record<string, number>>((acc, pedido) => {
      acc[pedido.visitDate] = (acc[pedido.visitDate] ?? 0) + pedido.totalQuantity;
      return acc;
    }, {});
  }, [pedidos]);

  const stats = useMemo(() => {
    const totalTickets = pedidos.reduce((acc, p) => acc + (p.totalQuantity ?? 0), 0);
    const revenue = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    const todayRevenue = pedidos
      .filter((p) => (p.criadoEm ?? "").startsWith(hoje))
      .reduce((acc, p) => acc + Number(p.total), 0);
    const validatedCount = pedidos.filter((p) => p.validated_at).length;
    return { totalTickets, revenue, todayRevenue, validatedCount };
  }, [pedidos, hoje]);

  const summaryByType = useMemo(() => {
    return (["infantil", "meia", "inteira"] as const).map((tipo) => ({
      tipo,
      qty: pedidos.reduce((acc, p) => acc + qty(p.items, tipo), 0),
      total: pedidos.reduce(
        (acc, p) => acc + (p.items?.find((item) => item.id === tipo)?.subtotal ?? 0),
        0
      ),
    }));
  }, [pedidos]);

  const topVisitDays = useMemo(() => {
    const map: Record<string, { qty: number; receita: number }> = {};
    pedidos.forEach((pedido) => {
      if (!map[pedido.visitDate]) map[pedido.visitDate] = { qty: 0, receita: 0 };
      map[pedido.visitDate].qty += pedido.totalQuantity;
      map[pedido.visitDate].receita += Number(pedido.total);
    });
    return Object.entries(map)
      .sort((a, b) => b[1].receita - a[1].receita)
      .slice(0, 5);
  }, [pedidos]);

  const couponsUsed = useMemo(() => {
    const map: Record<string, { usos: number; desconto: number }> = {};
    pedidos.forEach((pedido) => {
      if (!pedido.coupon) return;
      if (!map[pedido.coupon]) map[pedido.coupon] = { usos: 0, desconto: 0 };
      map[pedido.coupon].usos += 1;
      map[pedido.coupon].desconto += Number((pedido as Pedido & { discount?: number }).discount ?? 0);
    });
    return Object.fromEntries(Object.entries(map));
  }, [pedidos]);

  async function salvarCupom() {
    const codigo = novoCodigo.trim().toUpperCase();
    const desconto = Number(novoDesconto);

    if (!codigo) return Alert.alert("Cupom", "Informe o codigo do cupom.");
    if (!Number.isFinite(desconto) || desconto <= 0 || desconto > 100) {
      return Alert.alert("Cupom", "Desconto deve ser entre 1 e 100%.");
    }
    if (!novaValidade) return Alert.alert("Cupom", "Informe a validade no formato YYYY-MM-DD.");
    if (novaValidade < hoje) return Alert.alert("Cupom", "A validade deve ser futura.");

    setCupomSaving(true);
    const { error } = await supabase.from("cupons").upsert({
      codigo,
      desconto,
      validade: novaValidade,
      criadoEm: new Date().toISOString(),
    });
    setCupomSaving(false);

    if (error) return Alert.alert("Cupom", error.message);
    setNovoCodigo("");
    setNovoDesconto("");
    setNovaValidade("");
    Alert.alert("Cupom", "Cupom salvo com sucesso.");
    await fetchAll();
  }

  function confirmarExcluirCupom(codigo: string) {
    Alert.alert("Excluir cupom", `Excluir o cupom ${codigo}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("cupons").delete().eq("codigo", codigo);
          if (error) Alert.alert("Cupom", error.message);
          await fetchAll();
        },
      },
    ]);
  }

  async function salvarLimite() {
    if (!limitesAvailable) {
      return Alert.alert(
        "Limites",
        "A tabela limites_ingressos ainda nao existe no Supabase. Crie/aplique a migration antes de usar limites no app."
      );
    }

    if (!limiteData) return Alert.alert("Limite", "Informe a data no formato YYYY-MM-DD.");

    const limite = limiteQtd.trim() ? Number(limiteQtd) : null;
    if (limite !== null && (!Number.isInteger(limite) || limite < 0)) {
      return Alert.alert("Limite", "O limite deve ser um numero inteiro maior ou igual a zero.");
    }

    setLimiteSaving(true);
    const vendidos =
      limites.find((item) => item.id === limiteData)?.vendidos ??
      ingressosVendidosPorData[limiteData] ??
      0;

    const { error } = await supabase.from("limites_ingressos").upsert({
      id: limiteData,
      data: limiteData,
      limite,
      vendidos,
      esgotado: limiteEsgotado,
      atualizadoEm: new Date().toISOString(),
    });
    setLimiteSaving(false);

    if (error) return Alert.alert("Limite", error.message);
    Alert.alert("Limite", "Limite salvo com sucesso.");
    await fetchAll();
  }

  function editarLimite(limite: LimiteIngressos) {
    setLimiteData(limite.data);
    setLimiteQtd(limite.limite == null ? "" : String(limite.limite));
    setLimiteEsgotado(limite.esgotado);
  }

  function confirmarExcluirLimite(id: string) {
    Alert.alert("Remover limite", `Remover limite de ${formatDate(id)}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("limites_ingressos").delete().eq("id", id);
          if (error) Alert.alert("Limite", error.message);
          await fetchAll();
        },
      },
    ]);
  }

  function handleTabChange(t: AppTab) {
    if (t === "validar") {
      router.replace("/(app)/scanner");
    } else {
      setTab(t as Tab);
    }
  }

  const shell = (
    <PremiumShell activeTab={tab as AppTab} onTabChange={handleTabChange}>
      {loading ? (
        <View style={[s.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={[s.mutedText, { color: theme.text2 }]}>Carregando painel...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.bg }}
          contentContainerStyle={s.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
        >
          {tab === "pedidos" && (
            <>
              <PedidosHeader
                busca={busca}
                setBusca={setBusca}
                dataFiltro={dataFiltro}
                setDataFiltro={setDataFiltro}
                total={pedidosFiltrados.length}
              />
              {pedidosFiltrados.length === 0 ? (
                <Text style={[s.emptyText, { color: theme.text2 }]}>Nenhum pedido encontrado.</Text>
              ) : (
                pedidosFiltrados.map((pedido) => <PedidoRow key={pedido.id} pedido={pedido} />)
              )}
            </>
          )}
          {tab === "faturamento" && (
            <FaturamentoView
              stats={stats}
              byType={summaryByType}
              totalTickets={stats.totalTickets}
              topVisitDays={topVisitDays}
            />
          )}
          {tab === "cupons" && (
            <CuponsView
              cupons={cupons}
              usosMap={couponsUsed}
              novoCodigo={novoCodigo}
              setNovoCodigo={setNovoCodigo}
              novoDesconto={novoDesconto}
              setNovoDesconto={setNovoDesconto}
              novaValidade={novaValidade}
              setNovaValidade={setNovaValidade}
              saving={cupomSaving}
              onSave={salvarCupom}
              onDelete={confirmarExcluirCupom}
            />
          )}
          {tab === "limites" && (
            <LimitesView
              limites={limites}
              limitesAvailable={limitesAvailable}
              limiteData={limiteData}
              setLimiteData={setLimiteData}
              limiteQtd={limiteQtd}
              setLimiteQtd={setLimiteQtd}
              limiteEsgotado={limiteEsgotado}
              setLimiteEsgotado={setLimiteEsgotado}
              saving={limiteSaving}
              onSave={salvarLimite}
              onEdit={editarLimite}
              onDelete={confirmarExcluirLimite}
            />
          )}
        </ScrollView>
      )}
    </PremiumShell>
  );

  return shell;
}

// ─── Faturamento ────────────────────────────────────────────────────────────

function FaturamentoView(props: {
  stats: { totalTickets: number; revenue: number; todayRevenue: number; validatedCount: number };
  byType: { tipo: string; qty: number; total: number }[];
  totalTickets: number;
  topVisitDays: [string, { qty: number; receita: number }][];
}) {
  const { theme } = useTheme();

  const kpiCards = [
    { label: "Receita",    value: formatBRL(props.stats.revenue),        color: theme.green,  bg: theme.greenBg,  icon: "cash-outline"           },
    { label: "Ingressos",  value: String(props.stats.totalTickets),       color: theme.blue,   bg: theme.blueBg,   icon: "ticket-outline"         },
    { label: "Hoje",       value: formatBRL(props.stats.todayRevenue),    color: theme.amber,  bg: theme.amberBg,  icon: "calendar-outline"       },
    { label: "Validados",  value: String(props.stats.validatedCount),     color: theme.teal,   bg: theme.tealBg,   icon: "checkmark-done-outline" },
  ] as const;

  const typeColors = {
    infantil: { color: theme.teal,  bg: theme.tealBg  },
    meia:     { color: theme.amber, bg: theme.amberBg },
    inteira:  { color: theme.green, bg: theme.greenBg },
  } as Record<string, { color: string; bg: string }>;

  return (
    <>
      {/* Grid 2×2 KPIs */}
      <View style={s.kpiGrid}>
        {kpiCards.map((card) => (
          <View
            key={card.label}
            style={[s.kpiCard, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}
          >
            <View style={[s.kpiChip, { backgroundColor: card.bg }]}>
              <Ionicons name={card.icon as keyof typeof Ionicons.glyphMap} size={18} color={card.color} />
            </View>
            <Text style={[s.kpiLabel, { color: theme.text2 }]}>{card.label}</Text>
            <Text style={[s.kpiValue, { color: theme.text }]}>{card.value}</Text>
          </View>
        ))}
      </View>

      {/* Ingressos por tipo */}
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
        <Text style={[s.cardTitle, { color: theme.text }]}>Ingressos por tipo</Text>
        {props.byType.map((item) => {
          const pct = props.totalTickets > 0 ? Math.round((item.qty / props.totalTickets) * 100) : 0;
          const tc = typeColors[item.tipo] ?? { color: theme.accent, bg: theme.accentSoft };
          return (
            <View key={item.tipo} style={s.typeRow}>
              <View style={s.typeHeader}>
                <Text style={[s.typeName, { color: theme.text }]}>{item.tipo}</Text>
                <Text style={[s.typePct, { color: tc.color }]}>{pct}%</Text>
              </View>
              <Text style={[s.typeSub, { color: theme.text2 }]}>
                {item.qty} ingressos · {formatBRL(item.total)}
              </Text>
              <View style={[s.barTrack, { backgroundColor: theme.surface2 }]}>
                <View style={[s.barFill, { width: `${Math.max(pct, 1)}%` as any, backgroundColor: tc.color }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Top dias de visita */}
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
        <Text style={[s.cardTitle, { color: theme.text }]}>Top dias de visita</Text>
        {props.topVisitDays.length === 0 ? (
          <Text style={[s.emptyText, { color: theme.text2 }]}>Sem dados ainda.</Text>
        ) : (
          props.topVisitDays.map(([date, value], index) => (
            <View key={date} style={[s.rankRow, { borderTopColor: theme.border }]}>
              <View style={[s.rankChip, { backgroundColor: theme.accentSoft }]}>
                <Text style={[s.rankNum, { color: theme.accent }]}>{index + 1}</Text>
              </View>
              <View style={s.rankInfo}>
                <Text style={[s.rankDate, { color: theme.text }]}>{formatDate(date)}</Text>
                <Text style={[s.rankSub, { color: theme.text2 }]}>{value.qty} ingressos</Text>
              </View>
              <Text style={[s.rankValue, { color: theme.green }]}>{formatBRL(value.receita)}</Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}

// ─── Pedidos ────────────────────────────────────────────────────────────────

function PedidosHeader(props: {
  busca: string;
  setBusca: (value: string) => void;
  dataFiltro: string;
  setDataFiltro: (value: string) => void;
  total: number;
}) {
  const { theme } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
      <View style={s.pedidosHeaderTop}>
        <Text style={[s.cardTitle, { color: theme.text, marginBottom: 0 }]}>Pedidos</Text>
        <View style={[s.countPill, { backgroundColor: theme.accentSoft }]}>
          <Text style={[s.countPillText, { color: theme.accent }]}>{props.total}</Text>
        </View>
      </View>
      {/* Busca */}
      <View style={[s.inputWrap, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
        <View style={s.inputIcon}>
          <Ionicons name="search-outline" size={17} color={theme.text3} />
        </View>
        <TextInput
          value={props.busca}
          onChangeText={props.setBusca}
          placeholder="Buscar por nome, CPF ou e-mail"
          placeholderTextColor={theme.text3}
          style={[s.inputField, { color: theme.text }]}
        />
      </View>
      {/* Data filtro */}
      <View style={[s.inputWrap, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
        <View style={s.inputIcon}>
          <Ionicons name="calendar-outline" size={17} color={theme.text3} />
        </View>
        <DatePickerField
          value={props.dataFiltro}
          onChange={props.setDataFiltro}
          placeholder="Data da visita (AAAA-MM-DD)"
          inlineStyle
        />
      </View>
      {(props.busca || props.dataFiltro) && (
        <Pressable
          onPress={() => { props.setBusca(""); props.setDataFiltro(""); }}
          style={[s.clearBtn, { borderColor: theme.border }]}
        >
          <Text style={[s.clearBtnText, { color: theme.text2 }]}>Limpar filtros</Text>
        </Pressable>
      )}
    </View>
  );
}

function PedidoRow({ pedido: p }: { pedido: Pedido }) {
  const { theme } = useTheme();
  const validated = !!p.validated_at;
  const shared = isSharedPedido(p);
  const visit = new Date(p.visitDate + "T12:00:00").toLocaleDateString("pt-BR");
  const holderName = ticketHolderDisplayName(p);
  const buyerName = buyerDisplayName(p);
  const avatarInitials = initials(holderName);
  const holderCpf = p.destinatario_cpf || p.comprador?.cpf || p.comprador?.email || "--";

  const comp = [
    qty(p.items, "inteira") > 0 ? `${qty(p.items, "inteira")} Inteira` : null,
    qty(p.items, "meia") > 0 ? `${qty(p.items, "meia")} Meia` : null,
    qty(p.items, "infantil") > 0 ? `${qty(p.items, "infantil")} Infantil` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[s.pedidoCard, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
      {/* Avatar */}
      <View style={[s.avatar, { backgroundColor: theme.accentSoft }]}>
        <Text style={[s.avatarText, { color: theme.accent }]}>{avatarInitials || "?"}</Text>
      </View>
      {/* Info */}
      <View style={s.pedidoInfo}>
        <Text style={[s.pedidoName, { color: theme.text }]} numberOfLines={1}>
          {holderName}
        </Text>
        <View style={s.pedidoRow2}>
          <Text style={[s.pedidoDate, { color: theme.text2 }]}>{visit}</Text>
          {shared && (
            <View style={[s.sharedTag, { backgroundColor: theme.blueBg }]}>
              <Text style={[s.sharedTagText, { color: theme.blue }]}>Compartilhado</Text>
            </View>
          )}
          {p.coupon && (
            <View style={[s.couponTag, { backgroundColor: theme.accentSoft }]}>
              <Text style={[s.couponTagText, { color: theme.accent }]}>{p.coupon}</Text>
            </View>
          )}
        </View>
        {comp ? <Text style={[s.pedidoComp, { color: theme.text2 }]}>{comp}</Text> : null}
        <Text style={[s.pedidoCpf, { color: theme.text3 }]}>
          {holderCpf}
        </Text>
        {shared ? (
          <Text style={[s.pedidoCpf, { color: theme.text3 }]} numberOfLines={1}>
            Comprador: {buyerName}
          </Text>
        ) : null}
      </View>
      {/* Valor + status */}
      <View style={s.pedidoRight}>
        <Text style={[s.pedidoTotal, { color: theme.text }]}>{formatBRL(Number(p.total))}</Text>
        <View style={[s.statusPill, { backgroundColor: validated ? theme.greenBg : theme.amberBg }]}>
          <Text style={[s.statusText, { color: validated ? theme.green : theme.amber }]}>
            {validated ? "Validado" : "Pendente"}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Cupons ─────────────────────────────────────────────────────────────────

function CuponsView(props: {
  cupons: Cupom[];
  usosMap: Record<string, { usos: number; desconto: number }>;
  novoCodigo: string;
  setNovoCodigo: (value: string) => void;
  novoDesconto: string;
  setNovoDesconto: (value: string) => void;
  novaValidade: string;
  setNovaValidade: (value: string) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: (codigo: string) => void;
}) {
  const { theme } = useTheme();
  const maxUsos = Math.max(1, ...Object.values(props.usosMap).map((item) => item.usos));
  return (
    <>
      {/* Cabeçalho + botão */}
      <View style={s.cuponsHeader}>
        <Text style={[s.pageTitle, { color: theme.text }]}>Cupons</Text>
        <Pressable
          onPress={props.onSave}
          disabled={props.saving}
          style={[s.newCouponBtn, { backgroundColor: theme.accent, opacity: props.saving ? 0.6 : 1 }]}
        >
          <Ionicons name="add" size={15} color={theme.onAccent} />
          <Text style={[s.newCouponBtnText, { color: theme.onAccent }]}>
            {props.saving ? "Salvando..." : "Novo cupom"}
          </Text>
        </Pressable>
      </View>

      {/* Formulário criar */}
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
        <Text style={[s.cardTitle, { color: theme.text }]}>Criar cupom</Text>
        <TextInput
          value={props.novoCodigo}
          onChangeText={(v) => props.setNovoCodigo(v.toUpperCase())}
          placeholder="Código ex: OASIS10"
          placeholderTextColor={theme.text3}
          style={[s.formInput, { borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text }]}
          autoCapitalize="characters"
        />
        <TextInput
          value={props.novoDesconto}
          onChangeText={props.setNovoDesconto}
          placeholder="Desconto em %"
          placeholderTextColor={theme.text3}
          style={[s.formInput, { borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text }]}
          keyboardType="numeric"
        />
        <DatePickerField
          value={props.novaValidade}
          onChange={props.setNovaValidade}
          placeholder="Validade YYYY-MM-DD"
        />
        <GoldenButton
          label={props.saving ? "Salvando..." : "Salvar cupom"}
          onPress={props.onSave}
          disabled={props.saving}
        />
      </View>

      {/* Lista de cupons */}
      {props.cupons.length === 0 ? (
        <Text style={[s.emptyText, { color: theme.text2 }]}>Nenhum cupom cadastrado.</Text>
      ) : (
        props.cupons.map((cupom) => {
          const vigente = isCupomVigente(cupom.validade);
          const usos = props.usosMap[cupom.codigo]?.usos ?? 0;
          const usoPct = Math.min((usos / maxUsos) * 100, 100);
          return (
            <View
              key={cupom.codigo}
              style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}
            >
              <View style={s.cupomTop}>
                <Text style={[s.cupomCode, { color: theme.text }]}>{cupom.codigo}</Text>
                <View style={[s.discountBadge, { backgroundColor: theme.accentSoft }]}>
                  <Text style={[s.discountText, { color: theme.accent }]}>{cupom.desconto}% OFF</Text>
                </View>
              </View>
              <View style={s.cupomRow}>
                <Ionicons name="calendar-outline" size={13} color={theme.text3} />
                <Text style={[s.cupomValidade, { color: theme.text3 }]}>
                  {vigente ? `Válido até ${formatDate(cupom.validade)}` : `Expirado em ${formatDate(cupom.validade)}`}
                </Text>
              </View>
              <View style={[s.barTrack, { backgroundColor: theme.surface2, marginTop: 12 }]}>
                <View
                  style={[
                    s.barFill,
                    {
                      width: `${Math.max(usoPct, usos > 0 ? 4 : 0)}%` as any,
                      backgroundColor: vigente ? theme.green : theme.red,
                    },
                  ]}
                />
              </View>
              <View style={s.cupomBottom}>
                <Text style={[s.cupomUsos, { color: theme.text3 }]}>{usos} uso(s)</Text>
                <View style={s.cupomActions}>
                  <View style={[s.statusPill, { backgroundColor: vigente ? theme.greenBg : theme.surface2 }]}>
                    <Text style={[s.statusText, { color: vigente ? theme.green : theme.text3 }]}>
                      {vigente ? "Ativo" : "Expirado"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => props.onDelete(cupom.codigo)}
                    style={[s.iconBtn, { backgroundColor: theme.surface2 }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.red} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })
      )}
    </>
  );
}

// ─── Limites ─────────────────────────────────────────────────────────────────

function LimitesView(props: {
  limites: LimiteIngressos[];
  limitesAvailable: boolean;
  limiteData: string;
  setLimiteData: (value: string) => void;
  limiteQtd: string;
  setLimiteQtd: (value: string) => void;
  limiteEsgotado: boolean;
  setLimiteEsgotado: (value: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onEdit: (limite: LimiteIngressos) => void;
  onDelete: (id: string) => void;
}) {
  const { theme } = useTheme();

  if (!props.limitesAvailable) {
    return (
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[s.cardTitle, { color: theme.text }]}>Limites indisponíveis</Text>
        <Text style={[s.emptyText, { color: theme.text2 }]}>
          A tabela limites_ingressos ainda não existe no Supabase. Aplique a migration para ativar limites por data.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={s.limitesHeader}>
        <Text style={[s.pageTitle, { color: theme.text }]}>Limites diários</Text>
        <Text style={[s.limitesSubtitle, { color: theme.text2 }]}>Capacidade por data de visita</Text>
      </View>

      {/* Configurar */}
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
        <Text style={[s.cardTitle, { color: theme.text }]}>Configurar limite por dia</Text>
        <DatePickerField
          value={props.limiteData}
          onChange={props.setLimiteData}
          placeholder="Data YYYY-MM-DD"
        />
        <TextInput
          value={props.limiteQtd}
          onChangeText={props.setLimiteQtd}
          placeholder="Limite de ingressos (vazio = sem limite)"
          placeholderTextColor={theme.text3}
          style={[s.formInput, { borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text }]}
          keyboardType="numeric"
        />
        <View style={[s.switchRow, { borderColor: theme.border }]}>
          <Text style={[s.switchLabel, { color: theme.text }]}>Marcar como esgotada</Text>
          <Switch
            value={props.limiteEsgotado}
            onValueChange={props.setLimiteEsgotado}
            thumbColor={props.limiteEsgotado ? theme.red : theme.text3}
            trackColor={{ true: theme.amberBg, false: theme.surface2 }}
          />
        </View>
        <GoldenButton
          label={props.saving ? "Salvando..." : "Salvar limite"}
          onPress={props.onSave}
          disabled={props.saving}
        />
      </View>

      {/* Lista */}
      {props.limites.length === 0 ? (
        <Text style={[s.emptyText, { color: theme.text2 }]}>Nenhuma data configurada.</Text>
      ) : (
        props.limites.map((limite) => {
          const pct =
            limite.limite != null && limite.limite > 0
              ? Math.min((limite.vendidos / limite.limite) * 100, 100)
              : 0;
          const esgotado =
            limite.esgotado || (limite.limite != null && limite.vendidos >= limite.limite);
          const barColor =
            pct >= 100 ? theme.red : pct >= 90 ? theme.amber : theme.green;
          const disponiveis =
            limite.limite == null ? null : Math.max(limite.limite - limite.vendidos, 0);

          return (
            <View
              key={limite.id}
              style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}
            >
              <View style={s.limiteRow}>
                <View style={s.limiteInfo}>
                  <Text style={[s.limiteDate, { color: theme.text }]}>{formatDate(limite.data)}</Text>
                  <Text style={[s.limiteSub, { color: theme.text2 }]}>
                    {limite.vendidos} vendidos · limite {limite.limite == null ? "livre" : limite.limite}
                  </Text>
                  <Text style={[s.limiteSub, { color: theme.text2 }]}>
                    Disponíveis: {disponiveis == null ? "livre" : disponiveis}
                  </Text>
                </View>
                <View style={s.limiteActions}>
                  <View style={[s.statusPill, { backgroundColor: esgotado ? theme.amberBg : theme.greenBg }]}>
                    <Text style={[s.statusText, { color: esgotado ? theme.amber : theme.green }]}>
                      {esgotado ? "Esgotado" : "Disponível"}
                    </Text>
                  </View>
                  <View style={s.limiteIcons}>
                    <Pressable
                      onPress={() => props.onEdit(limite)}
                      style={[s.iconBtn, { backgroundColor: theme.surface2 }]}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.accent} />
                    </Pressable>
                    <Pressable
                      onPress={() => props.onDelete(limite.id)}
                      style={[s.iconBtn, { backgroundColor: theme.surface2 }]}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.red} />
                    </Pressable>
                  </View>
                </View>
              </View>
              {limite.limite != null && (
                <View style={[s.barTrack, { backgroundColor: theme.surface2, marginTop: 10 }]}>
                  <View
                    style={[
                      s.barFill,
                      { width: `${Math.max(pct, 1)}%` as any, backgroundColor: barColor },
                    ]}
                  />
                </View>
              )}
            </View>
          );
        })
      )}
    </>
  );
}

// ─── DatePickerField ─────────────────────────────────────────────────────────

function DatePickerField({
  value,
  onChange,
  placeholder,
  inlineStyle,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style?: object;
  inlineStyle?: boolean;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = parseISODate(value || getTodayISO());
    return new Date(base.getFullYear(), base.getMonth(), 1, 12);
  });

  const selected = value ? parseISODate(value) : null;
  const monthLabel = visibleMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
  const blanks = firstDay.getDay();
  const totalDays = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: blanks + totalDays }, (_, i) => (i < blanks ? null : i - blanks + 1));

  function changeMonth(delta: number) {
    setVisibleMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + delta, 1, 12));
  }

  function pickDay(day: number) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12);
    onChange(toISODate(next));
    setOpen(false);
  }

  const triggerStyle = inlineStyle
    ? [s.dateFieldInline, { color: theme.text }]
    : [s.dateFieldStandalone, { borderColor: theme.border, backgroundColor: theme.surface2 }];

  return (
    <>
      <Pressable
        onPress={() => {
          const base = parseISODate(value || getTodayISO());
          setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1, 12));
          setOpen(true);
        }}
        style={inlineStyle ? s.dateFieldInlineWrap : undefined}
      >
        <Text style={[triggerStyle, !value && { color: theme.text3 }]}>
          {value ? formatDate(value) : placeholder}
        </Text>
        {!inlineStyle && (
          <Ionicons name="calendar-outline" size={18} color={theme.text3} style={{ marginTop: 12, marginBottom: 12, marginRight: 12, position: 'absolute', right: 0, top: 0 }} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[s.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[s.calCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={s.calHeader}>
              <Pressable onPress={() => changeMonth(-1)} style={[s.calNavBtn, { backgroundColor: theme.surface2 }]}>
                <Ionicons name="chevron-back" size={20} color={theme.text} />
              </Pressable>
              <Text style={[s.calTitle, { color: theme.text }]}>{monthLabel}</Text>
              <Pressable onPress={() => changeMonth(1)} style={[s.calNavBtn, { backgroundColor: theme.surface2 }]}>
                <Ionicons name="chevron-forward" size={20} color={theme.text} />
              </Pressable>
            </View>
            <View style={s.weekRow}>
              {["D","S","T","Q","Q","S","S"].map((d, i) => (
                <Text key={`${d}-${i}`} style={[s.weekDay, { color: theme.text2 }]}>{d}</Text>
              ))}
            </View>
            <View style={s.calGrid}>
              {days.map((day, i) => {
                if (!day) return <View key={`blank-${i}`} style={s.dayCell} />;
                const dayISO = toISODate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12));
                const active = selected ? dayISO === toISODate(selected) : false;
                return (
                  <Pressable
                    key={dayISO}
                    onPress={() => pickDay(day)}
                    style={[s.dayCell, s.dayBtn, active && { backgroundColor: theme.accent }]}
                  >
                    <Text style={[s.dayText, { color: active ? theme.onAccent : theme.text }]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.calActions}>
              <Pressable onPress={() => setOpen(false)} style={[s.calCancelBtn, { backgroundColor: theme.surface2 }]}>
                <Text style={[s.calCancelText, { color: theme.text2 }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => { onChange(toISODate(parseISODate(getTodayISO()))); setOpen(false); }}
                style={[s.calTodayBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={[s.calTodayText, { color: theme.onAccent }]}>Hoje</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── GoldenButton ────────────────────────────────────────────────────────────

function GoldenButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.goldenBtn, { backgroundColor: theme.accent, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={[s.goldenBtnText, { color: theme.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scrollContent: { padding: 14, paddingBottom: 32, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  mutedText: { fontSize: 13 },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 13 },

  // Card base
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: { fontSize: 14, fontFamily: fonts.bold, marginBottom: 14 },

  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  kpiChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: { fontSize: 12, fontFamily: fonts.semibold, marginTop: 11 },
  kpiValue: { fontSize: 20, fontFamily: fonts.extrabold, letterSpacing: -0.4, marginTop: 2 },

  // Type rows (progress)
  typeRow: { marginBottom: 14 },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  typeName: { fontSize: 13, fontFamily: fonts.bold },
  typePct: { fontSize: 13, fontFamily: fonts.extrabold },
  typeSub: { fontSize: 11.5, marginTop: 3, marginBottom: 7 },
  barTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },

  // Ranking
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  rankChip: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankNum: { fontSize: 11.5, fontFamily: fonts.extrabold },
  rankInfo: { flex: 1 },
  rankDate: { fontSize: 13, fontFamily: fonts.bold },
  rankSub: { fontSize: 11.5, marginTop: 1 },
  rankValue: { fontSize: 13.5, fontFamily: fonts.extrabold, letterSpacing: -0.1 },

  // Pedidos header
  pedidosHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  countPill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  countPillText: { fontSize: 11.5, fontFamily: fonts.extrabold },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
    minHeight: 44,
    overflow: 'hidden',
  },
  inputIcon: { paddingLeft: 13, paddingRight: 4 },
  inputField: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  clearBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  clearBtnText: { fontSize: 12, fontFamily: fonts.bold },

  // Pedido card
  pedidoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 13.5, fontFamily: fonts.extrabold },
  pedidoInfo: { flex: 1, minWidth: 0 },
  pedidoName: { fontSize: 14, fontFamily: fonts.bold, lineHeight: 18 },
  pedidoRow2: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  pedidoDate: { fontSize: 12.5, fontFamily: fonts.bold },
  couponTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  couponTagText: { fontSize: 10, fontFamily: fonts.extrabold, letterSpacing: 0.5 },
  sharedTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  sharedTagText: { fontSize: 10, fontFamily: fonts.extrabold },
  pedidoComp: { fontSize: 12, marginTop: 3 },
  pedidoCpf: { fontSize: 11.5, marginTop: 2 },
  pedidoRight: { alignItems: 'flex-end', gap: 7, flexShrink: 0 },
  pedidoTotal: { fontSize: 15, fontFamily: fonts.extrabold, letterSpacing: -0.1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontFamily: fonts.bold },

  // Cupons
  cuponsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pageTitle: { fontSize: 16, fontFamily: fonts.extrabold, letterSpacing: -0.1 },
  newCouponBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newCouponBtnText: { fontSize: 12.5, fontFamily: fonts.bold },
  cupomTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cupomCode: { fontSize: 15, fontFamily: fonts.extrabold, letterSpacing: 0.6 },
  discountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  discountText: { fontSize: 12, fontFamily: fonts.extrabold },
  cupomRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  cupomValidade: { fontSize: 11.5 },
  cupomBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  cupomUsos: { fontSize: 11.5 },
  cupomActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Limites
  limitesHeader: { gap: 2, marginBottom: 4 },
  limitesSubtitle: { fontSize: 12.5 },
  limiteRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  limiteInfo: { flex: 1 },
  limiteDate: { fontSize: 13.5, fontFamily: fonts.bold },
  limiteSub: { fontSize: 11.5, marginTop: 2 },
  limiteActions: { alignItems: 'flex-end', gap: 8 },
  limiteIcons: { flexDirection: 'row', gap: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 12,
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 13, fontFamily: fonts.semibold },

  // Forms
  formInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontSize: 13,
    fontFamily: fonts.semibold,
    marginBottom: 10,
  },

  // Golden button
  goldenBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  goldenBtnText: { fontSize: 14, fontFamily: fonts.bold },

  // Date picker inline (inside inputWrap)
  dateFieldInlineWrap: { flex: 1, justifyContent: 'center', paddingLeft: 4 },
  dateFieldInline: { fontSize: 13, fontFamily: fonts.semibold, paddingVertical: 12 },
  // Date picker standalone
  dateFieldStandalone: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },

  // Calendar modal
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  calCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: { fontSize: 16, fontFamily: fonts.extrabold, textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontFamily: fonts.bold },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dayBtn: { borderRadius: 10 },
  dayText: { fontFamily: fonts.bold, fontSize: 13 },
  calActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  calCancelBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  calCancelText: { fontFamily: fonts.bold },
  calTodayBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  calTodayText: { fontFamily: fonts.extrabold },
});

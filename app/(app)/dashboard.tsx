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
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, formatBRL } from "@/lib/theme";
import type { ItemPedido, Pedido } from "@/lib/types";

type Tab = "pedidos" | "resumo" | "cupons" | "limites";

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

function normalizeDateInput(value: string): string {
  return value.replace(/[^\d-]/g, "").slice(0, 10);
}

function isMissingTableError(error: unknown, table: string): boolean {
  const maybeError = error as { code?: string; message?: string } | null;
  return (
    maybeError?.code === "PGRST205" &&
    typeof maybeError.message === "string" &&
    maybeError.message.includes(table)
  );
}

export default function Dashboard() {
  const router = useRouter();
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
          pedido.comprador?.email?.toLowerCase().includes(term)
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
    return Object.entries(map);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.sky} size="large" />
        <Text style={styles.muted}>Carregando painel...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sky} />}
    >
      <View style={styles.adminLayout}>
        <SideMenu value={tab} onChange={setTab} onValidate={() => router.replace("/(app)/scanner")} />
        <View style={styles.adminContent}>
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
                <Text style={styles.emptyText}>Nenhum pedido encontrado.</Text>
              ) : (
                pedidosFiltrados.map((pedido) => <PedidoRow key={pedido.id} pedido={pedido} />)
              )}
            </>
          )}
          {tab === "resumo" && (
            <ResumoView
              stats={stats}
              byType={summaryByType}
              totalTickets={stats.totalTickets}
              topVisitDays={topVisitDays}
              couponsUsed={couponsUsed}
            />
          )}
          {tab === "cupons" && (
            <CuponsView
              cupons={cupons}
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
        </View>
      </View>
    </ScrollView>
  );
}

function StatsGrid({ stats }: { stats: { totalTickets: number; revenue: number; todayRevenue: number; validatedCount: number } }) {
  const cards = [
    { label: "Receita", value: formatBRL(stats.revenue), color: colors.emerald, icon: "cash-outline" },
    { label: "Ingressos", value: String(stats.totalTickets), color: colors.sky, icon: "ticket-outline" },
    { label: "Hoje", value: formatBRL(stats.todayRevenue), color: colors.amber, icon: "calendar-outline" },
    { label: "Validados", value: String(stats.validatedCount), color: colors.cyan, icon: "checkmark-done-outline" },
  ];

  return (
    <View style={styles.cardsGrid}>
      {cards.map((card) => (
        <View key={card.label} style={[styles.statCard, { backgroundColor: card.color }]}>
          <Ionicons name={card.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.white} />
          <Text style={styles.statLabel}>{card.label}</Text>
          <Text style={styles.statValue}>{card.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SideMenu({
  value,
  onChange,
  onValidate,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
  onValidate: () => void;
}) {
  const tabs: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "pedidos", label: "Pedidos", icon: "ticket-outline" },
    { id: "resumo", label: "Faturamento", icon: "bar-chart-outline" },
    { id: "cupons", label: "Cupons", icon: "pricetag-outline" },
    { id: "limites", label: "Limites", icon: "calendar-number-outline" },
  ];

  return (
    <View style={styles.sideMenu}>
      <Pressable onPress={onValidate} style={styles.validateMenuButton}>
        <Ionicons name="qr-code-outline" size={22} color={colors.white} />
        <Text style={styles.validateMenuText}>Validar</Text>
      </Pressable>
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.sideMenuButton, active && styles.sideMenuButtonActive]}
          >
            <Ionicons name={tab.icon} size={22} color={active ? colors.white : colors.textMuted} />
            <Text style={[styles.sideMenuText, active && styles.sideMenuTextActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PedidosHeader(props: {
  busca: string;
  setBusca: (value: string) => void;
  dataFiltro: string;
  setDataFiltro: (value: string) => void;
  total: number;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Pedidos ({props.total})</Text>
      <TextInput
        value={props.busca}
        onChangeText={props.setBusca}
        placeholder="Buscar por nome, CPF ou e-mail"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <View style={styles.rowGap}>
        <DatePickerField
          value={props.dataFiltro}
          onChange={props.setDataFiltro}
          placeholder="Data da visita: YYYY-MM-DD"
          style={styles.flex}
        />
        {(props.busca || props.dataFiltro) && (
          <Pressable
            onPress={() => {
              props.setBusca("");
              props.setDataFiltro("");
            }}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Limpar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PedidoRow({ pedido: p }: { pedido: Pedido }) {
  const validated = !!p.validated_at;
  const visit = new Date(p.visitDate + "T12:00:00").toLocaleDateString("pt-BR");
  const buyerName = buyerDisplayName(p);
  return (
    <View style={styles.orderRow}>
      <View style={styles.orderLeft}>
        <Text style={styles.buyerName}>{buyerName}</Text>
        <Text style={styles.orderDate}>{visit}</Text>
        <Text style={styles.orderTickets}>
          {qty(p.items, "inteira")}I · {qty(p.items, "meia")}M · {qty(p.items, "infantil")}Inf
          {p.coupon ? ` · ${p.coupon}` : ""}
        </Text>
        <Text style={styles.orderCpf}>{p.comprador?.cpf || p.comprador?.email || "--"}</Text>
      </View>
      <View style={styles.orderRight}>
        <Text style={styles.orderTotal}>{formatBRL(Number(p.total))}</Text>
        <View style={[styles.badge, { backgroundColor: validated ? "#dcfce7" : "#fef9c3" }]}>
          <Text style={[styles.badgeText, { color: validated ? colors.emeraldDark : "#a16207" }]}>
            {validated ? "Validado" : "Pendente"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ResumoView(props: {
  stats: { totalTickets: number; revenue: number; todayRevenue: number; validatedCount: number };
  byType: { tipo: string; qty: number; total: number }[];
  totalTickets: number;
  topVisitDays: [string, { qty: number; receita: number }][];
  couponsUsed: [string, { usos: number; desconto: number }][];
}) {
  return (
    <View style={styles.stack}>
      <StatsGrid stats={props.stats} />
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Ingressos por tipo</Text>
        {props.byType.map((item) => {
          const pct = props.totalTickets > 0 ? Math.round((item.qty / props.totalTickets) * 100) : 0;
          return (
            <View key={item.tipo} style={styles.summaryLine}>
              <View>
                <Text style={styles.summaryTitle}>{item.tipo}</Text>
                <Text style={styles.muted}>{item.qty} ingressos · {formatBRL(item.total)}</Text>
              </View>
              <Text style={styles.summaryPct}>{pct}%</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Top dias de visita</Text>
        {props.topVisitDays.length === 0 ? (
          <Text style={styles.emptyText}>Sem dados ainda.</Text>
        ) : (
          props.topVisitDays.map(([date, value]) => (
            <View key={date} style={styles.summaryLine}>
              <View>
                <Text style={styles.summaryTitle}>{formatDate(date)}</Text>
                <Text style={styles.muted}>{value.qty} ingressos</Text>
              </View>
              <Text style={styles.summaryMoney}>{formatBRL(value.receita)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Cupons usados</Text>
        {props.couponsUsed.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum cupom usado ainda.</Text>
        ) : (
          props.couponsUsed.map(([code, value]) => (
            <View key={code} style={styles.summaryLine}>
              <View>
                <Text style={styles.summaryTitle}>{code}</Text>
                <Text style={styles.muted}>{value.usos} uso(s)</Text>
              </View>
              <Text style={styles.summaryMoney}>-{formatBRL(value.desconto)}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function CuponsView(props: {
  cupons: Cupom[];
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
  return (
    <View style={styles.stack}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Criar cupom</Text>
        <TextInput
          value={props.novoCodigo}
          onChangeText={(value) => props.setNovoCodigo(value.toUpperCase())}
          placeholder="Codigo ex: OASIS10"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="characters"
        />
        <TextInput
          value={props.novoDesconto}
          onChangeText={props.setNovoDesconto}
          placeholder="Desconto em %"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          keyboardType="numeric"
        />
        <DatePickerField
          value={props.novaValidade}
          onChange={props.setNovaValidade}
          placeholder="Validade YYYY-MM-DD"
        />
        <PrimaryButton label={props.saving ? "Salvando..." : "Salvar cupom"} onPress={props.onSave} disabled={props.saving} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Cupons cadastrados ({props.cupons.length})</Text>
        {props.cupons.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum cupom cadastrado.</Text>
        ) : (
          props.cupons.map((cupom) => {
            const vigente = isCupomVigente(cupom.validade);
            return (
              <View key={cupom.codigo} style={styles.manageRow}>
                <View>
                  <Text style={styles.summaryTitle}>{cupom.codigo}</Text>
                  <Text style={styles.muted}>{cupom.desconto}% · ate {formatDate(cupom.validade)}</Text>
                </View>
                <View style={styles.actions}>
                  <Text style={[styles.statusText, { color: vigente ? colors.emeraldDark : colors.redDark }]}>
                    {vigente ? "Ativo" : "Expirado"}
                  </Text>
                  <Pressable onPress={() => props.onDelete(cupom.codigo)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={18} color={colors.redDark} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

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
  if (!props.limitesAvailable) {
    return (
      <View style={styles.stack}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Limites indisponiveis</Text>
          <Text style={styles.emptyText}>
            A tabela limites_ingressos ainda nao existe no Supabase. Aplique a migration dessa tabela para ativar
            limites por data no app.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Configurar limite por dia</Text>
        <DatePickerField
          value={props.limiteData}
          onChange={props.setLimiteData}
          placeholder="Data YYYY-MM-DD"
        />
        <TextInput
          value={props.limiteQtd}
          onChangeText={props.setLimiteQtd}
          placeholder="Limite de ingressos (vazio = sem limite)"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          keyboardType="numeric"
        />
        <View style={styles.switchRow}>
          <Text style={styles.summaryTitle}>Marcar data como esgotada</Text>
          <Switch
            value={props.limiteEsgotado}
            onValueChange={props.setLimiteEsgotado}
            thumbColor={props.limiteEsgotado ? colors.red : colors.white}
            trackColor={{ true: "#fecaca", false: colors.border }}
          />
        </View>
        <PrimaryButton label={props.saving ? "Salvando..." : "Salvar limite"} onPress={props.onSave} disabled={props.saving} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Datas configuradas ({props.limites.length})</Text>
        {props.limites.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma data configurada.</Text>
        ) : (
          props.limites.map((limite) => {
            const disponiveis = limite.limite == null ? null : Math.max(limite.limite - limite.vendidos, 0);
            const esgotado = limite.esgotado || (limite.limite != null && limite.vendidos >= limite.limite);
            return (
              <View key={limite.id} style={styles.manageRow}>
                <View style={styles.flex}>
                  <Text style={styles.summaryTitle}>{formatDate(limite.data)}</Text>
                  <Text style={styles.muted}>
                    Vendidos {limite.vendidos} · Limite {limite.limite == null ? "livre" : limite.limite}
                  </Text>
                  <Text style={styles.muted}>
                    Disponiveis {disponiveis == null ? "livre" : disponiveis}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Text style={[styles.statusText, { color: esgotado ? colors.redDark : colors.emeraldDark }]}>
                    {esgotado ? "Esgotado" : "Disponivel"}
                  </Text>
                  <Pressable onPress={() => props.onEdit(limite)} style={styles.iconButton}>
                    <Ionicons name="create-outline" size={18} color={colors.skyDark} />
                  </Pressable>
                  <Pressable onPress={() => props.onDelete(limite.id)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={18} color={colors.redDark} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function DatePickerField({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style?: object;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = parseISODate(value || getTodayISO());
    return new Date(base.getFullYear(), base.getMonth(), 1, 12);
  });

  const selected = value ? parseISODate(value) : null;
  const monthLabel = visibleMonth.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
  const blanks = firstDay.getDay();
  const totalDays = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: blanks + totalDays }, (_, index) =>
    index < blanks ? null : index - blanks + 1
  );

  function changeMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));
  }

  function pickDay(day: number) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12);
    onChange(toISODate(next));
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          const base = parseISODate(value || getTodayISO());
          setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1, 12));
          setOpen(true);
        }}
        style={[styles.dateField, style]}
      >
        <Text style={[styles.dateFieldText, !value && styles.dateFieldPlaceholder]}>
          {value ? formatDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => changeMonth(-1)} style={styles.calendarNavButton}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Text style={styles.calendarTitle}>{monthLabel}</Text>
              <Pressable onPress={() => changeMonth(1)} style={styles.calendarNavButton}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.weekDay}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {days.map((day, index) => {
                if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
                const dayISO = toISODate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12));
                const active = selected ? dayISO === toISODate(selected) : false;
                return (
                  <Pressable
                    key={dayISO}
                    onPress={() => pickDay(day)}
                    style={[styles.dayCell, styles.dayButton, active && styles.dayButtonActive]}
                  >
                    <Text style={[styles.dayText, active && styles.dayTextActive]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarActions}>
              <Pressable onPress={() => setOpen(false)} style={styles.calendarCancel}>
                <Text style={styles.calendarCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const today = parseISODate(getTodayISO());
                  onChange(toISODate(today));
                  setOpen(false);
                }}
                style={styles.calendarToday}
              >
                <Text style={styles.calendarTodayText}>Hoje</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primaryButton, disabled && styles.disabled]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 12, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 10,
  },
  muted: { color: colors.textMuted, fontSize: 12 },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "45%",
    borderRadius: 18,
    padding: 14,
  },
  statLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700", marginTop: 6 },
  statValue: { color: colors.white, fontSize: 20, fontWeight: "900", marginTop: 2 },
  adminLayout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  adminContent: {
    flex: 1,
    minWidth: 0,
  },
  sideMenu: {
    width: 92,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    gap: 8,
  },
  validateMenuButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 14,
    backgroundColor: colors.sky,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  validateMenuText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "900",
  },
  sideMenuButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 4,
  },
  sideMenuButtonActive: {
    borderColor: colors.sky,
    backgroundColor: colors.sky,
  },
  sideMenuText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  sideMenuTextActive: { color: colors.white },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  stack: { gap: 2 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    color: colors.text,
    fontWeight: "700",
    marginBottom: 10,
  },
  dateField: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dateFieldText: {
    color: colors.text,
    fontWeight: "800",
    flex: 1,
  },
  dateFieldPlaceholder: {
    color: colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  calendarCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: colors.card,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarNavButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  calendarTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dayButton: {
    borderRadius: 12,
  },
  dayButtonActive: {
    backgroundColor: colors.sky,
  },
  dayText: {
    color: colors.text,
    fontWeight: "800",
  },
  dayTextActive: {
    color: colors.white,
  },
  calendarActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  calendarCancel: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: "#f1f5f9",
  },
  calendarCancelText: {
    color: colors.textMuted,
    fontWeight: "900",
  },
  calendarToday: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.sky,
  },
  calendarTodayText: {
    color: colors.white,
    fontWeight: "900",
  },
  rowGap: { flexDirection: "row", gap: 8, alignItems: "center" },
  flex: { flex: 1 },
  clearButton: {
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  clearButtonText: { color: colors.skyDark, fontWeight: "800", fontSize: 12 },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderLeft: { flex: 1, paddingRight: 10 },
  orderRight: { alignItems: "flex-end", gap: 4 },
  buyerName: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 3,
  },
  orderDate: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  orderTickets: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  orderCpf: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  orderTotal: { fontSize: 15, fontWeight: "900", color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 10,
  },
  summaryTitle: { fontSize: 14, fontWeight: "900", color: colors.text },
  summaryPct: { fontSize: 14, fontWeight: "900", color: colors.amber },
  summaryMoney: { fontSize: 14, fontWeight: "900", color: colors.emeraldDark },
  manageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 12,
  },
  actions: { alignItems: "flex-end", gap: 8 },
  statusText: { fontSize: 12, fontWeight: "900" },
  iconButton: {
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
    padding: 8,
  },
  deleteButton: {
    borderRadius: 999,
    backgroundColor: "#fee2e2",
    padding: 8,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "900", fontSize: 15 },
  disabled: { opacity: 0.6 },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: 20,
  },
});

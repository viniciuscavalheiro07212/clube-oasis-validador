import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors, formatBRL } from "@/lib/theme";
import type { ItemPedido, Pedido, ScanResult } from "@/lib/types";

type Phase = "scanning" | "loading" | "result" | "error";
type ValidationNotice = "none" | "validated" | "already";

/** UUID v1-v5 (formato do pedido.id, gerado por gen_random_uuid). */
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * Extrai o ID do pedido do conteúdo do QR.
 * Aceita o UUID puro ou uma URL que contenha o UUID (ex.: link do ingresso).
 */
function extractPedidoId(raw: string): string | null {
  const match = raw.trim().match(UUID_RE);
  return match ? match[0] : null;
}

/** Quantidade de um tipo de ingresso dentro do array items[]. */
function qty(items: ItemPedido[] | undefined, id: ItemPedido["id"]): number {
  return items?.find((i) => i.id === id)?.quantity ?? 0;
}

export default function Scanner() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [validatorName, setValidatorName] = useState<string | null>(null);
  const [validationNotice, setValidationNotice] =
    useState<ValidationNotice>("none");
  const [message, setMessage] = useState<string>("");

  const reset = useCallback(() => {
    setResult(null);
    setValidatorName(null);
    setValidationNotice("none");
    setMessage("");
    setPhase("scanning");
  }, []);

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      // onBarcodeScanned dispara continuamente; só processamos no estado "scanning".
      setPhase((prev) => {
        if (prev !== "scanning") return prev;
        return "loading";
      });

      const pedidoId = extractPedidoId(data);
      if (!pedidoId) {
        setMessage("QR Code inválido — não contém um ingresso reconhecível.");
        setPhase("error");
        return;
      }

      const { data: pedido, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .maybeSingle<Pedido>();

      if (error) {
        setMessage("Erro ao consultar o ingresso: " + error.message);
        setPhase("error");
        return;
      }
      if (!pedido) {
        setMessage("Ingresso não encontrado no sistema.");
        setPhase("error");
        return;
      }

      // Nome do comprador vem embutido no próprio pedido (comprador jsonb).
      const buyerName = pedido.comprador?.nome?.trim() || "Sem nome cadastrado";

      // Se já validado, busca quem validou (tabela usuarios) para exibir.
      if (pedido.validated_by) {
        await resolveValidator(pedido.validated_by);
      }
      if (pedido.validated_at) {
        setValidationNotice("already");
        setMessage("Ingresso já validado.");
      } else {
        setValidationNotice("none");
        setMessage("");
      }

      setResult({
        pedido,
        buyerName,
        totalTickets: pedido.totalQuantity,
      });
      setPhase("result");
    },
    []
  );

  async function resolveValidator(validatorId: string) {
    const { data } = await supabase
      .from("usuarios")
      .select("nome")
      .eq("uid", validatorId)
      .maybeSingle<{ nome: string | null }>();
    setValidatorName(data?.nome ?? null);
  }

  async function confirmValidation() {
    if (!result || !user) return;
    setPhase("loading");

    // Atualiza só se ainda não validado (.is validated_at null) → previne baixa dupla.
    const { data: updated, error } = await supabase
      .from("pedidos")
      .update({
        validated_at: new Date().toISOString(),
        validated_by: user.id,
      })
      .eq("id", result.pedido.id)
      .is("validated_at", null)
      .select()
      .maybeSingle<Pedido>();

    if (error) {
      setMessage("Erro ao validar: " + error.message);
      setPhase("error");
      return;
    }

    if (!updated) {
      // 0 linhas afetadas → já tinha sido validado por outra pessoa/aparelho.
      const { data: fresh } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", result.pedido.id)
        .maybeSingle<Pedido>();
      if (fresh) {
        if (fresh.validated_by) await resolveValidator(fresh.validated_by);
        setResult((r) => (r ? { ...r, pedido: fresh } : r));
      }
      setValidationNotice("already");
      setMessage("Este ingresso já havia sido validado.");
      setPhase("result");
      return;
    }

    setValidatorName(user.user_metadata?.full_name ?? user.email ?? null);
    setResult((r) => (r ? { ...r, pedido: updated } : r));
    setValidationNotice("validated");
    setMessage("Ingresso validado com sucesso.");
    setPhase("result");
  }

  // ── Permissão de câmera ──
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
        <Text style={styles.permTitle}>Câmera necessária</Text>
        <Text style={styles.permText}>
          O validador precisa da câmera para ler o QR Code dos ingressos.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Permitir câmera</Text>
        </Pressable>
      </View>
    );
  }

  // ── Resultado da leitura / validação ──
  if (phase === "result" && result) {
    const validated = !!result.pedido.validated_at;
    const alreadyValidated = validated && validationNotice === "already";
    const visit = new Date(
      result.pedido.visitDate + "T12:00:00"
    ).toLocaleDateString("pt-BR");
    const validatedAt = result.pedido.validated_at
      ? new Date(result.pedido.validated_at).toLocaleString("pt-BR")
      : null;

    return (
      <ScrollView
        style={styles.resultScroll}
        contentContainerStyle={styles.resultContent}
      >
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: alreadyValidated
                ? colors.red
                : validated
                  ? colors.emerald
                  : colors.amber,
            },
          ]}
        >
          <Ionicons
            name={
              alreadyValidated
                ? "close-circle"
                : validated
                  ? "checkmark-circle"
                  : "alert-circle"
            }
            size={28}
            color={colors.white}
          />
          <Text style={styles.statusBannerText}>
            {alreadyValidated
              ? "INGRESSO JÁ VALIDADO"
              : validated
                ? "INGRESSO VALIDADO"
                : "INGRESSO PENDENTE"}
          </Text>
        </View>

        {message ? <Text style={styles.warnMsg}>⚠️ {message}</Text> : null}

        <View style={styles.infoCard}>
          <InfoLine label="Comprador" value={result.buyerName} />
          <InfoLine label="Data da visita" value={visit} />
          <InfoLine
            label="Ingressos"
            value={`${result.totalTickets} no total`}
          />
          <View style={styles.breakdown}>
            <Chip label={`Inteira ${qty(result.pedido.items, "inteira")}`} />
            <Chip label={`Meia ${qty(result.pedido.items, "meia")}`} />
            <Chip label={`Infantil ${qty(result.pedido.items, "infantil")}`} />
          </View>
          <InfoLine
            label="Valor pago"
            value={formatBRL(Number(result.pedido.total))}
          />
          {validated && validatedAt && (
            <InfoLine
              label="Validado em"
              value={`${validatedAt}${validatorName ? `\npor ${validatorName}` : ""}`}
            />
          )}
        </View>

        {!validated ? (
          <Pressable
            onPress={confirmValidation}
            style={({ pressed }) => [styles.validateBtn, pressed && styles.pressed]}
          >
            <Ionicons name="checkmark-done" size={22} color={colors.white} />
            <Text style={styles.validateBtnText}>VALIDAR ENTRADA</Text>
          </Pressable>
        ) : (
          <View style={alreadyValidated ? styles.alreadyErrorBox : styles.alreadyBox}>
            <Text style={alreadyValidated ? styles.alreadyErrorText : styles.alreadyText}>
              Entrada já liberada — não validar novamente.
            </Text>
          </View>
        )}

        <Pressable
          onPress={reset}
          style={({ pressed }) => [styles.scanNextBtn, pressed && styles.pressed]}
        >
          <Ionicons name="qr-code-outline" size={20} color={colors.sky} />
          <Text style={styles.scanNextText}>Escanear próximo</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── Erro de leitura ──
  if (phase === "error") {
    return (
      <View style={styles.center}>
        <Ionicons name="close-circle" size={48} color={colors.red} />
        <Text style={styles.permTitle}>Não foi possível ler</Text>
        <Text style={styles.permText}>{message}</Text>
        <Pressable
          onPress={reset}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  // ── Câmera ativa (scanning / loading) ──
  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={phase === "scanning" ? handleScan : undefined}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {phase === "loading"
            ? "Lendo ingresso..."
            : "Aponte para o QR Code do ingresso"}
        </Text>
      </View>
      {phase === "loading" && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      )}
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    backgroundColor: colors.bg,
  },
  permTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  permText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: colors.sky,
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  primaryBtnText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  pressed: { opacity: 0.7 },

  // câmera
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  hint: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
    marginTop: 24,
    textAlign: "center",
    paddingHorizontal: 24,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  // resultado
  resultScroll: { flex: 1, backgroundColor: colors.bg },
  resultContent: { padding: 16, paddingBottom: 40 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  statusBannerText: { color: colors.white, fontWeight: "900", fontSize: 17 },
  warnMsg: {
    color: colors.redDark,
    backgroundColor: "#fee2e2",
    fontWeight: "700",
    fontSize: 13,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  infoLine: { gap: 2 },
  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  infoValue: { fontSize: 17, fontWeight: "700", color: colors.text },
  breakdown: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { color: colors.skyDark, fontWeight: "700", fontSize: 13 },
  validateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.emerald,
    borderRadius: 999,
    paddingVertical: 16,
    marginTop: 18,
  },
  validateBtnText: { color: colors.white, fontWeight: "900", fontSize: 16 },
  alreadyBox: {
    backgroundColor: "#dcfce7",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  alreadyErrorBox: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  alreadyText: {
    color: colors.emeraldDark,
    fontWeight: "700",
    textAlign: "center",
  },
  alreadyErrorText: {
    color: colors.redDark,
    fontWeight: "800",
    textAlign: "center",
  },
  scanNextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 10,
  },
  scanNextText: { color: colors.sky, fontWeight: "800", fontSize: 15 },
});

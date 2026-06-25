import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fonts, useTheme, formatBRL } from "@/lib/theme";
import { PremiumShell } from "@/components/PremiumShell";
import type { ItemPedido, Pedido, ScanResult } from "@/lib/types";

type Phase = "scanning" | "loading" | "result" | "error";
type ValidationNotice = "none" | "validated" | "already";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function extractPedidoId(raw: string): string | null {
  const match = raw.trim().match(UUID_RE);
  return match ? match[0] : null;
}

function qty(items: ItemPedido[] | undefined, id: ItemPedido["id"]): number {
  return items?.find((i) => i.id === id)?.quantity ?? 0;
}

export default function Scanner() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [validatorName, setValidatorName] = useState<string | null>(null);
  const [validationNotice, setValidationNotice] = useState<ValidationNotice>("none");
  const [message, setMessage] = useState<string>("");
  const [manualCode, setManualCode] = useState("");

  const reset = useCallback(() => {
    setResult(null);
    setValidatorName(null);
    setValidationNotice("none");
    setMessage("");
    setPhase("scanning");
  }, []);

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
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

      const buyerName = pedido.comprador?.nome?.trim() || "Sem nome cadastrado";

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

      setResult({ pedido, buyerName, totalTickets: pedido.totalQuantity });
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

    const { data: updated, error } = await supabase
      .from("pedidos")
      .update({ validated_at: new Date().toISOString(), validated_by: user.id })
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

  function handleTabChange(tab: string) {
    if (tab !== "validar") {
      router.replace({ pathname: "/(app)/dashboard", params: { tab } });
    }
  }

  function handleManualValidation() {
    if (!manualCode.trim()) return;
    void handleScan({ data: manualCode });
  }

  // ── Permissão não carregada ──
  if (!permission) {
    return (
      <PremiumShell activeTab="validar" onTabChange={handleTabChange as any}>
        <View style={[s.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </PremiumShell>
    );
  }

  // ── Sem permissão ──
  if (!permission.granted) {
    return (
      <PremiumShell activeTab="validar" onTabChange={handleTabChange as any}>
        <View style={[s.center, { backgroundColor: theme.bg }]}>
          <View style={[s.permIcon, { backgroundColor: theme.surface2 }]}>
            <Ionicons name="camera-outline" size={36} color={theme.text3} />
          </View>
          <Text style={[s.permTitle, { color: theme.text }]}>Câmera necessária</Text>
          <Text style={[s.permText, { color: theme.text2 }]}>
            O validador precisa da câmera para ler o QR Code dos ingressos.
          </Text>
          <Pressable
            onPress={requestPermission}
            style={[s.accentBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[s.accentBtnText, { color: theme.onAccent }]}>Permitir câmera</Text>
          </Pressable>
        </View>
      </PremiumShell>
    );
  }

  // ── Resultado ──
  if (phase === "result" && result) {
    const validated = !!result.pedido.validated_at;
    const alreadyValidated = validated && validationNotice === "already";
    const visit = new Date(result.pedido.visitDate + "T12:00:00").toLocaleDateString("pt-BR");
    const validatedAt = result.pedido.validated_at
      ? new Date(result.pedido.validated_at).toLocaleString("pt-BR")
      : null;

    const bannerColor = alreadyValidated ? theme.red : validated ? theme.green : theme.amber;
    const bannerBg = alreadyValidated ? theme.amberBg : validated ? theme.greenBg : theme.amberBg;

    return (
      <PremiumShell activeTab="validar" onTabChange={handleTabChange as any}>
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.bg }}
          contentContainerStyle={s.resultContent}
        >
          {/* Banner de status */}
          <View style={[s.statusBanner, { backgroundColor: bannerBg, borderColor: bannerColor + '40' }]}>
            <Ionicons
              name={alreadyValidated ? "close-circle" : validated ? "checkmark-circle" : "alert-circle"}
              size={26}
              color={bannerColor}
            />
            <Text style={[s.statusBannerText, { color: bannerColor }]}>
              {alreadyValidated ? "INGRESSO JÁ VALIDADO" : validated ? "INGRESSO VALIDADO" : "INGRESSO PENDENTE"}
            </Text>
          </View>

          {message ? (
            <View style={[s.warnBox, { backgroundColor: theme.amberBg, borderColor: theme.amber + '40', borderWidth: 1 }]}>
              <Text style={[s.warnText, { color: theme.amber }]}>{message}</Text>
            </View>
          ) : null}

          {/* Card de informações */}
          <View style={[s.infoCard, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
            <InfoLine label="Comprador" value={result.buyerName} />
            <InfoLine label="Data da visita" value={visit} />
            <InfoLine label="Ingressos" value={`${result.totalTickets} no total`} />
            <View style={s.chips}>
              <Chip label={`Inteira ${qty(result.pedido.items, "inteira")}`} />
              <Chip label={`Meia ${qty(result.pedido.items, "meia")}`} />
              <Chip label={`Infantil ${qty(result.pedido.items, "infantil")}`} />
            </View>
            <InfoLine label="Valor pago" value={formatBRL(Number(result.pedido.total))} />
            {validated && validatedAt && (
              <InfoLine
                label="Validado em"
                value={`${validatedAt}${validatorName ? `\npor ${validatorName}` : ""}`}
              />
            )}
          </View>

          {/* Ação */}
          {!validated ? (
            <Pressable
              onPress={confirmValidation}
              style={({ pressed }) => [
                s.validateBtn,
                { backgroundColor: theme.green, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="checkmark-done" size={22} color="#fff" />
              <Text style={s.validateBtnText}>VALIDAR ENTRADA</Text>
            </Pressable>
          ) : (
            <View style={[s.alreadyBox, { backgroundColor: alreadyValidated ? theme.amberBg : theme.greenBg, borderColor: (alreadyValidated ? theme.amber : theme.green) + '40', borderWidth: 1 }]}>
              <Text style={[s.alreadyText, { color: alreadyValidated ? theme.amber : theme.green }]}>
                Entrada já liberada — não validar novamente.
              </Text>
            </View>
          )}

          <Pressable
            onPress={reset}
            style={({ pressed }) => [s.nextBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="qr-code-outline" size={20} color={theme.accent} />
            <Text style={[s.nextBtnText, { color: theme.accent }]}>Escanear próximo</Text>
          </Pressable>
        </ScrollView>
      </PremiumShell>
    );
  }

  // ── Erro ──
  if (phase === "error") {
    return (
      <PremiumShell activeTab="validar" onTabChange={handleTabChange as any}>
        <View style={[s.center, { backgroundColor: theme.bg }]}>
          <View style={[s.permIcon, { backgroundColor: theme.amberBg }]}>
            <Ionicons name="close-circle" size={36} color={theme.red} />
          </View>
          <Text style={[s.permTitle, { color: theme.text }]}>Não foi possível ler</Text>
          <Text style={[s.permText, { color: theme.text2 }]}>{message}</Text>
          <Pressable
            onPress={reset}
            style={[s.accentBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[s.accentBtnText, { color: theme.onAccent }]}>Tentar de novo</Text>
          </Pressable>
        </View>
      </PremiumShell>
    );
  }

  // ── Câmera ativa ──
  return (
    <PremiumShell activeTab="validar" onTabChange={handleTabChange as any}>
      <View style={s.cameraContent}>
        {/* Título + subtítulo */}
        <Text style={[s.scanTitle, { color: theme.text }]}>Validar ingresso</Text>
        <Text style={[s.scanSubtitle, { color: theme.text2 }]}>
          Aponte a câmera para o QR Code do ingresso
        </Text>

        {/* Visor */}
        <View style={[s.viewfinder, { backgroundColor: theme.surface2 }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={phase === "scanning" ? handleScan : undefined}
          />
          {/* Cantos em L */}
          <View style={[s.cornerTL, { borderColor: theme.accent }]} />
          <View style={[s.cornerTR, { borderColor: theme.accent }]} />
          <View style={[s.cornerBL, { borderColor: theme.accent }]} />
          <View style={[s.cornerBR, { borderColor: theme.accent }]} />
          {/* Linha de varredura */}
          {phase === "scanning" && (
            <View style={[s.scanLine, { backgroundColor: theme.accent }]} />
          )}
          {phase === "loading" && (
            <View style={[s.loadOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <ActivityIndicator color={theme.accent} size="large" />
              <Text style={[s.loadText, { color: theme.text }]}>Lendo ingresso...</Text>
            </View>
          )}
        </View>

        {/* Divisor */}
        <View style={s.divider}>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[s.dividerText, { color: theme.text3 }]}>ou informe o código</Text>
          <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        {/* Input manual usando a mesma leitura do QR Code */}
        <TextInput
          value={manualCode}
          onChangeText={setManualCode}
          placeholder="Código do ingresso"
          placeholderTextColor={theme.text3}
          autoCapitalize="none"
          autoCorrect={false}
          editable={phase === "scanning"}
          returnKeyType="go"
          onSubmitEditing={handleManualValidation}
          style={[
            s.codeInput,
            { borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text },
          ]}
        />

        <Pressable
          disabled={phase !== "scanning" || !manualCode.trim()}
          style={[
            s.validateBtnFull,
            {
              backgroundColor: theme.accent,
              opacity: phase !== "scanning" || !manualCode.trim() ? 0.6 : 1,
            },
          ]}
          onPress={handleManualValidation}
        >
          <Text style={[s.validateBtnFullText, { color: theme.onAccent }]}>Validar código</Text>
        </Pressable>
      </View>
    </PremiumShell>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function InfoLine({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={s.infoLine}>
      <Text style={[s.infoLabel, { color: theme.text2 }]}>{label}</Text>
      <Text style={[s.infoValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={[s.chip, { backgroundColor: theme.accentSoft }]}>
      <Text style={[s.chipText, { color: theme.accent }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  permIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  permTitle: { fontSize: 18, fontFamily: fonts.extrabold },
  permText: { fontSize: 14, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 20 },
  accentBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentBtnText: { fontFamily: fonts.bold, fontSize: 15 },

  // Camera / scanner
  cameraContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 16,
  },
  scanTitle: { fontSize: 16, fontFamily: fonts.extrabold, letterSpacing: -0.1 },
  scanSubtitle: { fontSize: 13, fontFamily: fonts.medium, marginTop: 6, textAlign: 'center', maxWidth: 230, lineHeight: 18 },
  viewfinder: {
    width: 220,
    height: 220,
    borderRadius: 22,
    marginTop: 24,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute', top: 14, left: 14,
    width: 34, height: 34,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    position: 'absolute', top: 14, right: 14,
    width: 34, height: 34,
    borderTopWidth: 3, borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    position: 'absolute', bottom: 14, left: 14,
    width: 34, height: 34,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    position: 'absolute', bottom: 14, right: 14,
    width: 34, height: 34,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    left: 18, right: 18, top: 18,
    height: 2,
    borderRadius: 2,
    opacity: 0.9,
  },
  loadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadText: { fontSize: 13, fontFamily: fonts.semibold },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginTop: 16,
    marginBottom: 14,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 11.5, fontFamily: fonts.medium },
  codeInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  validateBtnFull: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validateBtnFullText: { fontSize: 14, fontFamily: fonts.bold },

  // Result
  resultContent: { padding: 16, paddingBottom: 40, gap: 12 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  statusBannerText: { fontFamily: fonts.extrabold, fontSize: 15 },
  warnBox: { borderRadius: 12, padding: 12 },
  warnText: { fontSize: 13, fontFamily: fonts.semibold },
  infoCard: {
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    gap: 14,
  },
  infoLine: { gap: 2 },
  infoLabel: { fontSize: 11, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 16, fontFamily: fonts.bold },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12.5, fontFamily: fonts.bold },
  validateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    height: 52,
  },
  validateBtnText: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 16 },
  alreadyBox: { borderRadius: 14, padding: 14 },
  alreadyText: { fontFamily: fonts.bold, textAlign: 'center' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  nextBtnText: { fontFamily: fonts.extrabold, fontSize: 15 },
});

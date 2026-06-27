import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Platform,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import jsQR from "jsqr";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fonts, useTheme, formatBRL } from "@/lib/theme";
import { PremiumShell } from "@/components/PremiumShell";
import type { ItemPedido, Pedido, ScanResult } from "@/lib/types";

type Phase = "scanning" | "loading" | "result" | "error";
type ValidationNotice = "none" | "validated" | "already";
type BarcodePayload = { data?: string; nativeEvent?: { data?: string } };
type WebBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string; data?: string }[]>;
};
type WebBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => WebBarcodeDetector;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function extractPedidoId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const match = value.match(UUID_RE);
  return match ? match[0] : null;
}

function qty(items: ItemPedido[] | undefined, id: ItemPedido["id"]): number {
  return items?.find((i) => i.id === id)?.quantity ?? 0;
}

function getBuyerName(pedido: Pedido): string {
  return (
    pedido.comprador?.nome?.trim() ||
    pedido.comprador?.email?.trim() ||
    "Sem nome cadastrado"
  );
}

function getTicketHolderName(pedido: Pedido): string {
  return pedido.destinatario_nome?.trim() || getBuyerName(pedido);
}

export default function Scanner() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [cameraReady, setCameraReady] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [validatorName, setValidatorName] = useState<string | null>(null);
  const [validationNotice, setValidationNotice] = useState<ValidationNotice>("none");
  const [message, setMessage] = useState<string>("");
  const [manualCode, setManualCode] = useState("");
  const scanningRef = useRef(false);
  const phaseRef = useRef<Phase>("scanning");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const reset = useCallback(() => {
    scanningRef.current = false;
    setResult(null);
    setValidatorName(null);
    setValidationNotice("none");
    setMessage("");
    setCameraReady(false);
    setPhase("scanning");
  }, []);

  // ── Ajuste de foco no PWA (Android Chrome) ──
  // No web o CameraView vira um <video> do navegador, cujo foco padrão
  // costuma travar num plano distante e borrar o QR de perto. Aqui pegamos
  // a faixa de vídeo e pedimos autofoco contínuo + resolução mais alta.
  // (No nativo/APK isto não roda — o expo-camera já tem autofoco real.)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!permission?.granted || phase !== "scanning") return;

    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;

    let cancelled = false;
    let tries = 0;

    const tune = () => {
      if (cancelled) return;
      const video = doc.querySelector("video") as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];

      if (!track) {
        if (tries++ < 25) setTimeout(tune, 300);
        return;
      }

      try {
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          focusMode?: string[];
        };
        const advanced: MediaTrackConstraintSet[] = [];
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }
        const constraints: MediaTrackConstraints = {};
        if (caps.width?.max) constraints.width = { ideal: Math.min(1920, caps.width.max) };
        if (caps.height?.max) constraints.height = { ideal: Math.min(1080, caps.height.max) };
        if (advanced.length) constraints.advanced = advanced;
        if (Object.keys(constraints).length) {
          track.applyConstraints(constraints).catch(() => {});
        }
      } catch {
        /* navegador sem suporte a applyConstraints/capabilities — ignora */
      }
    };

    tune();
    return () => {
      cancelled = true;
    };
  }, [permission?.granted, phase]);

  const handleScan = useCallback(
    async (payload: BarcodePayload) => {
      if (phaseRef.current !== "scanning") return;
      if (scanningRef.current) return;
      const data = payload.data ?? payload.nativeEvent?.data ?? "";
      scanningRef.current = true;
      setPhase("loading");

      const pedidoId = extractPedidoId(data);
      if (!pedidoId) {
        setMessage("QR Code inválido — não contém um ingresso reconhecível.");
        setPhase("error");
        scanningRef.current = false;
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
        scanningRef.current = false;
        return;
      }
      if (!pedido) {
        setMessage("Ingresso não encontrado no sistema.");
        setPhase("error");
        scanningRef.current = false;
        return;
      }

      const buyerName = getBuyerName(pedido);
      const ticketHolderName = getTicketHolderName(pedido);
      const ticketHolderCpf = pedido.destinatario_cpf?.trim() || pedido.comprador?.cpf || null;
      const isShared = !!pedido.compartilhado_em && !!pedido.destinatario_nome?.trim();

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

      setResult({ pedido, buyerName, ticketHolderName, ticketHolderCpf, isShared, totalTickets: pedido.totalQuantity });
      setPhase("result");
    },
    []
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!permission?.granted || phase !== "scanning") return;

    const win = globalThis as typeof globalThis & {
      BarcodeDetector?: WebBarcodeDetectorConstructor;
      document?: Document;
    };
    if (!win.document) return;

    const canvas = win.document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const detector = win.BarcodeDetector
      ? new win.BarcodeDetector({ formats: ["qr_code"] })
      : null;

    const getCameraVideo = () => {
      const videos = Array.from(win.document?.querySelectorAll("video") ?? []);
      return (
        videos.find((item) => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0) ??
        videos[0] ??
        null
      );
    };

    const decodeCanvas = (
      video: HTMLVideoElement,
      sourceX: number,
      sourceY: number,
      sourceWidth: number,
      sourceHeight: number
    ) => {
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      const image = context.getImageData(0, 0, sourceWidth, sourceHeight);
      return jsQR(image.data, sourceWidth, sourceHeight, { inversionAttempts: "attemptBoth" })?.data ?? null;
    };

    const readWithCanvas = (video: HTMLVideoElement) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return null;

      const fullFrameResult = decodeCanvas(video, 0, 0, width, height);
      if (fullFrameResult) return fullFrameResult;

      const cropSize = Math.floor(Math.min(width, height) * 0.82);
      const cropX = Math.floor((width - cropSize) / 2);
      const cropY = Math.floor((height - cropSize) / 2);
      return decodeCanvas(video, cropX, cropY, cropSize, cropSize);
    };

    const readWithBarcodeDetector = async (video: HTMLVideoElement) => {
      if (!detector) return null;
      try {
        const codes = await detector.detect(video);
        return codes[0]?.rawValue || codes[0]?.data || null;
      } catch {
        return null;
      }
    };

    const scan = async () => {
      if (stopped || phaseRef.current !== "scanning" || scanningRef.current) return;

      try {
        const video = getCameraVideo();
        if (video?.readyState && video.readyState >= 2) {
          setCameraReady(true);
          const rawValue = (await readWithBarcodeDetector(video)) || readWithCanvas(video);
          if (rawValue) {
            void handleScan({ data: rawValue });
            return;
          }
        }
      } catch {
        // O leitor do Expo continua ativo; este fallback só tenta ajudar no web.
      }

      timeout = setTimeout(scan, 250);
    };

    timeout = setTimeout(scan, 250);
    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [handleScan, permission?.granted, phase]);

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
            <InfoLine label={result.isShared ? "Quem entra" : "Comprador"} value={result.ticketHolderName} />
            {result.ticketHolderCpf ? <InfoLine label="CPF" value={result.ticketHolderCpf} /> : null}
            {result.isShared ? (
              <InfoLine label="Comprador original" value={result.buyerName} />
            ) : null}
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
        <View
          style={[
            s.viewfinder,
            {
              width: Math.min(Math.max(width - 48, 260), 360),
              height: Math.min(Math.max(width - 48, 260), 360),
              backgroundColor: theme.surface2,
            },
          ]}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            active={phase === "scanning"}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              const cameraMessage = event?.message || "verifique a permissÃ£o da cÃ¢mera.";
              setMessage("NÃ£o foi possÃ­vel iniciar a cÃ¢mera: " + cameraMessage);
              setPhase("error");
            }}
            onBarcodeScanned={handleScan}
          />
          {/* Cantos em L */}
          <View style={[s.cornerTL, { borderColor: theme.accent }]} />
          <View style={[s.cornerTR, { borderColor: theme.accent }]} />
          <View style={[s.cornerBL, { borderColor: theme.accent }]} />
          <View style={[s.cornerBR, { borderColor: theme.accent }]} />
          {/* Linha de varredura */}
          {phase === "scanning" && cameraReady && (
            <View style={[s.scanLine, { backgroundColor: theme.accent }]} />
          )}
          {phase === "scanning" && !cameraReady && (
            <View style={[s.loadOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
              <ActivityIndicator color={theme.accent} size="large" />
              <Text style={[s.loadText, { color: theme.text }]}>Iniciando camera...</Text>
            </View>
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

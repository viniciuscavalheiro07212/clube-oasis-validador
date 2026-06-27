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
import type { Pedido, QrCodeAccess, ScanResult } from "@/lib/types";

type Phase = "scanning" | "loading" | "result" | "error";
type ValidationNotice = "none" | "validated" | "already" | "partial";
type BarcodePayload = { data?: string; nativeEvent?: { data?: string } };
type ValidationQty = { adulto: number; meia: number; infantil: number };
type WebBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string; data?: string }[]>;
};
type WebBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => WebBarcodeDetector;
type WebScannerControls = { stop: () => void };
type ZxingResult = { getText: () => string };
type ZxingReader = {
  decodeFromVideoElement: (
    source: HTMLVideoElement,
    callback: (result: ZxingResult | undefined, error: unknown, controls: WebScannerControls) => void
  ) => Promise<WebScannerControls>;
  decodeFromImageElement: (source: HTMLImageElement) => Promise<ZxingResult>;
  decodeFromCanvas: (source: HTMLCanvasElement) => ZxingResult;
};
type ZxingBrowserModule = {
  BrowserQRCodeReader: new (
    hints?: unknown,
    options?: { delayBetweenScanAttempts?: number; delayBetweenScanSuccess?: number; tryPlayVideoTimeout?: number }
  ) => ZxingReader;
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function extractQrToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const match = value.match(UUID_RE);
  return match ? match[0] : value;
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

function getQrHolderName(qrCode: QrCodeAccess, pedido: Pedido): string {
  return qrCode.nome_vinculado?.trim() || getTicketHolderName(pedido);
}

function getQrHolderCpf(qrCode: QrCodeAccess, pedido: Pedido): string | null {
  return qrCode.cpf_vinculado?.trim() || pedido.destinatario_cpf?.trim() || pedido.comprador?.cpf || null;
}

function getAvailableTotal(qrCode: QrCodeAccess): number {
  return qrCode.adulto_disponivel + qrCode.meia_disponivel + qrCode.infantil_disponivel;
}

function getValidatedTotal(qrCode: QrCodeAccess): number {
  return qrCode.adulto_validado + qrCode.meia_validado + qrCode.infantil_validado;
}

function getQrTotal(qrCode: QrCodeAccess): number {
  return qrCode.adulto_total + qrCode.meia_total + qrCode.infantil_total;
}

function defaultValidationQty(qrCode: QrCodeAccess): ValidationQty {
  return {
    adulto: qrCode.adulto_disponivel,
    meia: qrCode.meia_disponivel,
    infantil: qrCode.infantil_disponivel,
  };
}

function selectedTotal(qty: ValidationQty): number {
  return qty.adulto + qty.meia + qty.infantil;
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
  const [validationQty, setValidationQty] = useState<ValidationQty>({ adulto: 0, meia: 0, infantil: 0 });
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
    setValidationQty({ adulto: 0, meia: 0, infantil: 0 });
    setValidatorName(null);
    setValidationNotice("none");
    setMessage("");
    setCameraReady(false);
    setPhase("scanning");
  }, []);

  const handleScan = useCallback(
    async (payload: BarcodePayload) => {
      if (phaseRef.current !== "scanning") return;
      if (scanningRef.current) return;
      const data = payload.data ?? payload.nativeEvent?.data ?? "";
      scanningRef.current = true;
      setPhase("loading");

      const qrToken = extractQrToken(data);
      if (!qrToken) {
        setMessage("QR Code inválido — não contém um ingresso reconhecível.");
        setPhase("error");
        scanningRef.current = false;
        return;
      }

      const { data: qrCode, error: qrError } = await supabase
        .rpc("buscar_qr_code", { p_qr_code_token: qrToken })
        .maybeSingle<QrCodeAccess>();

      if (qrError) {
        setMessage("Erro ao consultar o QR Code: " + qrError.message);
        setPhase("error");
        scanningRef.current = false;
        return;
      }
      if (!qrCode) {
        setMessage("QR Code não encontrado no sistema.");
        setPhase("error");
        scanningRef.current = false;
        return;
      }

      const { data: pedido, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", qrCode.purchase_id)
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
      const ticketHolderName = getQrHolderName(qrCode, pedido);
      const ticketHolderCpf = getQrHolderCpf(qrCode, pedido);
      const isShared = qrCode.tipo === "filho" || !!qrCode.destinatario_nome?.trim();
      const available = getAvailableTotal(qrCode);
      const validated = getValidatedTotal(qrCode);

      if (available <= 0 && validated > 0) {
        setValidationNotice("already");
        setMessage("Todos os créditos deste QR Code já foram utilizados.");
      } else if (validated > 0) {
        setValidationNotice("partial");
        setMessage("Este QR Code já teve créditos utilizados. Confira o saldo restante.");
      } else {
        setValidationNotice("none");
        setMessage("");
      }

      setValidationQty(defaultValidationQty(qrCode));
      setResult({ pedido, qrCode, buyerName, ticketHolderName, ticketHolderCpf, isShared, totalTickets: getQrTotal(qrCode) });
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
    let zxingControls: WebScannerControls | null = null;
    let zxingStarting = false;
    const detector = win.BarcodeDetector
      ? new win.BarcodeDetector({ formats: ["qr_code"] })
      : null;

    const getCameraVideo = () => {
      const videos = Array.from(win.document?.querySelectorAll("video") ?? []);
      const readyVideos = videos.filter((item) => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0);
      readyVideos.sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
      return readyVideos[0] ?? videos[0] ?? null;
    };

    const startZxing = async (video: HTMLVideoElement) => {
      if (zxingControls || zxingStarting) return;
      zxingStarting = true;

      try {
        const { BrowserQRCodeReader } = (await import("@zxing/browser")) as unknown as ZxingBrowserModule;
        if (stopped) return;

        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 500,
          tryPlayVideoTimeout: 3000,
        });
        zxingControls = await reader.decodeFromVideoElement(video, (zxingResult) => {
          const rawValue = zxingResult?.getText?.();
          if (!rawValue || phaseRef.current !== "scanning" || scanningRef.current) return;
          void handleScan({ data: rawValue });
        });
      } catch {
        // Alguns PWAs bloqueiam o loop do ZXing; o jsQR abaixo continua como fallback.
      } finally {
        zxingStarting = false;
      }
    };

    const decodeCanvas = (
      video: HTMLVideoElement,
      sourceX: number,
      sourceY: number,
      sourceWidth: number,
      sourceHeight: number
    ) => {
      const maxSide = 920;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.imageSmoothingEnabled = false;
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
      const image = context.getImageData(0, 0, targetWidth, targetHeight);
      return jsQR(image.data, targetWidth, targetHeight, { inversionAttempts: "attemptBoth" })?.data ?? null;
    };

    const readWithCanvas = (video: HTMLVideoElement) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return null;

      const candidates = [{ x: 0, y: 0, w: width, h: height }];
      const addCenterCrop = (ratio: number) => {
        const size = Math.floor(Math.min(width, height) * ratio);
        candidates.push({
          x: Math.max(0, Math.floor((width - size) / 2)),
          y: Math.max(0, Math.floor((height - size) / 2)),
          w: size,
          h: size,
        });
      };

      addCenterCrop(0.92);
      addCenterCrop(0.78);
      addCenterCrop(0.64);
      addCenterCrop(0.5);

      for (const candidate of candidates) {
        try {
          const rawValue = decodeCanvas(video, candidate.x, candidate.y, candidate.w, candidate.h);
          if (rawValue) return rawValue;
        } catch {
          // Ignora frames instáveis; o próximo ciclo tenta novamente.
        }
      }

      return null;
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
          void startZxing(video);
          const rawValue = (await readWithBarcodeDetector(video)) || readWithCanvas(video);
          if (rawValue) {
            void handleScan({ data: rawValue });
            return;
          }
        }
      } catch {
        // O leitor do Expo continua ativo; este fallback só tenta ajudar no web.
      }

      timeout = setTimeout(scan, 140);
    };

    timeout = setTimeout(scan, 120);
    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
      zxingControls?.stop();
    };
  }, [handleScan, permission?.granted, phase]);

  async function confirmValidation() {
    if (!result || !user) return;
    const selected = selectedTotal(validationQty);
    if (selected < 1) {
      setMessage("Selecione pelo menos 1 crédito para validar.");
      return;
    }

    setPhase("loading");

    const { data: updated, error } = await supabase
      .rpc("validar_qr_code", {
        p_qr_code_id: result.qrCode.id,
        p_adulto_qtd: validationQty.adulto,
        p_meia_qtd: validationQty.meia,
        p_infantil_qtd: validationQty.infantil,
      })
      .maybeSingle<QrCodeAccess>();

    if (error) {
      setMessage("Erro ao validar: " + error.message);
      setPhase("result");
      return;
    }

    if (!updated) {
      await refreshQrCode();
      setValidationNotice("already");
      setMessage("Não foi possível confirmar a validação. Confira o saldo restante.");
      setPhase("result");
      return;
    }

    const fresh = await fetchQrCode(result.qrCode.qr_code_token);
    const nextQrCode = fresh ?? { ...result.qrCode, ...(updated as Partial<QrCodeAccess>) };
    setValidatorName(user.user_metadata?.full_name ?? user.email ?? null);
    setResult((r) => (r ? { ...r, qrCode: nextQrCode, totalTickets: getQrTotal(nextQrCode) } : r));
    setValidationQty(defaultValidationQty(nextQrCode));
    setValidationNotice("validated");
    setMessage(`${selected} crédito(s) validado(s) com sucesso.`);
    setPhase("result");
  }

  async function refreshQrCode() {
    if (!result) return;
    const fresh = await fetchQrCode(result.qrCode.qr_code_token);
    if (!fresh) return;
    setResult((r) => (r ? { ...r, qrCode: fresh, totalTickets: getQrTotal(fresh) } : r));
    setValidationQty(defaultValidationQty(fresh));
  }

  async function fetchQrCode(token: string): Promise<QrCodeAccess | null> {
    const { data } = await supabase
      .rpc("buscar_qr_code", { p_qr_code_token: token })
      .maybeSingle<QrCodeAccess>();
    return data ?? null;
  }

  async function handlePhotoScan() {
    if (Platform.OS !== "web" || phase !== "scanning") return;

    const doc = (globalThis as typeof globalThis & { document?: Document }).document;
    if (!doc) return;

    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      setMessage("Lendo foto do QR Code...");
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = async () => {
        try {
          const rawValue = (await readQrFromImageWithZxing(image, doc)) || (await readQrFromImage(image, doc));
          if (rawValue) {
            void handleScan({ data: rawValue });
            return;
          }

          setMessage("Não consegui ler o QR Code da foto. Tente aproximar e manter o código bem iluminado.");
          setPhase("error");
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setMessage("Não foi possível abrir a imagem do QR Code.");
        setPhase("error");
      };
      image.src = objectUrl;
    };
    input.click();
  }

  async function readQrFromImageWithZxing(image: HTMLImageElement, doc: Document): Promise<string | null> {
    try {
      const { BrowserQRCodeReader } = (await import("@zxing/browser")) as unknown as ZxingBrowserModule;
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 250,
        tryPlayVideoTimeout: 1000,
      });

      const directResult = await reader.decodeFromImageElement(image);
      const directText = directResult?.getText?.();
      if (directText) return directText;
    } catch {
      // Tenta via canvas abaixo.
    }

    try {
      const { BrowserQRCodeReader } = (await import("@zxing/browser")) as unknown as ZxingBrowserModule;
      const reader = new BrowserQRCodeReader();
      const canvas = doc.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context || !image.naturalWidth || !image.naturalHeight) return null;

      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const canvasResult = reader.decodeFromCanvas(canvas);
      return canvasResult?.getText?.() ?? null;
    } catch {
      return null;
    }
  }

  async function readQrFromImage(image: HTMLImageElement, doc: Document): Promise<string | null> {
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!context || !width || !height) return null;

    const candidates = [{ x: 0, y: 0, w: width, h: height }];
    for (const ratio of [0.96, 0.88, 0.78, 0.66, 0.54, 0.42]) {
      const size = Math.floor(Math.min(width, height) * ratio);
      candidates.push({
        x: Math.max(0, Math.floor((width - size) / 2)),
        y: Math.max(0, Math.floor((height - size) / 2)),
        w: size,
        h: size,
      });
    }

    for (const candidate of candidates) {
      for (const maxSide of [1800, 1200, 800]) {
        const scale = Math.min(1, maxSide / Math.max(candidate.w, candidate.h));
        const targetWidth = Math.max(1, Math.round(candidate.w * scale));
        const targetHeight = Math.max(1, Math.round(candidate.h * scale));

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, candidate.x, candidate.y, candidate.w, candidate.h, 0, 0, targetWidth, targetHeight);
        const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
        const rawValue = jsQR(imageData.data, targetWidth, targetHeight, { inversionAttempts: "attemptBoth" })?.data;
        if (rawValue) return rawValue;
      }
    }

    return null;
  }

  function handleTabChange(tab: string) {
    if (tab === "validar") {
      reset();
      return;
    }

    router.replace({ pathname: "/(app)/dashboard", params: { tab } });
  }

  function handleManualValidation() {
    if (!manualCode.trim()) return;
    void handleScan({ data: manualCode });
  }

  function updateValidationQty(type: keyof ValidationQty, next: number) {
    if (!result) return;
    const maxByType = {
      adulto: result.qrCode.adulto_disponivel,
      meia: result.qrCode.meia_disponivel,
      infantil: result.qrCode.infantil_disponivel,
    };
    const value = Math.max(0, Math.min(maxByType[type], next));
    setValidationQty((current) => ({ ...current, [type]: value }));
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
    const availableTotal = getAvailableTotal(result.qrCode);
    const validatedTotal = getValidatedTotal(result.qrCode);
    const selected = selectedTotal(validationQty);
    const canValidate = result.qrCode.status === "ativo" && availableTotal > 0;
    const soldOut = availableTotal <= 0;
    const visit = new Date(result.qrCode.visit_date + "T12:00:00").toLocaleDateString("pt-BR");

    const bannerColor =
      result.qrCode.status !== "ativo" || soldOut
        ? theme.red
        : validationNotice === "validated" || validatedTotal > 0
          ? theme.green
          : theme.amber;
    const bannerBg =
      result.qrCode.status !== "ativo" || soldOut
        ? theme.redBg
        : validationNotice === "validated" || validatedTotal > 0
          ? theme.greenBg
          : theme.amberBg;
    const bannerLabel =
      result.qrCode.status === "cancelado"
        ? "QR CODE CANCELADO"
        : result.qrCode.status === "expirado"
          ? "QR CODE EXPIRADO"
          : soldOut
            ? "CRÉDITOS ESGOTADOS"
            : validatedTotal > 0
              ? "VALIDAÇÃO PARCIAL"
              : "CRÉDITOS DISPONÍVEIS";

    return (
      <PremiumShell activeTab="validar" onTabChange={handleTabChange as any}>
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.bg }}
          contentContainerStyle={s.resultContent}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          {/* Banner de status */}
          <View style={[s.statusBanner, { backgroundColor: bannerBg, borderColor: bannerColor + '40' }]}>
            <Ionicons
              name={canValidate ? "ticket-outline" : "close-circle"}
              size={26}
              color={bannerColor}
            />
            <Text style={[s.statusBannerText, { color: bannerColor }]}>{bannerLabel}</Text>
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
            <InfoLine label="Créditos do QR" value={`${availableTotal} disponíveis de ${result.totalTickets}`} />
            <View style={s.chips}>
              <Chip label={`Adulto ${result.qrCode.adulto_disponivel}/${result.qrCode.adulto_total}`} />
              <Chip label={`Meia ${result.qrCode.meia_disponivel}/${result.qrCode.meia_total}`} />
              <Chip label={`Infantil ${result.qrCode.infantil_disponivel}/${result.qrCode.infantil_total}`} />
            </View>
            {validatedTotal > 0 ? <InfoLine label="Já utilizados" value={`${validatedTotal} crédito(s)`} /> : null}
            <InfoLine label="Valor pago" value={formatBRL(Number(result.pedido.total))} />
            {validatorName ? <InfoLine label="Última validação" value={`por ${validatorName}`} /> : null}
          </View>

          {canValidate ? (
            <View style={[s.infoCard, { backgroundColor: theme.surface, borderColor: theme.border, ...theme.shadowStyle }]}>
              <Text style={[s.cardTitle, { color: theme.text }]}>Créditos a validar agora</Text>
              <QuantityControl
                label="Adulto"
                value={validationQty.adulto}
                max={result.qrCode.adulto_disponivel}
                onChange={(next) => updateValidationQty("adulto", next)}
              />
              <QuantityControl
                label="Meia"
                value={validationQty.meia}
                max={result.qrCode.meia_disponivel}
                onChange={(next) => updateValidationQty("meia", next)}
              />
              <QuantityControl
                label="Infantil"
                value={validationQty.infantil}
                max={result.qrCode.infantil_disponivel}
                onChange={(next) => updateValidationQty("infantil", next)}
              />
              <Text style={[s.selectionHint, { color: theme.text2 }]}>
                Restará {availableTotal - selected} crédito(s) neste QR após a validação.
              </Text>
            </View>
          ) : null}

          {canValidate ? (
            <Pressable
              onPress={confirmValidation}
              disabled={selected < 1}
              style={({ pressed }) => [
                s.validateBtn,
                { backgroundColor: theme.green, opacity: selected < 1 ? 0.55 : pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="checkmark-done" size={22} color="#fff" />
              <Text style={s.validateBtnText}>VALIDAR {selected} ENTRADA(S)</Text>
            </Pressable>
          ) : (
            <View style={[s.alreadyBox, { backgroundColor: theme.redBg, borderColor: theme.red + '40', borderWidth: 1 }]}>
              <Text style={[s.alreadyText, { color: theme.red }]}>
                Este QR não possui créditos disponíveis para validar.
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
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={s.cameraContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
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

        {Platform.OS === "web" ? (
          <Pressable
            disabled={phase !== "scanning"}
            onPress={handlePhotoScan}
            style={[
              s.photoScanBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: phase !== "scanning" ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="image-outline" size={18} color={theme.accent} />
            <Text style={[s.photoScanText, { color: theme.accent }]}>Ler foto do QR</Text>
          </Pressable>
        ) : null}

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
      </ScrollView>
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

function QuantityControl({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { theme } = useTheme();
  const disabled = max <= 0;

  return (
    <View style={[s.qtyRow, { borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}>
      <View style={s.qtyInfo}>
        <Text style={[s.qtyLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[s.qtySub, { color: theme.text2 }]}>Disponível: {max}</Text>
      </View>
      <View style={s.qtyStepper}>
        <Pressable
          disabled={disabled || value <= 0}
          onPress={() => onChange(value - 1)}
          style={[s.qtyBtn, { backgroundColor: theme.surface2 }]}
        >
          <Ionicons name="remove" size={18} color={theme.text} />
        </Pressable>
        <Text style={[s.qtyValue, { color: theme.text }]}>{value}</Text>
        <Pressable
          disabled={disabled || value >= max}
          onPress={() => onChange(value + 1)}
          style={[s.qtyBtn, { backgroundColor: theme.surface2 }]}
        >
          <Ionicons name="add" size={18} color={theme.text} />
        </Pressable>
      </View>
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
    flexGrow: 1,
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
  photoScanBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoScanText: { fontSize: 13, fontFamily: fonts.bold },

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
  cardTitle: { fontSize: 14, fontFamily: fonts.bold, marginBottom: 2 },
  qtyRow: {
    minHeight: 54,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  qtyInfo: { flex: 1, minWidth: 0 },
  qtyLabel: { fontSize: 14, fontFamily: fonts.bold },
  qtySub: { fontSize: 11.5, marginTop: 2 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { minWidth: 24, textAlign: 'center', fontSize: 17, fontFamily: fonts.extrabold },
  selectionHint: { fontSize: 12, fontFamily: fonts.semibold, lineHeight: 18 },
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

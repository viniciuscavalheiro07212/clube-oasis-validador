import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

export default function LoginScreen() {
  const { signIn, signOut, session, isAdmin, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logado, mas NÃO é admin: bloqueia e oferece sair.
  const loggedButNotAdmin = !authLoading && !!session && !isAdmin;

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(traduzErro(error));
    }
    // Sucesso: o RootNavigator redireciona automaticamente para o painel.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          {/* Marca */}
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="water" size={36} color={colors.white} />
            </View>
            <Text style={styles.brand}>Clube Oásis</Text>
            <Text style={styles.subtitle}>Validador de Ingressos · Portaria</Text>
          </View>

          {loggedButNotAdmin ? (
            <View style={styles.card}>
              <Ionicons
                name="lock-closed"
                size={32}
                color={colors.red}
                style={{ alignSelf: "center", marginBottom: 8 }}
              />
              <Text style={styles.deniedTitle}>Acesso restrito</Text>
              <Text style={styles.deniedText}>
                Esta conta não tem permissão de administrador. Entre com uma
                conta autorizada para usar o validador.
              </Text>
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryBtnText}>Trocar de conta</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                style={styles.input}
                editable={!submitting}
              />

              <Text style={[styles.label, { marginTop: 14 }]}>Senha</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
                editable={!submitting}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
              />

              {error && <Text style={styles.error}>⚠️ {error}</Text>}

              <Pressable
                onPress={handleLogin}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (pressed || submitting) && styles.pressed,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Entrar</Text>
                )}
              </Pressable>
            </View>
          )}

          <Text style={styles.footer}>
            Acesso exclusivo para administradores do clube.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Mensagens do Supabase em pt-BR para os erros mais comuns. */
function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (m.includes("network")) return "Sem conexão. Verifique a internet.";
  return msg;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sky },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    backgroundColor: colors.sky,
  },
  logoWrap: { alignItems: "center", marginBottom: 28 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  brand: { fontSize: 26, fontWeight: "900", color: colors.white },
  subtitle: { fontSize: 13, color: "#e0f2fe", marginTop: 2, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: "#f8fafc",
  },
  error: { color: colors.red, fontSize: 13, marginTop: 12, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: colors.amber,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  primaryBtnText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 18,
  },
  secondaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 15 },
  deniedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  deniedText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  pressed: { opacity: 0.7 },
  footer: {
    textAlign: "center",
    color: "#e0f2fe",
    fontSize: 12,
    marginTop: 24,
  },
});

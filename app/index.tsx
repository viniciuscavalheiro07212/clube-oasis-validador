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
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { fonts, useTheme } from "@/lib/theme";

const logo = require("../assets/oasis-logo.png");

export default function LoginScreen() {
  const { signIn, signInWithGoogle, signOut, session, isAdmin, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (error) setError(traduzErro(error));
  }

  async function handleGoogle() {
    setError(null);
    setGoogleSubmitting(true);
    const { error } = await signInWithGoogle();
    // Sucesso redireciona pro Google; só voltamos aqui se houve erro.
    if (error) {
      setGoogleSubmitting(false);
      setError(traduzErro(error));
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          style={{ backgroundColor: theme.bg }}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandBlock}>
            <View
              style={[
                styles.logoFrame,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  ...theme.shadowStyle,
                },
              ]}
            >
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={[styles.kicker, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="shield-checkmark-outline" size={14} color={theme.accent} />
              <Text style={[styles.kickerText, { color: theme.accent }]}>Acesso administrativo</Text>
            </View>

            <Text style={[styles.title, { color: theme.text }]}>Clube Oasis</Text>
            <Text style={[styles.subtitle, { color: theme.text2 }]}>
              Validador premium de ingressos para portaria.
            </Text>
          </View>

          {loggedButNotAdmin ? (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  ...theme.shadowStyle,
                },
              ]}
            >
              <View style={[styles.deniedIcon, { backgroundColor: theme.redBg }]}>
                <Ionicons name="lock-closed-outline" size={26} color={theme.red} />
              </View>
              <Text style={[styles.deniedTitle, { color: theme.text }]}>Acesso restrito</Text>
              <Text style={[styles.deniedText, { color: theme.text2 }]}>
                Esta conta não tem permissão de administrador. Entre com uma conta autorizada
                para usar o validador.
              </Text>
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: theme.border, backgroundColor: theme.surface2 },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.text2} />
                <Text style={[styles.secondaryBtnText, { color: theme.text2 }]}>Trocar de conta</Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  ...theme.shadowStyle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.text }]}>Entrar no painel</Text>
              <Text style={[styles.cardSub, { color: theme.text2 }]}>
                Use sua conta de administrador.
              </Text>

              <Text style={[styles.label, { color: theme.text2 }]}>E-mail</Text>
              <View style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
                <Ionicons name="mail-outline" size={18} color={theme.text3} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu@email.com"
                  placeholderTextColor={theme.text3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  inputMode="email"
                  style={[styles.input, { color: theme.text }]}
                  editable={!submitting}
                />
              </View>

              <Text style={[styles.label, { color: theme.text2, marginTop: 14 }]}>Senha</Text>
              <View style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
                <Ionicons name="key-outline" size={18} color={theme.text3} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.text3}
                  secureTextEntry
                  style={[styles.input, { color: theme.text }]}
                  editable={!submitting}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
              </View>

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: theme.redBg }]}>
                  <Ionicons name="alert-circle-outline" size={17} color={theme.red} />
                  <Text style={[styles.errorText, { color: theme.red }]}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleLogin}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: theme.accent },
                  (pressed || submitting) && styles.pressed,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : (
                  <>
                    <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>Entrar</Text>
                    <Ionicons name="arrow-forward" size={18} color={theme.onAccent} />
                  </>
                )}
              </Pressable>

              {Platform.OS === "web" && (
                <>
                  <View style={styles.divider}>
                    <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                    <Text style={[styles.dividerText, { color: theme.text3 }]}>ou</Text>
                    <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  </View>

                  <Pressable
                    onPress={handleGoogle}
                    disabled={googleSubmitting}
                    style={({ pressed }) => [
                      styles.googleBtn,
                      { borderColor: theme.border, backgroundColor: theme.surface2 },
                      (pressed || googleSubmitting) && styles.pressed,
                    ]}
                  >
                    {googleSubmitting ? (
                      <ActivityIndicator color={theme.text} />
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={18} color={theme.text} />
                        <Text style={[styles.googleBtnText, { color: theme.text }]}>
                          Entrar com Google
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          )}

          <Text style={[styles.footer, { color: theme.text3 }]}>
            Acesso exclusivo para administradores do clube.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (m.includes("network")) return "Sem conexão. Verifique a internet.";
  return msg;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 22,
  },
  logoFrame: {
    width: 148,
    height: 148,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginBottom: 16,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  kicker: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  kickerText: {
    fontFamily: fonts.bold,
    fontSize: 11.5,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 27,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 5,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    marginTop: 4,
    marginBottom: 18,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    marginBottom: 7,
  },
  inputWrap: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    paddingVertical: 12,
  },
  errorBox: {
    borderRadius: 12,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12.5,
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  primaryBtnText: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: fonts.semibold, fontSize: 11.5 },
  googleBtn: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 12,
  },
  googleBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  secondaryBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  secondaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  deniedIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  deniedTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    textAlign: "center",
  },
  deniedText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  pressed: { opacity: 0.72 },
  footer: {
    fontFamily: fonts.medium,
    textAlign: "center",
    fontSize: 11.5,
    marginTop: 18,
  },
});

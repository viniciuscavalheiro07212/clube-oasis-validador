// ============================================================
// CABEÇALHO compartilhado das telas internas (estilo grafite premium).
// Logo dourado com QR + título + toggle de tema (lua/sol) + Sair.
// ============================================================

import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, useTheme, useThemeControls } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

export default function AppHeader() {
  const t = useTheme();
  const { isDark, toggle } = useThemeControls();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 8,
          backgroundColor: t.surface,
          borderBottomColor: t.border,
        },
      ]}
    >
      <View style={[styles.logo, { backgroundColor: t.accent }]}>
        <Ionicons name="qr-code" size={17} color={t.onAccent} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>Menu administrativo</Text>

      <View style={styles.right}>
        <Pressable
          onPress={toggle}
          hitSlop={8}
          style={[styles.toggle, { borderColor: t.border, backgroundColor: t.surface2 }]}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={17} color={t.text2} />
        </Pressable>
        <Pressable onPress={signOut} hitSlop={8} style={styles.logout}>
          <Ionicons name="log-out-outline" size={18} color={t.text2} />
          <Text style={[styles.logoutText, { color: t.text2 }]}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 13,
    borderBottomWidth: 1,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14.5, fontFamily: fonts.bold, letterSpacing: -0.1 },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 },
  toggle: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logout: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4, paddingVertical: 6 },
  logoutText: { fontSize: 12.5, fontFamily: fonts.semibold },
});

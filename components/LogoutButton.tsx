import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

export default function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable
      onPress={signOut}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      hitSlop={8}
    >
      <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
      <Text style={styles.label}>Sair</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
  },
  pressed: { opacity: 0.5 },
  label: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 14 },
});

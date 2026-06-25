// ============================================================
// PRIMITIVOS DE UI — estilo "grafite premium", reagem ao tema.
// Card, barra de progresso, pílula, botão primário e input.
// ============================================================

import { type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, useTheme } from "@/lib/theme";

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: t.radius,
          borderWidth: 1,
          borderColor: t.border,
          padding: 16,
          ...t.cardShadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: t.text, letterSpacing: -0.1 }}>
      {children}
    </Text>
  );
}

/** Barra de progresso (trilho surface-2 + preenchimento colorido). */
export function ProgressBar({
  pct,
  color,
  height = 6,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  const t = useTheme();
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View
      style={{
        height,
        borderRadius: 999,
        backgroundColor: t.surface2,
        overflow: "hidden",
      }}
    >
      <View style={{ height: "100%", width: `${w}%`, backgroundColor: color, borderRadius: 999 }} />
    </View>
  );
}

/** Pílula arredondada (status, contagens, tags). */
export function Pill({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color, fontSize: 11, fontFamily: fonts.bold }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: 12,
          backgroundColor: t.accent,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          paddingHorizontal: 16,
          opacity: disabled || pressed ? 0.65 : 1,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={t.onAccent} />}
      <Text style={{ color: t.onAccent, fontFamily: fonts.bold, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Input com estilo premium e ícone opcional à esquerda. */
export function ThemedInput({
  icon,
  style,
  ...props
}: TextInputProps & { icon?: keyof typeof Ionicons.glyphMap }) {
  const t = useTheme();
  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      {icon && (
        <View style={{ position: "absolute", left: 13, zIndex: 1 }} pointerEvents="none">
          <Ionicons name={icon} size={17} color={t.text3} />
        </View>
      )}
      <TextInput
        placeholderTextColor={t.text3}
        style={[
          {
            minHeight: 46,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.surface2,
            paddingHorizontal: 13,
            paddingLeft: icon ? 38 : 13,
            color: t.text,
            fontFamily: fonts.semibold,
            fontSize: 13,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
});

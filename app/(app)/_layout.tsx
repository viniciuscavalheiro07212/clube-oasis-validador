import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import LogoutButton from "@/components/LogoutButton";
import { colors } from "@/lib/theme";

function HeaderNavButton({ to, icon }: { to: "/(app)/scanner" | "/(app)/dashboard"; icon: keyof typeof Ionicons.glyphMap }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.replace(to)} style={{ paddingHorizontal: 16 }}>
      <Ionicons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}

export default function AppLayout() {
  return (
    <Stack
      initialRouteName="scanner"
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text, fontWeight: "800" },
        headerRight: () => <LogoutButton />,
      }}
    >
      <Stack.Screen
        name="scanner"
        options={{
          title: "Validar ingresso",
          headerLeft: () => <HeaderNavButton to="/(app)/dashboard" icon="menu-outline" />,
        }}
      />
      <Stack.Screen
        name="dashboard"
        options={{
          title: "Menu administrativo",
          headerLeft: () => <HeaderNavButton to="/(app)/scanner" icon="qr-code-outline" />,
        }}
      />
    </Stack>
  );
}

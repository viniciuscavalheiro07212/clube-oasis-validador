import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth";

/**
 * Gate de navegação: decide entre a tela de login (`/`) e a área protegida
 * (`/(app)/...`) com base na sessão + flag de admin.
 *
 *  - Admin logado fora da área protegida  → manda para o painel.
 *  - Sem sessão (ou não-admin) dentro dela → manda para o login.
 */
function RootNavigator() {
  const { session, isAdmin, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inProtectedArea = segments[0] === "(app)";

    if (session && isAdmin && !inProtectedArea) {
      router.replace("/(app)/scanner");
    } else if ((!session || !isAdmin) && inProtectedArea) {
      router.replace("/");
    }
  }, [session, isAdmin, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack
      initialRouteName="scanner"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="scanner" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}

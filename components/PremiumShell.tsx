import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/lib/auth';
import { fonts, useTheme } from '@/lib/theme';

export type AppTab = 'validar' | 'pedidos' | 'faturamento' | 'cupons' | 'limites';

const TAB_ITEMS: { id: AppTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'validar',      label: 'Validar',     icon: 'qr-code-outline'        },
  { id: 'pedidos',      label: 'Pedidos',     icon: 'ticket-outline'         },
  { id: 'faturamento',  label: 'Faturamento', icon: 'bar-chart-outline'      },
  { id: 'cupons',       label: 'Cupons',      icon: 'pricetag-outline'       },
  { id: 'limites',      label: 'Limites',     icon: 'calendar-outline'       },
];

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  children: React.ReactNode;
}

export function PremiumShell({ activeTab, onTabChange, children }: Props) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header (inclui safe-area topo) */}
      <View
        style={[
          s.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: insets.top },
        ]}
      >
        <View style={[s.logoIcon, { backgroundColor: theme.accent }]}>
          <Ionicons name="qr-code-outline" size={17} color={theme.onAccent} />
        </View>
        <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>
          Menu administrativo
        </Text>
        <View style={s.headerRight}>
          <Pressable
            onPress={toggleTheme}
            style={[s.themeBtn, { borderColor: theme.border, backgroundColor: theme.surface2 }]}
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={17}
              color={theme.text2}
            />
          </Pressable>
          <Pressable onPress={signOut} style={s.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color={theme.text2} />
            <Text style={[s.logoutText, { color: theme.text2 }]}>Sair</Text>
          </Pressable>
        </View>
      </View>

      {/* Conteúdo */}
      <View style={s.content}>{children}</View>

      {/* Tab bar (inclui safe-area base) */}
      <View
        style={[
          s.tabBar,
          { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 4) },
        ]}
      >
        {TAB_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <Pressable key={item.id} onPress={() => onTabChange(item.id)} style={s.tabItem}>
              {active && (
                <View style={[s.tabIndicator, { backgroundColor: theme.accent }]} />
              )}
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? theme.accent : theme.text3}
              />
              <Text style={[s.tabLabel, { color: active ? theme.accent : theme.text3 }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 13,
    paddingTop: 4,
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: fonts.bold,
    letterSpacing: -0.1,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  themeBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  logoutText: { fontSize: 12.5, fontFamily: fonts.semibold },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 7,
    gap: 4,
    position: 'relative',
    minHeight: 44,
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: '30%',
    right: '30%',
    height: 3,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  tabLabel: { fontSize: 10, fontFamily: fonts.semibold },
});

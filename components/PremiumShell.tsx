import React from 'react';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/lib/auth';
import { fonts, useTheme } from '@/lib/theme';

export type AppTab = 'validar' | 'pedidos' | 'faturamento' | 'cupons' | 'limites';

const TAB_ITEMS: { id: AppTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'pedidos',      label: 'Pedidos',     icon: 'ticket-outline'         },
  { id: 'faturamento',  label: 'Faturamento', icon: 'bar-chart-outline'      },
  { id: 'validar',      label: 'Validador',   icon: 'qr-code-outline'        },
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
  const webRootStyle =
    Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          height: '100dvh',
          maxHeight: '100dvh',
          maxWidth: 560,
          overflow: 'hidden',
          width: '100%',
        } as const)
      : null;

  return (
    <View style={[s.root, webRootStyle, { backgroundColor: theme.bg }]}>
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
          const featured = item.id === 'validar';
          return (
            <Pressable
              key={item.id}
              onPress={() => onTabChange(item.id)}
              style={[s.tabItem, featured && s.featuredTabItem]}
            >
              {active && !featured && (
                <View style={[s.tabIndicator, { backgroundColor: theme.accent }]} />
              )}
              {featured ? (
                <View
                  style={[
                    s.scannerButton,
                    {
                      backgroundColor: active ? theme.accent : theme.surface2,
                      borderColor: active ? theme.accent : theme.border,
                      ...theme.shadowStyle,
                    },
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={30}
                    color={active ? theme.onAccent : theme.accent}
                  />
                </View>
              ) : (
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={active ? theme.accent : theme.text3}
                />
              )}
              <Text
                numberOfLines={1}
                style={[s.tabLabel, { color: active ? theme.accent : theme.text3 }]}
              >
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
  root: { flex: 1, minHeight: 0, minWidth: 0, width: '100%', overflow: 'hidden' },
  header: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
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
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 5 },
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
  content: { flex: 1, minHeight: 0, overflow: 'hidden' },
  tabBar: {
    flexDirection: 'row',
    flexShrink: 0,
    borderTopWidth: 1,
    paddingTop: 7,
    overflow: 'visible',
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
  featuredTabItem: {
    marginTop: -26,
    paddingTop: 0,
    gap: 5,
    minHeight: 70,
  },
  scannerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
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

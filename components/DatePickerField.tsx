// ============================================================
// CAMPO DE DATA com calendário em modal — estilo grafite premium.
// Extraído do dashboard original; mesma lógica de datas (YYYY-MM-DD).
// ============================================================

import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, useTheme } from "@/lib/theme";
import { formatDate, getTodayISO, parseISODate, toISODate } from "@/lib/adminData";

export function DatePickerField({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = parseISODate(value || getTodayISO());
    return new Date(base.getFullYear(), base.getMonth(), 1, 12);
  });

  const selected = value ? parseISODate(value) : null;
  const monthLabel = visibleMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
  const blanks = firstDay.getDay();
  const totalDays = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: blanks + totalDays }, (_, index) =>
    index < blanks ? null : index - blanks + 1
  );

  function changeMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));
  }

  function pickDay(day: number) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12);
    onChange(toISODate(next));
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          const base = parseISODate(value || getTodayISO());
          setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1, 12));
          setOpen(true);
        }}
        style={[
          styles.field,
          { borderColor: t.border, backgroundColor: t.surface2 },
          style,
        ]}
      >
        <View style={styles.fieldInner}>
          <Ionicons name="calendar-outline" size={17} color={t.text3} />
          <Text
            style={[
              { fontFamily: fonts.semibold, fontSize: 13, flex: 1 },
              { color: value ? t.text : t.text3 },
            ]}
          >
            {value ? formatDate(value) : placeholder}
          </Text>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.header}>
              <Pressable onPress={() => changeMonth(-1)} style={[styles.navBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="chevron-back" size={20} color={t.text} />
              </Pressable>
              <Text style={[styles.title, { color: t.text }]}>{monthLabel}</Text>
              <Pressable onPress={() => changeMonth(1)} style={[styles.navBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="chevron-forward" size={20} color={t.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                <Text key={`${day}-${index}`} style={[styles.weekDay, { color: t.text3 }]}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {days.map((day, index) => {
                if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
                const dayISO = toISODate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, 12));
                const active = selected ? dayISO === toISODate(selected) : false;
                return (
                  <Pressable
                    key={dayISO}
                    onPress={() => pickDay(day)}
                    style={[styles.dayCell, styles.dayBtn, active && { backgroundColor: t.accent }]}
                  >
                    <Text style={{ fontFamily: fonts.bold, color: active ? t.onAccent : t.text }}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable onPress={() => setOpen(false)} style={[styles.actionBtn, { backgroundColor: t.surface2 }]}>
                <Text style={{ color: t.text2, fontFamily: fonts.bold }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onChange(toISODate(parseISODate(getTodayISO())));
                  setOpen(false);
                }}
                style={[styles.actionBtn, { backgroundColor: t.accent }]}
              >
                <Text style={{ color: t.onAccent, fontFamily: fonts.bold }}>Hoje</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    justifyContent: "center",
  },
  fieldInner: { flexDirection: "row", alignItems: "center", gap: 9 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: { width: "100%", maxWidth: 360, borderRadius: 18, padding: 16, borderWidth: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  navBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: fonts.bold, textTransform: "capitalize" },
  weekRow: { flexDirection: "row", marginBottom: 8 },
  weekDay: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontFamily: fonts.bold },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  dayBtn: { borderRadius: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  actionBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
});

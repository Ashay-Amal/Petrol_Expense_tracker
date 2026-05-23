import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";

import { createFillUp, deleteFillUp, listFillUps, migrateDbIfNeeded, updateFillUp } from "./src/data/fillUpRepository";
import {
  calculateStats,
  enrichFillUps,
  formatDisplayDate,
  formatInr,
  formatNumber,
  formatShortDate,
  getTodayIsoDate,
  validateFillUpInput
} from "./src/domain/fuelMath";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "charts", label: "Charts" }
];

export default function App() {
  return (
    <SQLiteProvider databaseName="petrol-expenses.db" onInit={migrateDbIfNeeded}>
      <PetrolTracker />
    </SQLiteProvider>
  );
}

function PetrolTracker() {
  const db = useSQLiteContext();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [fillUps, setFillUps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const enrichedFillUps = useMemo(() => enrichFillUps(fillUps), [fillUps]);
  const stats = useMemo(() => calculateStats(fillUps), [fillUps]);

  async function refreshFillUps() {
    setIsLoading(true);
    setLoadError("");

    try {
      const rows = await listFillUps(db);
      setFillUps(rows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load fill-ups.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshFillUps();
  }, []);

  function openAddForm() {
    setEditingEntry(null);
    setIsFormVisible(true);
  }

  function openEditForm(entry) {
    setEditingEntry(entry);
    setIsFormVisible(true);
  }

  async function saveEntry(input) {
    if (editingEntry) {
      await updateFillUp(db, editingEntry.id, input);
    } else {
      await createFillUp(db, input);
    }

    setIsFormVisible(false);
    setEditingEntry(null);
    await refreshFillUps();
  }

  function requestDelete(entry) {
    Alert.alert("Delete fill-up?", "This removes the transaction from local history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteFillUp(db, entry.id);
          await refreshFillUps();
        }
      }
    ]);
  }

  let content = null;
  if (activeTab === "history") {
    content = (
      <HistoryScreen
        entries={enrichedFillUps}
        isLoading={isLoading}
        loadError={loadError}
        onEdit={openEditForm}
        onDelete={requestDelete}
      />
    );
  } else if (activeTab === "charts") {
    content = <ChartsScreen stats={stats} entries={enrichedFillUps} isLoading={isLoading} loadError={loadError} />;
  } else {
    content = <DashboardScreen stats={stats} entries={enrichedFillUps} isLoading={isLoading} loadError={loadError} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.appShell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerKicker}>Single vehicle</Text>
            <Text style={styles.title}>Petrol Tracker</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.addButton, pressed && styles.pressed]} onPress={openAddForm}>
            <Text style={styles.addButtonText}>+ Fill-up</Text>
          </Pressable>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              style={({ pressed }) => [
                styles.tabButton,
                activeTab === tab.id && styles.tabButtonActive,
                pressed && styles.pressed
              ]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      </View>

      <FillUpForm
        visible={isFormVisible}
        entry={editingEntry}
        entries={fillUps}
        onCancel={() => {
          setIsFormVisible(false);
          setEditingEntry(null);
        }}
        onSave={saveEntry}
      />
    </SafeAreaView>
  );
}

function DashboardScreen({ stats, entries, isLoading, loadError }) {
  if (isLoading) {
    return <LoadingState label="Loading dashboard" />;
  }

  if (loadError) {
    return <MessageState title="Could not load data" message={loadError} />;
  }

  const latestEntry = entries[entries.length - 1];

  return (
    <View style={styles.screenStack}>
      <View style={styles.statsGrid}>
        <StatTile label="Total spend" value={formatInr(stats.totalSpendInr)} accentColor={colors.red} />
        <StatTile label="Total fuel" value={`${formatNumber(stats.totalLiters, 2)} L`} accentColor={colors.green} />
        <StatTile
          label="Average mileage"
          value={stats.averageMileageKmPerLiter === null ? "--" : `${formatNumber(stats.averageMileageKmPerLiter, 2)} km/L`}
          accentColor={colors.blue}
        />
        <StatTile
          label="Latest mileage"
          value={stats.latestMileageKmPerLiter === null ? "--" : `${formatNumber(stats.latestMileageKmPerLiter, 2)} km/L`}
          accentColor={colors.orange}
        />
        <StatTile
          label="Avg price/liter"
          value={stats.averagePricePerLiter === null ? "--" : formatInr(stats.averagePricePerLiter)}
          accentColor={colors.purple}
        />
        <StatTile label="Entries" value={String(stats.entryCount)} accentColor={colors.ink} />
      </View>

      {latestEntry ? (
        <View style={styles.sectionPanel}>
          <Text style={styles.sectionTitle}>Latest Fill-up</Text>
          <View style={styles.detailGrid}>
            <DetailItem label="Date" value={formatDisplayDate(latestEntry.date)} />
            <DetailItem label="Odometer" value={`${formatNumber(latestEntry.odometerKm, 1)} km`} />
            <DetailItem label="Fuel" value={`${formatNumber(latestEntry.liters, 2)} L`} />
            <DetailItem label="Cost" value={formatInr(latestEntry.totalCostInr)} />
            <DetailItem
              label="Distance"
              value={
                latestEntry.distanceSinceLastFill === null ? "Baseline" : `${formatNumber(latestEntry.distanceSinceLastFill, 1)} km`
              }
            />
            <DetailItem
              label="Mileage"
              value={
                latestEntry.mileageKmPerLiter === null ? "Starts next fill-up" : `${formatNumber(latestEntry.mileageKmPerLiter, 2)} km/L`
              }
            />
          </View>
        </View>
      ) : (
        <MessageState
          title="No fill-ups yet"
          message="Add your first fill-up to create the odometer baseline. Mileage appears after the second entry."
        />
      )}
    </View>
  );
}

function HistoryScreen({ entries, isLoading, loadError, onEdit, onDelete }) {
  if (isLoading) {
    return <LoadingState label="Loading history" />;
  }

  if (loadError) {
    return <MessageState title="Could not load data" message={loadError} />;
  }

  if (!entries.length) {
    return (
      <MessageState
        title="No history"
        message="Your manually entered petrol transactions will appear here in latest-first order."
      />
    );
  }

  return (
    <View style={styles.screenStack}>
      {[...entries].reverse().map((entry) => (
        <View key={entry.id} style={styles.historyCard}>
          <View style={styles.historyTopRow}>
            <View>
              <Text style={styles.historyDate}>{formatDisplayDate(entry.date)}</Text>
              <Text style={styles.historyMeta}>{formatNumber(entry.odometerKm, 1)} km odometer</Text>
            </View>
            <Text style={styles.historyCost}>{formatInr(entry.totalCostInr)}</Text>
          </View>

          <View style={styles.historyMetrics}>
            <MetricPill label="Fuel" value={`${formatNumber(entry.liters, 2)} L`} />
            <MetricPill label="Price" value={formatInr(entry.pricePerLiter)} />
            <MetricPill
              label="Mileage"
              value={entry.mileageKmPerLiter === null ? "Baseline" : `${formatNumber(entry.mileageKmPerLiter, 2)} km/L`}
            />
          </View>

          {entry.notes ? <Text style={styles.notes}>{entry.notes}</Text> : null}

          <View style={styles.cardActions}>
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => onEdit(entry)}>
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]} onPress={() => onDelete(entry)}>
              <Text style={styles.dangerButtonText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function ChartsScreen({ stats, entries, isLoading, loadError }) {
  if (isLoading) {
    return <LoadingState label="Loading charts" />;
  }

  if (loadError) {
    return <MessageState title="Could not load data" message={loadError} />;
  }

  return (
    <View style={styles.screenStack}>
      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Mileage Trend</Text>
        <MileageTrendChart entries={entries} />
      </View>

      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Monthly Fuel Expense</Text>
        <MonthlyExpenseChart trend={stats.monthlyExpenseTrend} />
      </View>
    </View>
  );
}

function MileageTrendChart({ entries }) {
  const rows = entries.filter((entry) => entry.mileageKmPerLiter !== null);

  if (!rows.length) {
    return <SmallEmptyState message="Add at least two fill-ups to see mileage trends." />;
  }

  const maxMileage = Math.max(...rows.map((entry) => entry.mileageKmPerLiter));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.verticalChart}>
      {rows.map((entry) => {
        const heightPercent = Math.max(8, (entry.mileageKmPerLiter / maxMileage) * 100);

        return (
          <View key={entry.id} style={styles.barColumn}>
            <Text style={styles.barValue}>{formatNumber(entry.mileageKmPerLiter, 1)}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.verticalBar, { height: `${heightPercent}%` }]} />
            </View>
            <Text style={styles.barLabel}>{formatShortDate(entry.date)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function MonthlyExpenseChart({ trend }) {
  if (!trend.length) {
    return <SmallEmptyState message="Monthly expense totals will appear after your first fill-up." />;
  }

  const maxCost = Math.max(...trend.map((item) => item.totalCostInr));

  return (
    <View style={styles.horizontalChart}>
      {trend.map((item) => {
        const widthPercent = Math.max(6, (item.totalCostInr / maxCost) * 100);

        return (
          <View key={item.month} style={styles.expenseRow}>
            <Text style={styles.expenseLabel}>{item.label}</Text>
            <View style={styles.expenseTrack}>
              <View style={[styles.expenseBar, { width: `${widthPercent}%` }]} />
            </View>
            <Text style={styles.expenseValue}>{formatInr(item.totalCostInr)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function FillUpForm({ visible, entry, entries, onCancel, onSave }) {
  const [date, setDate] = useState(getTodayIsoDate());
  const [odometerKm, setOdometerKm] = useState("");
  const [liters, setLiters] = useState("");
  const [totalCostInr, setTotalCostInr] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setDate(entry.date);
      setOdometerKm(String(entry.odometerKm));
      setLiters(String(entry.liters));
      setTotalCostInr(String(entry.totalCostInr));
      setNotes(entry.notes ?? "");
    } else {
      setDate(getTodayIsoDate());
      setOdometerKm("");
      setLiters("");
      setTotalCostInr("");
      setNotes("");
    }
    setErrors({});
  }, [entry, visible]);

  async function submit() {
    const validation = validateFillUpInput(
      entries,
      {
        date,
        odometerKm,
        liters,
        totalCostInr,
        notes
      },
      entry?.id
    );

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(validation.input);
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "Could not save this fill-up."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.modalSafeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.headerKicker}>{entry ? "Edit transaction" : "New transaction"}</Text>
              <Text style={styles.modalTitle}>{entry ? "Edit Fill-up" : "Add Fill-up"}</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={onCancel}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

            <Field
              label="Date"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              error={errors.date}
              autoCapitalize="none"
            />
            <Field
              label="Odometer km"
              value={odometerKm}
              onChangeText={setOdometerKm}
              placeholder="Example: 12500"
              keyboardType="decimal-pad"
              error={errors.odometerKm}
            />
            <Field
              label="Liters"
              value={liters}
              onChangeText={setLiters}
              placeholder="Example: 32.5"
              keyboardType="decimal-pad"
              error={errors.liters}
            />
            <Field
              label="Total cost INR"
              value={totalCostInr}
              onChangeText={setTotalCostInr}
              placeholder="Example: 3350"
              keyboardType="decimal-pad"
              error={errors.totalCostInr}
            />
            <Field
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              multiline
              inputStyle={styles.notesInput}
            />

            <Pressable
              style={({ pressed }) => [styles.saveButton, (pressed || isSaving) && styles.pressed]}
              onPress={submit}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save Fill-up"}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, error, inputStyle, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[styles.input, error && styles.inputError, inputStyle]}
        placeholderTextColor={colors.muted}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function StatTile({ label, value, accentColor }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statAccent, { backgroundColor: accentColor }]} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={2} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function DetailItem({ label, value }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function MetricPill({ label, value }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function LoadingState({ label }) {
  return (
    <View style={styles.statePanel}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles.stateTitle}>{label}</Text>
    </View>
  );
}

function MessageState({ title, message }) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

function SmallEmptyState({ message }) {
  return <Text style={styles.smallEmptyText}>{message}</Text>;
}

const colors = {
  background: "#F6F7FB",
  surface: "#FFFFFF",
  ink: "#18202F",
  muted: "#697386",
  line: "#D9DEE8",
  green: "#138A72",
  greenDark: "#0D5E50",
  red: "#C2413A",
  blue: "#2563EB",
  orange: "#D97706",
  purple: "#7C3AED"
};

const shadows = Platform.select({
  ios: {
    shadowColor: "#1F2937",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  android: {
    elevation: 2
  },
  default: {}
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  headerKicker: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 2
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.green,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  addButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.72
  },
  tabBar: {
    backgroundColor: "#E9EDF4",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    marginTop: 18,
    padding: 4
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 40,
    justifyContent: "center"
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadows
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  tabTextActive: {
    color: colors.ink
  },
  content: {
    paddingBottom: 28,
    paddingTop: 18
  },
  screenStack: {
    gap: 14
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statTile: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 116,
    padding: 14,
    width: "48%",
    ...shadows
  },
  statAccent: {
    borderRadius: 4,
    height: 4,
    marginBottom: 14,
    width: 34
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  statValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 8
  },
  sectionPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    ...shadows
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  detailItem: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    width: "48%"
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  detailValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4
  },
  statePanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 24
  },
  stateTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center"
  },
  stateMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    ...shadows
  },
  historyTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  historyDate: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  historyMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3
  },
  historyCost: {
    color: colors.greenDark,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right"
  },
  historyMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  metricPill: {
    backgroundColor: "#EDF7F4",
    borderColor: "#CFE8E1",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  metricLabel: {
    color: colors.greenDark,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2
  },
  notes: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  dangerButton: {
    alignItems: "center",
    borderColor: "#F2C5C1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14
  },
  dangerButtonText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: "800"
  },
  verticalChart: {
    alignItems: "flex-end",
    gap: 12,
    minHeight: 220,
    paddingRight: 4,
    paddingTop: 8
  },
  barColumn: {
    alignItems: "center",
    gap: 8,
    width: 54
  },
  barValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800"
  },
  barTrack: {
    alignItems: "center",
    backgroundColor: "#E7ECF3",
    borderRadius: 8,
    height: 150,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: 28
  },
  verticalBar: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    width: "100%"
  },
  barLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },
  horizontalChart: {
    gap: 14
  },
  expenseRow: {
    gap: 8
  },
  expenseLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  expenseTrack: {
    backgroundColor: "#E7ECF3",
    borderRadius: 8,
    height: 16,
    overflow: "hidden"
  },
  expenseBar: {
    backgroundColor: colors.orange,
    borderRadius: 8,
    height: "100%"
  },
  expenseValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  smallEmptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  modalKeyboard: {
    flex: 1
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 2
  },
  formContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 32
  },
  formError: {
    backgroundColor: "#FDEDEC",
    borderColor: "#F5C6C2",
    borderRadius: 8,
    borderWidth: 1,
    color: colors.red,
    fontSize: 14,
    fontWeight: "700",
    padding: 12
  },
  field: {
    gap: 7
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inputError: {
    borderColor: colors.red
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: "top"
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.green,
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 4,
    minHeight: 52
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "900"
  }
});

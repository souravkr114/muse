import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../src/context/auth";
import { colors, fonts, spacing, radius, type } from "../src/theme";

interface Quote {
  id: string;
  quote: string;
  attribution: string;
  mood: string;
  source_type: string;
  input_preview: string;
  is_favorite: boolean;
  created_at: string;
}

export default function HistoryScreen() {
  const { apiFetch } = useAuth();
  const router = useRouter();

  const [quotes, setQuotes] = useState<Quote[]>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the user's quotes history
  const fetchHistory = async (favOnly = favoritesOnly) => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/quotes?favorites_only=${favOnly ? "true" : "false"}`);
      const data = await res.json();
      if (res.ok) {
        setQuotes(data);
      } else {
        Alert.alert("Error", data.detail || "Failed to load history.");
      }
    } catch (err) {
      console.error("Fetch history error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [favoritesOnly]);

  const toggleFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFavoritesOnly(!favoritesOnly);
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete Entry", "Are you sure you want to remove this quote from your journal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const res = await apiFetch(`/api/quotes/${id}`, {
              method: "DELETE",
            });
            if (res.ok) {
              setQuotes((prev) => (prev ? prev.filter((q) => q.id !== id) : null));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              const data = await res.json();
              Alert.alert("Error", data.detail || "Failed to delete quote.");
            }
          } catch (err) {
            console.error("Delete quote error:", err);
          }
        },
      },
    ]);
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "voice":
        return "mic";
      case "image":
        return "image";
      default:
        return "edit-3";
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/home")} style={styles.iconButton}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>JOURNAL</Text>
        <TouchableOpacity
          onPress={toggleFilter}
          style={[styles.iconButton, favoritesOnly && styles.iconButtonActive]}
        >
          <Feather
            name="heart"
            size={18}
            color={favoritesOnly ? colors.brand : colors.onSurfaceSecondary}
            fill={favoritesOnly ? colors.brand : "none"}
          />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : quotes === null || quotes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="layers" size={48} color={colors.surfaceTertiary} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Your journal is quiet</Text>
          <Text style={styles.emptySubtitle}>
            {favoritesOnly
              ? "You haven't favorited any quotes yet."
              : "Generate a quote to start filling your timeline."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={quotes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/quote",
                  params: { quoteId: item.id },
                });
              }}
            >
              {/* Card Header Info */}
              <View style={styles.cardHeader}>
                <View style={styles.cardMetaRow}>
                  <Feather
                    name={getSourceIcon(item.source_type)}
                    size={12}
                    color={colors.onSurfaceSecondary}
                    style={styles.metaIcon}
                  />
                  <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
                </View>
                <Text style={styles.moodLabel}>{item.mood.toUpperCase()}</Text>
              </View>

              {/* Quote Content Preview */}
              <Text style={styles.quotePreview} numberOfLines={3}>
                “{item.quote}”
              </Text>

              {/* Source Input Snippet */}
              {item.input_preview ? (
                <Text style={styles.inputPreview} numberOfLines={1}>
                  Ref: {item.input_preview}
                </Text>
              ) : null}

              {/* Card Footer Actions */}
              <View style={styles.cardFooter}>
                {item.is_favorite && (
                  <Feather name="heart" size={14} color={colors.brand} fill={colors.brand} />
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={styles.deleteButton}
                >
                  <Feather name="trash-2" size={14} color={colors.onSurfaceSecondary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: {
    borderColor: "rgba(194, 163, 112, 0.4)",
    borderWidth: 1,
  },
  headerTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: type.xl,
    color: colors.onSurface,
    letterSpacing: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaIcon: {
    marginRight: spacing.xs,
  },
  cardDate: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
  },
  moodLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.brand,
    letterSpacing: 1.5,
  },
  quotePreview: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.onSurface,
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  inputPreview: {
    fontFamily: fonts.body,
    fontSize: type.sm,
    color: colors.onSurfaceSecondary,
    fontStyle: "italic",
    marginBottom: spacing.md,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  deleteButton: {
    padding: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  emptyIcon: {
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: type.xxl,
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontFamily: fonts.body,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});

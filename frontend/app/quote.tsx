import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ImageBackground,
  Share,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../src/context/auth";
import { colors, fonts, spacing, radius, type, images } from "../src/theme";

interface Quote {
  id: string;
  quote: string;
  attribution: string;
  mood: string;
  source_type: string;
  is_favorite: boolean;
  created_at: string;
}

export default function QuoteScreen() {
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();
  const { apiFetch } = useAuth();
  const router = useRouter();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavoriting, setIsFavoriting] = useState(false);

  // Fetch the quote details
  useEffect(() => {
    async function fetchQuote() {
      if (!quoteId) return;
      try {
        const res = await apiFetch(`/api/quotes/${quoteId}`);
        const data = await res.json();
        if (res.ok) {
          setQuote(data);
        } else {
          Alert.alert("Error", data.detail || "Failed to load quote.");
        }
      } catch (err) {
        console.error("Fetch quote error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchQuote();
  }, [quoteId]);

  const handleFavoriteToggle = async () => {
    if (!quote) return;
    try {
      setIsFavoriting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const res = await apiFetch(`/api/quotes/${quote.id}/favorite`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setQuote(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Error", data.detail || "Could not update favorites.");
      }
    } catch (err) {
      console.error("Favorite toggle error:", err);
    } finally {
      setIsFavoriting(false);
    }
  };

  const handleShare = async () => {
    if (!quote) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const shareContent = `"${quote.quote}"\n${quote.attribution} (${quote.mood})\n\n— generated with Muse.`;
      
      await Share.share({
        message: shareContent,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!quote) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No quote found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/home")}>
          <Text style={styles.backBtnText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ImageBackground
      source={{ uri: images.quoteBg }}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Heavy gradient scrim for contrast */}
      <LinearGradient
        colors={["rgba(18,17,16,0.3)", "rgba(18,17,16,0.75)", "rgba(18,17,16,0.95)"]}
        style={styles.scrim}
      >
        <View style={styles.content}>
          {/* Mood Badge */}
          <View style={styles.moodBadge}>
            <Text style={styles.moodBadgeText}>{quote.mood.toUpperCase()}</Text>
          </View>

          {/* Quote Text */}
          <Text style={styles.quoteText}>“{quote.quote}”</Text>
          
          {/* Attribution */}
          <Text style={styles.attribution}>{quote.attribution}</Text>
        </View>

        {/* Bottom Floating Glass Toolbar */}
        <View style={styles.toolbarContainer}>
          <BlurView intensity={60} tint="dark" style={styles.toolbar}>
            <TouchableOpacity onPress={() => router.replace("/home")} style={styles.toolbarButton}>
              <Feather name="home" size={20} color={colors.onSurface} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleFavoriteToggle}
              style={styles.toolbarButton}
              disabled={isFavoriting}
            >
              <Feather
                name="heart"
                size={20}
                color={quote.is_favorite ? colors.brand : colors.onSurface}
                fill={quote.is_favorite ? colors.brand : "none"}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleShare} style={styles.toolbarButton}>
              <Feather name="share-2" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          </BlurView>
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: type.lg,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xl,
  },
  backBtn: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  backBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.base,
    color: colors.onBrandPrimary,
  },
  content: {
    alignItems: "center",
    marginBottom: spacing.xxxl * 2, // Leave room for floating toolbar
  },
  moodBadge: {
    backgroundColor: "rgba(194, 163, 112, 0.15)", // brand transparent
    borderWidth: 1,
    borderColor: "rgba(194, 163, 112, 0.4)",
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xxl,
  },
  moodBadgeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.brand,
    letterSpacing: 2,
  },
  quoteText: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: "400",
    color: colors.onSurface,
    textAlign: "center",
    lineHeight: 46,
    marginBottom: spacing.xl,
  },
  attribution: {
    fontFamily: fonts.displayMedium,
    fontSize: type.lg,
    color: colors.brand,
    fontStyle: "italic",
    letterSpacing: 1,
  },
  toolbarContainer: {
    position: "absolute",
    bottom: spacing.xxxl,
    left: spacing.xxl,
    right: spacing.xxl,
    height: 56,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  toolbar: {
    flexDirection: "row",
    height: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  toolbarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});

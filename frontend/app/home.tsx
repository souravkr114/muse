import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../src/context/auth";
import { colors, fonts, spacing, radius, type } from "../src/theme";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const { apiFetch, logout } = useAuth();
  const router = useRouter();

  // Active input mode: 'voice' | 'text' | 'image'
  const [mode, setMode] = useState<"voice" | "text" | "image">("text");
  const [isGenerating, setIsGenerating] = useState(false);

  // Text state
  const [textContent, setTextContent] = useState("");

  // Voice state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingDurationInterval = useRef<any>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Image state
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64?: string } | null>(null);

  // Haptic feedback wrappers
  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle) => {
    Haptics.impactAsync(style);
  };

  const handleModeChange = (newMode: "voice" | "text" | "image") => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
  };

  // --- Voice Recorder Handlers ---
  const startRecording = async () => {
    try {
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission Denied", "Microphone access is required for voice input.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationInterval.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      clearInterval(recordingDurationInterval.current);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        // Transcribe voice audio
        setIsTranscribing(true);
        const formData = new FormData();
        // Construct the file part (platform-specific)
        if (Platform.OS === "web") {
          const response = await fetch(uri);
          const blob = await response.blob();
          const mimeType = blob.type.split(";")[0] || "audio/webm";
          const extension = mimeType.includes("webm") ? "webm" : "m4a";
          formData.append("file", blob, `voice.${extension}`);
        } else {
          formData.append("file", {
            uri,
            name: "voice.m4a",
            type: "audio/m4a",
          } as any);
        }

        const res = await apiFetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok) {
          setVoiceText(data.text);
          triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Alert.alert("Transcription Error", data.detail || "Could not transcribe audio.");
        }
      }
    } catch (err) {
      console.error("Failed to stop recording:", err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // --- Image Pickers ---
  const pickImage = async (fromCamera = false) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== "granted") {
      Alert.alert("Permission Denied", "Camera/Gallery access is required.");
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    };

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage({
        uri: asset.uri,
        base64: asset.base64 || undefined,
      });
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // --- Generate Quote Handler ---
  const handleGenerate = async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);

    let bodyPayload: any = { source_type: mode };

    if (mode === "text") {
      if (!textContent.strip()) {
        Alert.alert("Empty input", "Please write down what's on your mind.");
        setIsGenerating(false);
        return;
      }
      bodyPayload.text = textContent;
    } else if (mode === "voice") {
      if (!voiceText.strip()) {
        Alert.alert("Empty transcript", "Please record your thought first.");
        setIsGenerating(false);
        return;
      }
      bodyPayload.text = voiceText;
    } else if (mode === "image") {
      if (!selectedImage || !selectedImage.base64) {
        Alert.alert("No image", "Please capture or select an image.");
        setIsGenerating(false);
        return;
      }
      bodyPayload.image_base64 = selectedImage.base64;
      bodyPayload.image_mime = "image/jpeg";
    }

    try {
      const res = await apiFetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const quote = await res.json();
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Navigate to the quote screen
        router.push({
          pathname: "/quote",
          params: { quoteId: quote.id },
        });
      } else {
        Alert.alert("Generation Error", quote.detail || "Could not generate quote.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Something went wrong.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/history")} style={styles.iconButton}>
          <Feather name="book-open" size={20} color={colors.onSurfaceSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace("/home")}>
          <Text style={styles.headerTitle}>MUSE</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} style={styles.iconButton}>
          <Feather name="log-out" size={20} color={colors.onSurfaceSecondary} />
        </TouchableOpacity>
      </View>

      {/* Main Creation Canvas */}
      <ScrollView contentContainerStyle={styles.canvasContainer}>
        {isGenerating ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.loadingText}>Listening to your muse...</Text>
          </View>
        ) : (
          <View style={styles.contentCard}>
            {/* TEXT MODE */}
            {mode === "text" && (
              <View style={styles.canvasBlock}>
                <Text style={styles.modeInstructions}>Write down a thought, a worry, or a goal:</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="The page is blank. Let it flow..."
                  placeholderTextColor={colors.onSurfaceSecondary}
                  multiline
                  value={textContent}
                  onChangeText={setTextContent}
                  maxLength={500}
                />
              </View>
            )}

            {/* VOICE MODE */}
            {mode === "voice" && (
              <View style={styles.canvasBlock}>
                <Text style={styles.modeInstructions}>Speak directly to the muse:</Text>
                
                <View style={styles.recordingArea}>
                  {isRecording ? (
                    <View style={styles.recordingActive}>
                      <View style={styles.pulsingShape} />
                      <Text style={styles.timerText}>{formatDuration(recordingDuration)}</Text>
                      <Text style={styles.recordingCaption}>Recording your voice...</Text>
                    </View>
                  ) : (
                    <Text style={styles.recordingCaption}>Tap below to start recording</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                    onPress={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                  >
                    <Feather
                      name={isRecording ? "square" : "mic"}
                      size={28}
                      color={isRecording ? colors.onSurface : colors.onBrandPrimary}
                    />
                  </TouchableOpacity>
                </View>

                {isTranscribing && (
                  <View style={styles.statusBox}>
                    <ActivityIndicator size="small" color={colors.brand} />
                    <Text style={styles.statusText}>Transcribing audio...</Text>
                  </View>
                )}

                {!isRecording && voiceText !== "" && (
                  <View style={styles.transcriptContainer}>
                    <Text style={styles.transcriptLabel}>TRANSCRIBED THOUGHT</Text>
                    <Text style={styles.transcriptText}>"{voiceText}"</Text>
                  </View>
                )}
              </View>
            )}

            {/* IMAGE MODE */}
            {mode === "image" && (
              <View style={styles.canvasBlock}>
                <Text style={styles.modeInstructions}>Select an image to sense its mood:</Text>

                <View style={styles.imageSelectorContainer}>
                  {selectedImage ? (
                    <View style={styles.previewContainer}>
                      <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() => {
                          triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedImage(null);
                        }}
                      >
                        <Feather name="x" size={16} color={colors.onSurface} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.imageButtonsRow}>
                      <TouchableOpacity style={styles.imagePickButton} onPress={() => pickImage(false)}>
                        <Feather name="image" size={24} color={colors.brand} />
                        <Text style={styles.imageBtnText}>Gallery</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.imagePickButton} onPress={() => pickImage(true)}>
                        <Feather name="camera" size={24} color={colors.brand} />
                        <Text style={styles.imageBtnText}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Action CTA Button */}
            <TouchableOpacity
              style={[
                styles.generateButton,
                ((mode === "text" && !textContent.strip()) ||
                  (mode === "voice" && !voiceText.strip()) ||
                  (mode === "image" && !selectedImage)) &&
                  styles.generateButtonDisabled,
              ]}
              onPress={handleGenerate}
              disabled={
                (mode === "text" && !textContent.strip()) ||
                (mode === "voice" && !voiceText.strip()) ||
                (mode === "image" && !selectedImage)
              }
            >
              <Text style={styles.generateButtonText}>Receive Motivation</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Glassmorphic Bottom Pill Tab Bar */}
      <View style={styles.tabBarContainer}>
        <BlurView intensity={75} tint="dark" style={styles.blurTabBar}>
          <TouchableOpacity
            style={[styles.tabButton, mode === "voice" && styles.tabButtonActive]}
            onPress={() => handleModeChange("voice")}
          >
            <Feather
              name="mic"
              size={18}
              color={mode === "voice" ? colors.brand : colors.onSurfaceSecondary}
            />
            <Text style={[styles.tabLabel, mode === "voice" && styles.tabLabelActive]}>Voice</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, mode === "text" && styles.tabButtonActive]}
            onPress={() => handleModeChange("text")}
          >
            <Feather
              name="edit-3"
              size={18}
              color={mode === "text" ? colors.brand : colors.onSurfaceSecondary}
            />
            <Text style={[styles.tabLabel, mode === "text" && styles.tabLabelActive]}>Text</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, mode === "image" && styles.tabButtonActive]}
            onPress={() => handleModeChange("image")}
          >
            <Feather
              name="image"
              size={18}
              color={mode === "image" ? colors.brand : colors.onSurfaceSecondary}
            />
            <Text style={[styles.tabLabel, mode === "image" && styles.tabLabelActive]}>Image</Text>
          </TouchableOpacity>
        </BlurView>
      </View>
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
  headerTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: type.xl,
    color: colors.onSurface,
    letterSpacing: 4,
  },
  canvasContainer: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: "center",
    paddingBottom: 100, // bottom padding for floating tab bar
  },
  contentCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 320,
    justifyContent: "space-between",
  },
  canvasBlock: {
    flex: 1,
  },
  modeInstructions: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.base,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.lg,
  },
  textArea: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: type.lg,
    color: colors.onSurface,
    lineHeight: 24,
    minHeight: 180,
    textAlignVertical: "top",
  },
  recordingArea: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.xl,
  },
  recordingActive: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  pulsingShape: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
    marginBottom: spacing.sm,
  },
  timerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 24,
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  recordingCaption: {
    fontFamily: fonts.body,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.md,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
  },
  recordButtonActive: {
    backgroundColor: colors.error,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  statusText: {
    fontFamily: fonts.body,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
    marginLeft: spacing.sm,
  },
  transcriptContainer: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transcriptLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.brand,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  transcriptText: {
    fontFamily: fonts.body,
    fontSize: type.base,
    color: colors.onSurface,
    fontStyle: "italic",
  },
  imageSelectorContainer: {
    flex: 1,
    justifyContent: "center",
    minHeight: 200,
  },
  imageButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  imagePickButton: {
    width: (width - 100) / 2,
    height: 120,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  imageBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.base,
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  previewContainer: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  removeImageBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  generateButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  generateButtonDisabled: {
    backgroundColor: colors.brandTertiary,
    opacity: 0.5,
  },
  generateButtonText: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.lg,
    color: colors.onBrandPrimary,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 280,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: type.lg,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.lg,
  },
  tabBarContainer: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    height: 64,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  blurTabBar: {
    flexDirection: "row",
    height: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  tabButtonActive: {
    opacity: 1,
  },
  tabLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.xs,
  },
  tabLabelActive: {
    color: colors.brand,
    fontFamily: fonts.bodyMedium,
  },
});

// Polyfill helper string trim/strip
if (!String.prototype.strip) {
  String.prototype.strip = function () {
    return this.trim();
  };
}
declare global {
  interface String {
    strip(): string;
  }
}

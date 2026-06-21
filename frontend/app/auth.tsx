import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/auth";
import { colors, fonts, spacing, radius, type, images } from "../src/theme";

export default function AuthScreen() {
  const { login, register, isLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email || !password) return;
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      router.replace("/home");
    } catch (e) {
      // Handled in context
    }
  };

  return (
    <ImageBackground
      source={{ uri: images.authBg }}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.subtitle}>A POCKET MUSE</Text>
          <Text style={styles.title}>muse.</Text>

          <Text style={styles.description}>
            Speak. Type. Show.{"\n"}Receive a quote made just for the moment.
          </Text>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>YOUR NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter name"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter email"
                placeholderTextColor={colors.onSurfaceSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor={colors.onSurfaceSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? "Enter the muse" : "Create account"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsLogin(!isLogin)}
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>
                {isLogin
                  ? "New here? Create an account →"
                  : "Already have an account? Login →"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18, 17, 16, 0.85)", // deep atmospheric overlay
  },
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: spacing.xxl,
  },
  subtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.sm,
    color: colors.brand,
    letterSpacing: 3,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 64,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: type.lg,
    color: colors.onSurfaceSecondary,
    lineHeight: 24,
    marginBottom: spacing.xxl,
  },
  form: {
    marginTop: spacing.sm,
  },
  inputContainer: {
    marginBottom: spacing.xl,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: type.lg,
    color: colors.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    paddingVertical: spacing.sm,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  buttonText: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.lg,
    color: colors.onBrandPrimary,
    fontWeight: "500",
  },
  toggle: {
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  toggleText: {
    fontFamily: fonts.body,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
  },
});

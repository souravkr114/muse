import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, ActivityIndicator, View } from "react-native";
import * as Font from "expo-font";
import { Feather } from "@expo/vector-icons";
import { AuthProvider } from "../src/context/auth";
import { colors } from "../src/theme";

// Ignore all warnings
LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadResources() {
      try {
        await Font.loadAsync({
          ...Feather.font,
          CormorantGaramond: "https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bm4VwjCG57Xv9eE8c4qL7t0-N230.ttf",
          CormorantGaramondMedium: "https://fonts.gstatic.com/s/cormorantgaramond/v16/co3am4VwjCG57Xv9eE8c4qL7t0-94W1q92E.ttf",
          Manrope: "https://fonts.gstatic.com/s/manrope/v15/xn7_YHEoM1wVeyxB33nH.ttf",
          ManropeMedium: "https://fonts.gstatic.com/s/manrope/v15/xn7gYHEoM1wVeyxB33nHef6t.ttf",
        });
      } catch (e) {
        console.warn("Failed to load fonts online:", e);
      } finally {
        setFontsLoaded(true);
        SplashScreen.hideAsync();
      }
    }
    loadResources();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="home" />
        <Stack.Screen name="quote" />
        <Stack.Screen name="history" />
      </Stack>
    </AuthProvider>
  );
}

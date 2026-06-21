import React, { createContext, useState, useEffect, useContext } from "react";
import { Alert, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface User {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Platform-aware secure token storage helper
const tokenStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      try {
        localStorage.setItem(key, value);
      } catch {}
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      try {
        localStorage.removeItem(key);
      } catch {}
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize: load token from secure store and check session
  useEffect(() => {
    async function loadSession() {
      try {
        const storedToken = await tokenStorage.getItem("muse_token");
        if (storedToken) {
          setToken(storedToken);
          // Try to fetch me profile
          const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });
          if (res.status === 200) {
            const userData = await res.json();
            setUser(userData);
          } else {
            // Token expired or invalid
            await tokenStorage.deleteItem("muse_token");
            setToken(null);
          }
        }
      } catch (err) {
        console.warn("Failed to load session:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to login");
      }
      await tokenStorage.setItem("muse_token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      if (Platform.OS === "web") {
        console.error("Auth Error:", err.message);
        alert(err.message);
      } else {
        Alert.alert("Authentication Error", err.message);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to register");
      }
      await tokenStorage.setItem("muse_token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      if (Platform.OS === "web") {
        console.error("Reg Error:", err.message);
        alert(err.message);
      } else {
        Alert.alert("Registration Error", err.message);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await tokenStorage.deleteItem("muse_token");
      setToken(null);
      setUser(null);
    } catch (err) {
      console.warn("Failed to logout:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers,
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

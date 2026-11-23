import { createContext, useContext, useMemo, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext({
  session: null,
  user: null,
  loading: false,
  isAuthenticated: false,
  signIn: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
});

function readUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser());
  const [loading, setLoading] = useState(false);

  const value = useMemo(() => ({
    session: user ? { user } : null,
    user,
    loading,
    isAuthenticated: !!localStorage.getItem("token"),
    async signIn({ email, password, username }) {
      try {
        const res = await api.post("/auth/login", { username: username || email, password });
        const { token, user: u } = res.data;
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(u));
        setUser(u);
        return { data: { user: u }, error: null };
      } catch (e) {
        return { data: null, error: { message: e?.response?.data?.error || e.message || "Login gagal" } };
      }
    },
    async signOut() {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      return { error: null };
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

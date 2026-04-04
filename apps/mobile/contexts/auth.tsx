import React, { createContext, useContext, useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import type { Session, EmailOtpType } from "@supabase/supabase-js";

type AuthState = "loading" | "authenticated" | "unauthenticated";

const AuthContext = createContext<{
  session: Session | null;
  state: AuthState;
}>({ session: null, state: "loading" });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    const applySessionFromUrl = async (url?: string | null) => {
      if (!url) return;
      const [_, hashPart = ""] = url.split("#");
      const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] ?? "" : "";
      const fromHash = new URLSearchParams(hashPart);
      const fromQuery = new URLSearchParams(query);

      const accessToken = fromHash.get("access_token") ?? fromQuery.get("access_token");
      const refreshToken = fromHash.get("refresh_token") ?? fromQuery.get("refresh_token");
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        return;
      }

      // PKCE flow: callback contains ?code=...
      const code = fromQuery.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        return;
      }

      // OTP verify flow: callback contains ?token_hash=...&type=magiclink
      const tokenHash = fromQuery.get("token_hash");
      const type = fromQuery.get("type");
      if (tokenHash && type) {
        await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setState(session ? "authenticated" : "unauthenticated");
    }).catch((err) => {
      console.warn("[auth] getSession failed:", err);
      setState("unauthenticated");
    });
    Linking.getInitialURL().then((url) => {
      applySessionFromUrl(url).catch((e) => console.warn("initial deep link auth parse failed", e));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setState(session ? "authenticated" : "unauthenticated");
      }
    );

    const sub = Linking.addEventListener("url", async (e) => {
      await applySessionFromUrl(e.url);
    });
    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, state }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

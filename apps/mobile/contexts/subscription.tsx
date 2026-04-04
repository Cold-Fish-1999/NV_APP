import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth";
import {
  getSubscriptionStatus,
  setTierInDB,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "@/lib/subscriptionService";

const SubscriptionContext = createContext<{
  status: SubscriptionStatus | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
  setTier: (value: SubscriptionTier) => Promise<void>;
}>({
  status: null,
  isLoading: true,
  refetch: async () => {},
  setTier: async () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = async () => {
    if (!session?.user?.id) {
      setStatus(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const s = await getSubscriptionStatus(session.user.id);
    setStatus(s);
    setIsLoading(false);
  };

  useEffect(() => {
    void fetch();
  }, [session?.user?.id]);

  const setTier = async (value: SubscriptionTier) => {
    if (!session?.user?.id) return;
    await setTierInDB(session.user.id, value);
    await fetch();
  };

  return (
    <SubscriptionContext.Provider value={{ status, isLoading, refetch: fetch, setTier }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => useContext(SubscriptionContext);

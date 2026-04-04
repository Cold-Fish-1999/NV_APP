import { createContext, useContext, useState, type ReactNode } from "react";

const TABS = ["Weekly", "Monthly"] as const;
type TabKey = (typeof TABS)[number];

interface ReportTabCtx {
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  tabs: readonly typeof TABS[number][];
}

const Ctx = createContext<ReportTabCtx>({
  activeTab: "Weekly",
  setActiveTab: () => {},
  tabs: TABS,
});

export function ReportTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabKey>("Weekly");
  return (
    <Ctx.Provider value={{ activeTab, setActiveTab, tabs: TABS }}>
      {children}
    </Ctx.Provider>
  );
}

export function useReportTab() {
  return useContext(Ctx);
}

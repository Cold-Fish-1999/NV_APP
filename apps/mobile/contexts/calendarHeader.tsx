import React, { createContext, useContext, useState, useCallback } from "react";

const RANGE_OPTIONS = [7, 14, 30, 60, 90, 180, 365] as const;

type RangeDays = (typeof RANGE_OPTIONS)[number];

interface CalendarHeaderContextValue {
  rangeDays: number;
  setRangeDays: (d: number) => void;
  showRangePicker: boolean;
  setShowRangePicker: (v: boolean) => void;
  canPrevRange: boolean;
  canNextRange: boolean;
  onPrevRange: () => void;
  onNextRange: () => void;
  onSelectRange: (d: number) => void;
  rangeIndex: number;
}

const CalendarHeaderContext = createContext<CalendarHeaderContextValue | null>(null);

export function CalendarHeaderProvider({ children }: { children: React.ReactNode }) {
  const [rangeDays, setRangeDaysState] = useState<number>(180);
  const [showRangePicker, setShowRangePicker] = useState(false);

  const rangeIndex = Math.max(0, RANGE_OPTIONS.findIndex((v) => v === rangeDays));
  const canPrevRange = rangeIndex > 0;
  const canNextRange = rangeIndex < RANGE_OPTIONS.length - 1;

  const setRangeDays = useCallback((d: number) => {
    setRangeDaysState(d);
  }, []);

  const onPrevRange = useCallback(() => {
    if (rangeIndex <= 0) return;
    setRangeDaysState(RANGE_OPTIONS[rangeIndex - 1]);
  }, [rangeIndex]);

  const onNextRange = useCallback(() => {
    if (rangeIndex >= RANGE_OPTIONS.length - 1) return;
    setRangeDaysState(RANGE_OPTIONS[rangeIndex + 1]);
  }, [rangeIndex]);

  const onSelectRange = useCallback((d: number) => {
    setRangeDaysState(d);
    setShowRangePicker(false);
  }, []);

  const value: CalendarHeaderContextValue = {
    rangeDays,
    setRangeDays,
    showRangePicker,
    setShowRangePicker,
    canPrevRange,
    canNextRange,
    onPrevRange,
    onNextRange,
    onSelectRange,
    rangeIndex,
  };

  return (
    <CalendarHeaderContext.Provider value={value}>
      {children}
    </CalendarHeaderContext.Provider>
  );
}

export function useCalendarHeader() {
  const ctx = useContext(CalendarHeaderContext);
  if (!ctx) throw new Error("useCalendarHeader must be used within CalendarHeaderProvider");
  return ctx;
}

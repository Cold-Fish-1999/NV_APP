import {
  formatDateShort,
  formatWeekday,
  formatTime,
  aggregateTags,
  getTimeSlotForEntry,
} from "../dateUtils";

describe("formatDateShort", () => {
  it("formats YYYY-MM-DD to Mon D", () => {
    expect(formatDateShort("2025-02-23")).toBe("Feb 23");
    expect(formatDateShort("2025-01-01")).toBe("Jan 1");
  });
});

describe("formatWeekday", () => {
  it("returns weekday short name", () => {
    expect(formatWeekday("2025-02-23")).toBe("Sun");
    expect(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).toContain(
      formatWeekday("2025-02-21")
    );
  });
});

describe("formatTime", () => {
  it("formats ISO string to HH:mm", () => {
    expect(formatTime("2025-02-23T14:30:00Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("aggregateTags", () => {
  it("deduplicates and sorts by count desc", () => {
    const entries = [
      { meta: { symptom_keywords: ["头痛", "腹泻"] } },
      { meta: { symptom_keywords: ["头痛", "头痛"] } },
      { meta: { symptom_keywords: ["失眠"] } },
    ];
    const result = aggregateTags(entries, 5);
    expect(result[0]).toEqual({ tag: "头痛", count: 3 });
    expect(result).toHaveLength(3);
  });

  it("returns empty when no keywords", () => {
    expect(aggregateTags([], 5)).toEqual([]);
    expect(aggregateTags([{ meta: {} }], 5)).toEqual([]);
  });

  it("limits to maxCount", () => {
    const entries = [
      { meta: { symptom_keywords: ["a", "b", "c", "d", "e", "f"] } },
    ];
    expect(aggregateTags(entries, 3)).toHaveLength(3);
  });

  it("does not double-count when both meta.symptom_keywords and tags have same keyword", () => {
    const entries = [
      { meta: { symptom_keywords: ["头痛"] }, tags: ["头痛"] },
    ];
    const result = aggregateTags(entries, 5);
    expect(result[0]).toEqual({ tag: "头痛", count: 1 });
  });
});

describe("getTimeSlotForEntry", () => {
  it("returns a valid time slot key", () => {
    const slots = ["morning", "afternoon", "evening", "night"];
    const result = getTimeSlotForEntry("2025-02-23T14:30:00Z");
    expect(slots).toContain(result);
  });
});

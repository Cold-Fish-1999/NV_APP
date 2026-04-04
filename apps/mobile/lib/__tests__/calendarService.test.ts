import { groupByDateAndAggregate } from "../calendarService";
import type { SymptomEntry } from "@/types/calendar";

describe("groupByDateAndAggregate", () => {
  it("groups entries by date and aggregates tags", () => {
    const entries: SymptomEntry[] = [
      {
        id: "1",
        local_date: "2025-02-23",
        created_at: "2025-02-23T10:00:00Z",
        summary: "头痛",
        meta: { symptom_keywords: ["头痛"] },
      },
      {
        id: "2",
        local_date: "2025-02-23",
        created_at: "2025-02-23T14:00:00Z",
        summary: "腹泻",
        meta: { symptom_keywords: ["腹泻", "头痛"] },
      },
      {
        id: "3",
        local_date: "2025-02-22",
        created_at: "2025-02-22T09:00:00Z",
        summary: "失眠",
        meta: { symptom_keywords: ["失眠"] },
      },
    ];
    const dateRange = ["2025-02-23", "2025-02-22"];
    const result = groupByDateAndAggregate(entries, dateRange, 5);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-02-23");
    expect(result[0].entries).toHaveLength(2);
    expect(result[0].aggregatedTags[0].tag).toBe("头痛");
    expect(result[0].aggregatedTags[0].count).toBe(2);
  });
});

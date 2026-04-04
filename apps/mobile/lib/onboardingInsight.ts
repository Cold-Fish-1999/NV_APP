export interface OnboardingSurvey {
  age_range?: string;
  gender?: string;
  smoking?: string;
  alcohol?: string;
  cannabis?: string;
  health_concerns?: string[];
  /** 是否正受疾病/慢性病困扰 */
  chronic_disease_distress?: "Yes" | "No";
  /** 困扰你的情况（多选），含 Other — 可稍后在 Profile 补充 */
  chronic_conditions?: string[];
  family_history?: string;
  family_conditions?: string[];
  medications?: string;
  activity_level?: string;
  sleep_quality?: string;
}

export type Frequency = "never" | "rarely" | "occasionally" | "regularly";

export type ConcernValue =
  | "sleep_issues"
  | "fatigue_low_energy"
  | "stress_anxiety"
  | "digestive_discomfort"
  | "hormonal_metabolic"
  | "chronic_condition"
  | "no_major_concerns";

export type FamilyHistoryValue = "yes" | "no" | "not_sure";
export type MedicationsValue = "yes" | "no";

export type ActivityLevelValue =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active";

export type SleepQualityValue =
  | "very_good"
  | "fair"
  | "poor"
  | "very_poor";

export type UserProfile = {
  ageRange?:
    | "under_18"
    | "18_25"
    | "26_35"
    | "36_45"
    | "46_60"
    | "60_plus";
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";

  smoking?: Extract<Frequency, "never" | "occasionally" | "regularly">;
  alcohol?: Extract<Frequency, "rarely" | "occasionally" | "regularly">;
  cannabis?: Extract<Frequency, "never" | "occasionally" | "regularly">;

  concerns?: ConcernValue[];

  familyHistory?: FamilyHistoryValue;
  familyConditions?: Array<
    | "heart_disease"
    | "diabetes"
    | "cancer"
    | "high_blood_pressure"
    | "mental_health_conditions"
  >;

  medications?: MedicationsValue;

  activityLevel?: ActivityLevelValue;
  sleepQuality?: SleepQualityValue;

  /** 问卷：是否报告正受慢性病困扰 */
  chronicDiseaseDistress?: boolean;
};

const CONCERN_LABEL_TO_VALUE: Record<string, ConcernValue> = {
  "Sleep issues": "sleep_issues",
  "Fatigue or low energy": "fatigue_low_energy",
  "Stress or anxiety": "stress_anxiety",
  "Digestive discomfort": "digestive_discomfort",
  "Hormonal or metabolic issues": "hormonal_metabolic",
  "Chronic condition": "chronic_condition",
  "No major concerns": "no_major_concerns",
};

const FAMILY_CONDITION_LABEL_TO_VALUE: Record<string, string> = {
  "Heart disease": "heart_disease",
  "Diabetes": "diabetes",
  "Cancer": "cancer",
  "High blood pressure": "high_blood_pressure",
  "Mental health conditions": "mental_health_conditions",
  "Other": "other",
};

export function surveyToUserProfile(survey: OnboardingSurvey): UserProfile {
  const ageMap: Record<string, UserProfile["ageRange"]> = {
    "Under 18": "under_18",
    "18–25": "18_25",
    "26–35": "26_35",
    "36–45": "36_45",
    "46–60": "46_60",
    "60+": "60_plus",
  };
  const genderMap: Record<string, UserProfile["gender"]> = {
    "Male": "male",
    "Female": "female",
    "Non-binary": "non_binary",
    "Prefer not to say": "prefer_not_to_say",
  };
  const freqMap: Record<string, Frequency> = {
    "Never": "never",
    "Rarely": "rarely",
    "Occasionally": "occasionally",
    "Regularly": "regularly",
  };
  const familyMap: Record<string, FamilyHistoryValue> = {
    "Yes": "yes",
    "No": "no",
    "Not sure": "not_sure",
  };
  const medMap: Record<string, MedicationsValue> = {
    "No": "no",
    "Yes": "yes",
  };
  const activityMap: Record<string, ActivityLevelValue> = {
    "Mostly sedentary": "sedentary",
    "Light activity": "light",
    "Moderate exercise": "moderate",
    "Very active": "very_active",
    "Rarely": "sedentary",
    "Occasionally": "moderate",
    "Regularly": "very_active",
  };
  const sleepMap: Record<string, SleepQualityValue> = {
    "Very good": "very_good",
    "Fair": "fair",
    "Poor": "poor",
    "Very poor": "very_poor",
    "Good": "very_good",
  };

  const concerns = (survey.health_concerns ?? [])
    .map((l) => CONCERN_LABEL_TO_VALUE[l])
    .filter((v): v is ConcernValue => Boolean(v));

  const familyConditions = (survey.family_conditions ?? [])
    .map((l) => FAMILY_CONDITION_LABEL_TO_VALUE[l])
    .filter((v): v is NonNullable<UserProfile["familyConditions"]>[number] =>
      Boolean(v) && v !== "other"
    ) as UserProfile["familyConditions"];

  return {
    ageRange: survey.age_range ? ageMap[survey.age_range] : undefined,
    gender: survey.gender ? genderMap[survey.gender] : undefined,
    smoking: survey.smoking ? (freqMap[survey.smoking] as UserProfile["smoking"]) : undefined,
    alcohol: survey.alcohol ? (freqMap[survey.alcohol] as UserProfile["alcohol"]) : undefined,
    cannabis: survey.cannabis ? (freqMap[survey.cannabis] as UserProfile["cannabis"]) : undefined,
    concerns: concerns.length > 0 ? concerns : undefined,
    familyHistory: survey.family_history ? familyMap[survey.family_history] : undefined,
    familyConditions: familyConditions?.length ? familyConditions : undefined,
    medications: survey.medications ? medMap[survey.medications] : undefined,
    activityLevel: survey.activity_level ? activityMap[survey.activity_level] : undefined,
    sleepQuality: survey.sleep_quality ? sleepMap[survey.sleep_quality] : undefined,
    chronicDiseaseDistress: survey.chronic_disease_distress === "Yes",
  };
}

type RuleWhen = {
  concernsAny?: ConcernValue[];
  concernsAll?: ConcernValue[];
  sleepQualityAny?: SleepQualityValue[];
  activityLevelAny?: ActivityLevelValue[];
  familyHistoryIs?: FamilyHistoryValue;
  medicationsIs?: MedicationsValue;
  anyLifestyleUse?: boolean;
  chronicDiseaseDistress?: boolean;
};

type PrimaryInsightRule = {
  id: string;
  priority: number;
  when: RuleWhen;
  title: string;
  primaryInsight: string;
  secondaryParagraph: string;
  secondarySentence: string;
  focusAreas: string[];
};

type AddOnInsightRule = {
  id: string;
  when: RuleWhen;
  label: string; // short label for aggregation
};

export type InsightResult = {
  title: string;
  primaryInsight: string;
  secondaryParagraph: string;
  secondaryNotes: string[];
  addOnSentences: string[];
  focusAreas: string[];
  aiValueText: string;
  cta: string;
};

export const aiValueText =
  "Your AI health companion will help you track these signals, remember changes over time, and provide personalized health insights based on your daily records.";

export const focusAreaMap: Record<string, string> = {
  sleep_issues: "Sleep quality",
  fatigue_low_energy: "Energy levels",
  stress_anxiety: "Stress patterns",
  digestive_discomfort: "Digestive comfort",
  hormonal_metabolic: "Hormonal balance",
  chronic_condition: "Symptom timeline",
  no_major_concerns: "Daily symptoms",

  smoking: "Lifestyle habits",
  alcohol: "Lifestyle habits",
  cannabis: "Lifestyle habits",

  family_history: "Family risk context",
  medications: "Medication context",

  sedentary: "Activity patterns",
  light: "Activity patterns",
  moderate: "Activity patterns",
  very_active: "Activity patterns",
};

export const primaryInsightRules: PrimaryInsightRule[] = [
  {
    id: "chronic_disease_distress",
    priority: 92,
    when: { chronicDiseaseDistress: true },
    title: "Your health profile is ready",
    primaryInsight:
      "You indicated you are living with one or more ongoing health conditions — tracking day-to-day symptoms and habits can help you and your care team see patterns over time.",
    secondaryParagraph:
      "Consistent logging makes it easier to notice what improves or worsens your symptoms. You can always add or refine conditions later in your Profile.",
    secondarySentence: "Structured tracking may be especially helpful for chronic conditions.",
    focusAreas: ["Chronic conditions", "Symptom timeline", "Daily symptoms"],
  },
  {
    id: "sleep_stress",
    priority: 100,
    when: {
      concernsAny: ["sleep_issues", "stress_anxiety"],
      sleepQualityAny: ["poor", "very_poor"],
    },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that sleep and stress patterns may be important signals for your health.",
    secondaryParagraph:
      "Changes in sleep, daily stress, and energy levels can often affect how you feel over time. Tracking these signals may help reveal patterns that are otherwise easy to miss.",
    secondarySentence:
      "Sleep and stress patterns may be especially worth tracking over time.",
    focusAreas: ["Sleep quality", "Stress patterns", "Energy levels"],
  },
  {
    id: "sleep_only",
    priority: 90,
    when: { concernsAny: ["sleep_issues"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that sleep patterns may be an important signal for your health.",
    secondaryParagraph:
      "Tracking sleep quality and daily habits may help reveal patterns that affect how you feel over time.",
    secondarySentence: "Sleep quality may be worth tracking more closely.",
    focusAreas: ["Sleep quality", "Daily habits", "Energy levels"],
  },
  {
    id: "stress_only",
    priority: 69,
    when: { concernsAny: ["stress_anxiety"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that stress patterns may be an important signal for your health.",
    secondaryParagraph:
      "Stress can affect sleep, energy, and how you feel day to day. Tracking these patterns over time may help reveal useful connections.",
    secondarySentence: "Stress patterns may be especially worth tracking over time.",
    focusAreas: ["Stress patterns", "Sleep quality", "Energy levels"],
  },
  {
    id: "fatigue",
    priority: 85,
    when: { concernsAny: ["fatigue_low_energy"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that energy levels may be an important health signal for you.",
    secondaryParagraph:
      "Fatigue can be influenced by sleep, activity, stress, and other daily habits. Tracking these signals over time may help uncover useful patterns.",
    secondarySentence: "Energy levels may also be worth tracking over time.",
    focusAreas: ["Energy levels", "Sleep quality", "Activity patterns"],
  },
  {
    id: "digestive",
    priority: 80,
    when: { concernsAny: ["digestive_discomfort"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that digestive patterns may be worth paying attention to.",
    secondaryParagraph:
      "Daily food choices, timing, stress, and other habits can affect digestive comfort. Tracking these signals may help you better understand your body over time.",
    secondarySentence:
      "Digestive comfort may be another useful signal to monitor.",
    focusAreas: ["Digestive comfort", "Food patterns", "Daily symptoms"],
  },
  {
    id: "hormonal",
    priority: 75,
    when: { concernsAny: ["hormonal_metabolic"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that hormonal and metabolic patterns may play an important role in your overall well-being.",
    secondaryParagraph:
      "Changes in sleep, energy, appetite, and daily routine can all be connected. Tracking these signals may help reveal longer-term trends.",
    secondarySentence:
      "Hormonal and metabolic patterns may also be useful to track.",
    focusAreas: ["Hormonal balance", "Energy levels", "Sleep quality"],
  },
  {
    id: "chronic_condition",
    priority: 70,
    when: { concernsAny: ["chronic_condition"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that having a clearer health timeline could be especially valuable for you.",
    secondaryParagraph:
      "When health conditions are part of daily life, tracking symptoms and habits may help provide a more complete picture over time.",
    secondarySentence:
      "Building a clearer symptom timeline may be especially useful for you.",
    focusAreas: ["Symptom timeline", "Daily symptoms", "Lifestyle habits"],
  },
  {
    id: "no_major_concerns",
    priority: 10,
    when: { concernsAll: ["no_major_concerns"] },
    title: "Your health profile is ready",
    primaryInsight:
      "Even without major concerns, your daily health signals can still reveal meaningful patterns.",
    secondaryParagraph:
      "Tracking sleep, energy, and everyday symptoms can help build a clearer picture of your long-term health.",
    secondarySentence:
      "Everyday signals can still be valuable when tracked consistently.",
    focusAreas: ["Sleep quality", "Energy levels", "Daily symptoms"],
  },
  {
    id: "default",
    priority: 0,
    when: {},
    title: "Your health profile is ready",
    primaryInsight:
      "Your responses suggest that tracking your daily health signals could provide useful insights over time.",
    secondaryParagraph:
      "Small changes in sleep, energy, habits, and symptoms can become easier to understand when they are tracked consistently.",
    secondarySentence:
      "Small changes become clearer when tracked consistently.",
    focusAreas: ["Daily symptoms", "Lifestyle habits", "Health timeline"],
  },
];

export const addOnInsightRules: AddOnInsightRule[] = [
  { id: "family_history", when: { familyHistoryIs: "yes" }, label: "family history" },
  { id: "poor_sleep", when: { sleepQualityAny: ["poor", "very_poor"] }, label: "sleep quality" },
  { id: "low_activity", when: { activityLevelAny: ["sedentary"] }, label: "activity level" },
  { id: "lifestyle", when: { anyLifestyleUse: true }, label: "lifestyle habits" },
  { id: "medications", when: { medicationsIs: "yes" }, label: "medications" },
];

function includesAny<T extends string>(source: T[] = [], targets: T[] = []) {
  return targets.some((item) => source.includes(item));
}

function includesAll<T extends string>(source: T[] = [], targets: T[] = []) {
  return targets.every((item) => source.includes(item));
}

function hasLifestyleUse(profile: UserProfile): boolean {
  return (
    profile.smoking === "occasionally" ||
    profile.smoking === "regularly" ||
    profile.alcohol === "occasionally" ||
    profile.alcohol === "regularly" ||
    profile.cannabis === "occasionally" ||
    profile.cannabis === "regularly"
  );
}

function normalizeConcerns(concerns?: ConcernValue[]): ConcernValue[] {
  const values = concerns ?? [];
  if (values.includes("no_major_concerns") && values.length > 1) {
    return values.filter((item) => item !== "no_major_concerns");
  }
  return values;
}

function matchRule(profile: UserProfile, when: RuleWhen): boolean {
  const concerns = normalizeConcerns(profile.concerns);
  const sleepQuality = profile.sleepQuality ? [profile.sleepQuality] : [];
  const activity = profile.activityLevel ? [profile.activityLevel] : [];

  if (when.concernsAny && !includesAny(concerns, when.concernsAny)) {
    return false;
  }

  if (when.concernsAll && !includesAll(concerns, when.concernsAll)) {
    return false;
  }

  if (
    when.sleepQualityAny &&
    !includesAny(sleepQuality, when.sleepQualityAny)
  ) {
    return false;
  }

  if (
    when.activityLevelAny &&
    !includesAny(activity, when.activityLevelAny)
  ) {
    return false;
  }

  if (
    when.familyHistoryIs &&
    profile.familyHistory !== when.familyHistoryIs
  ) {
    return false;
  }

  if (when.medicationsIs && profile.medications !== when.medicationsIs) {
    return false;
  }

  if (when.anyLifestyleUse && !hasLifestyleUse(profile)) {
    return false;
  }

  if (
    when.chronicDiseaseDistress === true &&
    profile.chronicDiseaseDistress !== true
  ) {
    return false;
  }

  return true;
}

function uniqStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildDynamicFocusAreas(
  profile: UserProfile,
  baseAreas: string[],
): string[] {
  const areas = new Set<string>(baseAreas);
  const concerns = normalizeConcerns(profile.concerns);

  concerns.forEach((concern) => {
    const mapped = focusAreaMap[concern];
    if (mapped) areas.add(mapped);
  });

  if (hasLifestyleUse(profile)) {
    areas.add("Lifestyle habits");
  }

  if (profile.familyHistory === "yes") {
    areas.add("Family risk context");
  }

  if (profile.medications === "yes") {
    areas.add("Medication context");
  }

  if (profile.chronicDiseaseDistress) {
    areas.add("Chronic conditions");
  }

  if (profile.activityLevel) {
    const mapped = focusAreaMap[profile.activityLevel];
    if (mapped) areas.add(mapped);
  }

  return Array.from(areas).slice(0, 3);
}

export function generateHealthInsight(profile: UserProfile): InsightResult {
  const matchedPrimaryRules = [...primaryInsightRules]
    .filter((rule) => matchRule(profile, rule.when))
    .sort((a, b) => b.priority - a.priority);

  const mainRule =
    matchedPrimaryRules[0] ??
    primaryInsightRules.find((r) => r.id === "default")!;

  const secondaryNotes = uniqStrings(
    matchedPrimaryRules
      .slice(1, 3)
      .map((rule) => rule.secondarySentence),
  ).slice(0, 2);

  const matchedLabels = addOnInsightRules
    .filter((rule) => matchRule(profile, rule.when))
    .map((rule) => rule.label);
  const addOnSentences =
    matchedLabels.length > 0
      ? [
          matchedLabels.length === 1
            ? `Your ${matchedLabels[0]} may also be worth tracking over time.`
            : matchedLabels.length === 2
              ? `Your ${matchedLabels[0]} and ${matchedLabels[1]} may also be worth tracking over time.`
              : `Your ${matchedLabels.slice(0, -1).join(", ")}, and ${matchedLabels[matchedLabels.length - 1]} may also be worth tracking over time.`,
        ]
      : [];

  const focusAreas = buildDynamicFocusAreas(profile, mainRule.focusAreas);

  return {
    title: mainRule.title,
    primaryInsight: mainRule.primaryInsight,
    secondaryParagraph: mainRule.secondaryParagraph,
    secondaryNotes,
    addOnSentences,
    focusAreas,
    aiValueText,
    cta: "Start my health journey",
  };
}

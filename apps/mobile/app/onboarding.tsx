import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Pressable,
  Alert,
} from "react-native";

const AnimatedText = Animated.createAnimatedComponent(Text);
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { storageGetItem, storageSetItem, storageRemoveItem } from "@/lib/storage";
import {
  generateHealthInsight,
  surveyToUserProfile,
  type OnboardingSurvey,
} from "@/lib/onboardingInsight";
import { supabase } from "@/lib/supabase";
import { upsertHealthProfile } from "@/lib/profileService";
import { FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD, FONT_SERIF } from "@/lib/fonts";

const ONBOARDING_KEY = "nvapp_onboarding_done";
const ONBOARDING_SURVEY_KEY = "nvapp_onboarding_survey";

export type { OnboardingSurvey } from "@/lib/onboardingInsight";

const THEME = {
  bg: "#f9faf5",
  text: "#2d2d2d",
  textMuted: "#6b6b6b",
  accent: "#e07c3c",
};

function FadeSegment({
  children,
  delay,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 600,
      delay,
      useNativeDriver: true,
    }).start();
  }, [delay, opacity]);
  return (
    <AnimatedText style={[style, { opacity }]}>{children}</AnimatedText>
  );
}

function FadeView({ children, delay, style }: { children: React.ReactNode; delay: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 600,
      delay,
      useNativeDriver: true,
    }).start();
  }, [delay, opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

function Page1({ onNext, topInset, bottomInset }: { onNext: () => void; topInset: number; bottomInset: number }) {
  return (
    <View style={[styles.page, styles.pageWithFooter, { paddingTop: 60 + topInset }]}>
      <View style={styles.page1Content}>
        <FadeSegment delay={200} style={styles.page1Title}>
          Hoot, Your Personal AI Health Companion
        </FadeSegment>
        <FadeView delay={600} style={styles.page1SubtitleWrap}>
          <Text style={styles.page1Subtitle}>
            Track your symptoms, understand your body, and detect health signals early.
          </Text>
        </FadeView>
      </View>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.btnText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page2({ onNext, topInset, bottomInset }: { onNext: () => void; topInset: number; bottomInset: number }) {
  return (
    <View style={[styles.page, styles.pageWithFooter, { paddingTop: 48 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <FadeSegment delay={200} style={styles.page2Label}>Question</FadeSegment>
        <FadeSegment delay={500} style={styles.page2Question}>
          How many times did you feel unusually tired last year?
        </FadeSegment>
        <FadeSegment delay={900} style={styles.page2Fact}>Most people can't remember.</FadeSegment>
        <FadeView delay={1200} style={styles.page2BodyWrap}>
          <Text style={styles.page2Body}>
            Small symptoms feel common, but healthy adults actually experience them far less often than they think.
          </Text>
          <Text style={[styles.page2Body, { marginTop: 12 }]}>
            Small symptoms appear long before bigger health problems.
          </Text>
        </FadeView>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page3({ onNext, topInset, bottomInset }: { onNext: () => void; topInset: number; bottomInset: number }) {
  return (
    <View style={[styles.page, styles.pageWithFooter, { paddingTop: 48 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <FadeSegment delay={200} style={styles.page3Title}>
          Small symptoms are easy to forget
        </FadeSegment>
        <FadeView delay={500} style={styles.page3Block}>
          <Text style={styles.page3BlockTitle}>Doctors often ask:</Text>
          <Text style={styles.page3BlockText}>When did the symptom start?</Text>
          <Text style={styles.page3Bullet}>• Last week?</Text>
          <Text style={styles.page3Bullet}>• Three months ago?</Text>
          <Text style={styles.page3Bullet}>• Almost a year ago?</Text>
          <Text style={[styles.page3BlockText, { marginTop: 12 }]}>Most people simply don't know.</Text>
        </FadeView>
        <FadeView delay={1200} style={styles.page3Block}>
          <Text style={styles.page3BlockTitle}>Your AI health companion remembers for you</Text>
          <Text style={styles.page3Bullet}>• Food</Text>
          <Text style={styles.page3Bullet}>• energy</Text>
          <Text style={styles.page3Bullet}>• symptoms</Text>
          <Text style={[styles.page3BlockText, { marginTop: 12 }]}>So patterns become visible over time.</Text>
        </FadeView>
        <FadeSegment delay={1900} style={styles.page3Closing}>
          Small signals become meaningful when they are tracked.
        </FadeSegment>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page4({ onNext, topInset, bottomInset }: { onNext: () => void; topInset: number; bottomInset: number }) {
  return (
    <View style={[styles.page, styles.pageWithFooter, { paddingTop: 48 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <FadeSegment delay={200} style={styles.page4Title}>
          AI helps connect the dots
        </FadeSegment>
        <FadeView delay={500} style={styles.page4TextWrap}>
          <Text style={styles.page4Text}>
            By analyzing your health signals over time, AI can help you:
          </Text>
        </FadeView>
        <FadeView delay={900} style={styles.page4ListWrap}>
          <Text style={styles.page4Item}>✓ Notice patterns</Text>
          <Text style={styles.page4Item}>✓ Understand symptoms</Text>
          <Text style={styles.page4Item}>✓ Spot potential risks earlier</Text>
          <Text style={styles.page4Item}>✓ Track chronic conditions</Text>
        </FadeView>
        <FadeView delay={1400} style={styles.page4NoteWrap}>
          <Text style={styles.page4Note}>
            Not a doctor. A smart health companion helping you understand your body.
          </Text>
        </FadeView>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.min(100, (current / total) * 100);
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>{current} / {total}</Text>
    </View>
  );
}

function OptionBtn({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.optionBtn, selected && styles.optionBtnActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.optionBtnText, selected && styles.optionBtnTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Page5({
  onNext,
  topInset,
  bottomInset,
  survey,
  setSurvey,
}: {
  onNext: () => void;
  topInset: number;
  bottomInset: number;
  survey: OnboardingSurvey;
  setSurvey: (s: OnboardingSurvey) => void;
}) {
  const opts = ["Under 18", "18–25", "26–35", "36–45", "46–60", "60+"];
  const [phase, setPhase] = useState<"intro" | "content">("intro");
  const introOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.timing(introOpacity, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [introOpacity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(introOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start(() => setPhase("content"));
    }, 2200);
    return () => clearTimeout(timer);
  }, [introOpacity, contentOpacity, contentTranslateY]);

  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <Animated.View
        style={[styles.page5IntroWrap, { opacity: introOpacity }]}
        pointerEvents={phase === "intro" ? "auto" : "none"}
      >
        <Text style={styles.page5IntroTitle}>Let's get to know you</Text>
        <Text style={styles.page5IntroSub}>Let's get to know you</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.page5ContentWrap,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
          <ProgressBar current={1} total={9} />
          <Text style={styles.surveyTitle}>Let's get to know you</Text>
          <Text style={styles.surveySubtitle}>This helps AI personalize your health insights.</Text>
          <Text style={styles.surveyQuestion}>What's your age range?</Text>
          <View style={styles.optionsWrap}>
            {opts.map((o) => (
              <OptionBtn
                key={o}
                label={o}
                selected={survey.age_range === o}
                onPress={() => setSurvey({ ...survey, age_range: o })}
              />
            ))}
          </View>
        </ScrollView>
        <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
          <TouchableOpacity
            style={[styles.btn, !survey.age_range && styles.btnDisabled]}
            onPress={onNext}
            disabled={!survey.age_range}
          >
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

function Page6({ onNext, topInset, bottomInset, survey, setSurvey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const opts = ["Male", "Female", "Non-binary", "Prefer not to say"];
  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={2} total={9} />
        <Text style={styles.surveyQuestion}>What's your gender?</Text>
        <View style={styles.optionsWrap}>
          {opts.map((o) => (
            <OptionBtn key={o} label={o} selected={survey.gender === o} onPress={() => setSurvey({ ...survey, gender: o })} />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={[styles.btn, !survey.gender && styles.btnDisabled]} onPress={onNext} disabled={!survey.gender}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page7({ onNext, topInset, bottomInset, survey, setSurvey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const smokeOpts = ["Never", "Occasionally", "Regularly"];
  const alcoholOpts = ["Rarely", "Occasionally", "Regularly"];
  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={3} total={9} />
        <Text style={styles.surveyTitle}>Lifestyle habits</Text>
        <Text style={styles.surveyQuestion}>Do any of these apply to you?</Text>
        <Text style={styles.surveySubLabel}>Smoking</Text>
        <View style={styles.optionsWrap}>
          {smokeOpts.map((o) => (
            <OptionBtn key={o} label={o} selected={survey.smoking === o} onPress={() => setSurvey({ ...survey, smoking: o })} />
          ))}
        </View>
        <Text style={styles.surveySubLabel}>Alcohol</Text>
        <View style={styles.optionsWrap}>
          {alcoholOpts.map((o) => (
            <OptionBtn key={o} label={o} selected={survey.alcohol === o} onPress={() => setSurvey({ ...survey, alcohol: o })} />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page8({ onNext, topInset, bottomInset, survey, setSurvey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const opts = ["Sleep issues", "Fatigue or low energy", "Stress or anxiety", "Digestive discomfort", "Hormonal or metabolic issues", "Chronic condition", "No major concerns"];
  const toggle = (o: string) => {
    const cur = survey.health_concerns ?? [];
    const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    setSurvey({ ...survey, health_concerns: next });
  };
  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={4} total={9} />
        <Text style={styles.surveyQuestion}>Do you currently have any health concerns?</Text>
        <Text style={styles.surveyHint}>(Multiple choice)</Text>
        <View style={styles.optionsWrap}>
          {opts.map((o) => (
            <OptionBtn key={o} label={o} selected={(survey.health_concerns ?? []).includes(o)} onPress={() => toggle(o)} />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page8Chronic({
  onNext,
  topInset,
  bottomInset,
  survey,
  setSurvey,
}: {
  onNext: () => void;
  topInset: number;
  bottomInset: number;
  survey: OnboardingSurvey;
  setSurvey: (s: OnboardingSurvey) => void;
}) {
  const mainOpts = ["Yes", "No"] as const;
  const conditionOpts = [
    "Hypertension",
    "Diabetes",
    "Heart disease",
    "Asthma or COPD",
    "Arthritis",
    "Thyroid disorder",
    "Chronic kidney disease",
    "Depression or anxiety",
    "High cholesterol",
    "Other — add details in Profile later",
  ];
  const showList = survey.chronic_disease_distress === "Yes";
  const toggleCondition = (o: string) => {
    const cur = survey.chronic_conditions ?? [];
    const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    setSurvey({ ...survey, chronic_conditions: next });
  };
  const canContinue =
    survey.chronic_disease_distress === "No" ||
    (survey.chronic_disease_distress === "Yes" && (survey.chronic_conditions?.length ?? 0) > 0);

  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={5} total={9} />
        <Text style={styles.surveyQuestion}>
          Are you currently troubled by any diagnosed chronic condition or ongoing illness?
        </Text>
        <Text style={styles.surveyHint}>(This is separate from general health concerns above.)</Text>
        <View style={styles.optionsWrap}>
          {mainOpts.map((o) => (
            <OptionBtn
              key={o}
              label={o}
              selected={survey.chronic_disease_distress === o}
              onPress={() =>
                setSurvey({
                  ...survey,
                  chronic_disease_distress: o,
                  chronic_conditions: o === "Yes" ? survey.chronic_conditions : undefined,
                })
              }
            />
          ))}
        </View>
        {showList && (
          <>
            <Text style={styles.surveySubLabel}>Select all that apply</Text>
            <View style={styles.optionsWrap}>
              {conditionOpts.map((o) => (
                <OptionBtn
                  key={o}
                  label={o}
                  selected={(survey.chronic_conditions ?? []).includes(o)}
                  onPress={() => toggleCondition(o)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity
          style={[styles.btn, !canContinue && styles.btnDisabled]}
          onPress={onNext}
          disabled={!canContinue}
        >
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page9({ onNext, topInset, bottomInset, survey, setSurvey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const mainOpts = ["Yes", "No", "Not sure"];
  const conditionOpts = ["Heart disease", "Diabetes", "Cancer", "High blood pressure", "Mental health conditions", "Other"];
  const showConditions = survey.family_history === "Yes";
  const toggleCondition = (o: string) => {
    const cur = survey.family_conditions ?? [];
    const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    setSurvey({ ...survey, family_conditions: next });
  };
  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={6} total={9} />
        <Text style={styles.surveyQuestion}>Do you have any known family history of medical conditions?</Text>
        <View style={styles.optionsWrap}>
          {mainOpts.map((o) => (
            <OptionBtn key={o} label={o} selected={survey.family_history === o} onPress={() => setSurvey({ ...survey, family_history: o, family_conditions: o === "Yes" ? survey.family_conditions : undefined })} />
          ))}
        </View>
        {showConditions && (
          <>
            <Text style={styles.surveySubLabel}>Which conditions run in your family?</Text>
            <View style={styles.optionsWrap}>
              {conditionOpts.map((o) => (
                <OptionBtn key={o} label={o} selected={(survey.family_conditions ?? []).includes(o)} onPress={() => toggleCondition(o)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={[styles.btn, !survey.family_history && styles.btnDisabled]} onPress={onNext} disabled={!survey.family_history}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page10({ onNext, topInset, survey, setSurvey }: { onNext: () => void; topInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const opts = ["No", "Yes"];
  return (
    <View style={[styles.page, styles.surveyPage, { paddingTop: 16 + topInset }]}>
      <ProgressBar current={7} total={9} />
      <Text style={styles.surveyQuestion}>Are you currently taking any medications or supplements?</Text>
      <View style={styles.optionsWrap}>
        {opts.map((o) => (
          <OptionBtn key={o} label={o} selected={survey.medications === o} onPress={() => setSurvey({ ...survey, medications: o })} />
        ))}
      </View>
      <TouchableOpacity style={[styles.btn, styles.surveyBtn, !survey.medications && styles.btnDisabled]} onPress={onNext} disabled={!survey.medications}>
        <Text style={styles.btnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

function Page11({ onNext, topInset, bottomInset, survey, setSurvey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const opts = ["Rarely", "Occasionally", "Regularly"];
  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={8} total={9} />
        <Text style={styles.surveyQuestion}>How often do you exercise or do physical activity?</Text>
        <View style={styles.optionsWrap}>
          {opts.map((o) => (
            <OptionBtn key={o} label={o} selected={survey.activity_level === o} onPress={() => setSurvey({ ...survey, activity_level: o })} />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity style={[styles.btn, !survey.activity_level && styles.btnDisabled]} onPress={onNext} disabled={!survey.activity_level}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Page12({ onNext, topInset, bottomInset, survey, setSurvey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey; setSurvey: (s: OnboardingSurvey) => void }) {
  const opts = ["Good", "Fair", "Poor"];
  return (
    <View style={[styles.page, styles.surveyPage, { flex: 1, paddingTop: 16 + topInset }]}>
      <ScrollView style={styles.surveyScroll} contentContainerStyle={styles.surveyScrollContent} showsVerticalScrollIndicator={false}>
        <ProgressBar current={9} total={9} />
        <Text style={styles.surveyQuestion}>How would you describe your sleep quality recently?</Text>
        <View style={styles.optionsWrap}>
          {opts.map((o) => (
            <OptionBtn key={o} label={o} selected={survey.sleep_quality === o} onPress={() => setSurvey({ ...survey, sleep_quality: o })} />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.surveyFooter, { paddingBottom: 24 + bottomInset }]}>
        <TouchableOpacity
          style={[styles.btn, !survey.sleep_quality && styles.btnDisabled]}
          onPress={onNext}
          disabled={!survey.sleep_quality}
        >
          <Text style={styles.btnText}>Create my health profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const AI_STEPS = [
  "Analyzing lifestyle patterns..",
  "Detecting potential risks..",
  "Injecting Context knowledge to Hoot..",
];

function Page13({ onNext, topInset }: { onNext: () => void; topInset: number; bottomInset: number }) {
  const [step, setStep] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % AI_STEPS.length);
    }, 700);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(onNext, 2800);
    return () => clearTimeout(timer);
  }, [onNext]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 320],
  });

  return (
    <View style={[styles.page, styles.analysisPage, { paddingTop: 80 + topInset }]}>
      <Text style={styles.analysisTitle}>Analyzing your health profile...</Text>
      <View style={styles.analysisProgressBg}>
        <Animated.View style={[styles.analysisProgressFill, { width: progressWidth }]} />
      </View>
      <Text style={styles.analysisStep}>{AI_STEPS[step]}</Text>
    </View>
  );
}

function Page14({ onNext, topInset, bottomInset, survey }: { onNext: () => void; topInset: number; bottomInset: number; survey: OnboardingSurvey }) {
  const profile = surveyToUserProfile(survey);
  const result = generateHealthInsight(profile);
  const allNotes = [
    result.primaryInsight,
    result.secondaryParagraph,
    ...result.secondaryNotes,
    ...result.addOnSentences,
  ];
  return (
    <View style={[styles.page, styles.resultsPage, { flex: 1, paddingTop: 24 + topInset }]}>
      <ScrollView
        style={styles.surveyScroll}
        contentContainerStyle={[styles.surveyScrollContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.resultsTitle}>{result.title}</Text>
        <View style={styles.resultsList}>
          {allNotes.map((t, i) => (
            <View key={i} style={styles.resultsItem}>
              <Text style={styles.resultsBullet}>•</Text>
              <Text style={styles.resultsText}>{t}</Text>
            </View>
          ))}
        </View>
        {result.focusAreas.length > 0 && (
          <View style={styles.focusAreasWrap}>
            <Text style={styles.focusAreasLabel}>Focus areas</Text>
            <View style={styles.focusAreasRow}>
              {result.focusAreas.map((area, i) => (
                <View key={i} style={styles.focusAreaChip}>
                  <Text style={styles.focusAreaText}>{area}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <Text style={styles.aiValueText}>{result.aiValueText}</Text>
      </ScrollView>
      <View style={[styles.surveyFooter, styles.surveyFooterFixed, { paddingBottom: 24 + bottomInset }]}>
        <Pressable style={styles.btn} onPress={onNext} android_ripple={{ color: "rgba(255,255,255,0.3)" }}>
          <Text style={styles.btnText}>{result.cta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type PageProps = {
  onNext: () => void;
  topInset: number;
  bottomInset: number;
  survey?: OnboardingSurvey;
  setSurvey?: (s: OnboardingSurvey) => void;
};

const PAGES: Array<(props: PageProps) => JSX.Element> = [
  (props) => <Page1 {...props} />,
  (props) => <Page2 {...props} />,
  (props) => <Page3 {...props} />,
  (props) => <Page4 {...props} />,
  (props) => <Page5 {...props} />,
  (props) => <Page6 {...props} />,
  (props) => <Page7 {...props} />,
  (props) => <Page8 {...props} />,
  (props) => <Page8Chronic {...props} />,
  (props) => <Page9 {...props} />,
  (props) => <Page10 {...props} />,
  (props) => <Page11 {...props} />,
  (props) => <Page12 {...props} />,
  (props) => <Page13 {...props} />,
  (props) => <Page14 {...props} />,
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [survey, setSurvey] = useState<OnboardingSurvey>({});
  const pageOpacity = useRef(new Animated.Value(1)).current;

  const handleNext = async () => {
    if (page < PAGES.length - 1) {
      if (page === 3) {
        Animated.timing(pageOpacity, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }).start(() => {
          setPage(4);
          pageOpacity.setValue(0);
          requestAnimationFrame(() => {
            Animated.timing(pageOpacity, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }).start();
          });
        });
      } else {
        setPage((p) => p + 1);
      }
    } else {
      try {
        await storageSetItem(ONBOARDING_SURVEY_KEY, JSON.stringify(survey));
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await upsertHealthProfile(session.user.id, {
            onboarding_survey: survey,
            gender: survey.gender ?? null,
            family_history:
              survey.family_history && survey.family_conditions?.length
                ? `${survey.family_history}: ${survey.family_conditions.join(", ")}`
                : survey.family_history ?? null,
          });
        }
        router.replace("/pricing");
      } catch (e) {
        if (__DEV__) Alert.alert("Error", String(e));
      }
    }
  };

  const PageComponent = PAGES[page];
  const showDots = page < 4;

  const skipOnboarding = async () => {
    await storageSetItem(ONBOARDING_KEY, "1");
    router.replace("/pricing");
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.skipOnboardingBtn, { top: 16 + insets.top }]}
        onPress={skipOnboarding}
      >
        <Text style={styles.skipOnboardingBtnText}>Skip (test)</Text>
      </TouchableOpacity>
      <Animated.View style={[styles.scrollWrap, { opacity: pageOpacity }]} key={String(page)}>
        <PageComponent onNext={handleNext} topInset={insets.top} bottomInset={insets.bottom} survey={survey} setSurvey={setSurvey} />
      </Animated.View>
      {showDots && (
        <View style={styles.dots}>
          {PAGES.slice(0, 4).map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const v = await storageGetItem(ONBOARDING_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export async function getOnboardingSurvey(): Promise<OnboardingSurvey | null> {
  try {
    const raw = await storageGetItem(ONBOARDING_SURVEY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingSurvey;
  } catch {
    return null;
  }
}

export async function clearOnboardingSurvey(): Promise<void> {
  try {
    await storageRemoveItem(ONBOARDING_SURVEY_KEY);
  } catch {}
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  skipOnboardingBtn: {
    position: "absolute",
    right: 20,
    zIndex: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(224, 124, 60, 0.2)",
    borderRadius: 10,
  },
  skipOnboardingBtnText: {
    fontSize: 13,
    color: THEME.accent,
    fontWeight: "500",
    fontFamily: FONT_SANS_MEDIUM,
  },
  scrollWrap: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 28 },
  pageWithFooter: { flex: 1 },
  page1Content: { flex: 1, justifyContent: "center" },
  surveyScroll: { flex: 1 },
  surveyScrollContent: { flexGrow: 1, paddingBottom: 24 },
  surveyFooter: { paddingTop: 20 },
  surveyFooterFixed: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 0,
    zIndex: 10,
    backgroundColor: THEME.bg,
  },
  pagePadding: { paddingTop: 48, paddingBottom: 24 },
  page1Title: {
    fontSize: 28,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    textAlign: "center",
    lineHeight: 38,
    marginBottom: 24,
  },
  page1SubtitleWrap: { marginBottom: 48 },
  page1Subtitle: {
    fontSize: 17,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    textAlign: "center",
    lineHeight: 26,
  },
  page2Label: {
    fontSize: 14,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  page2Question: {
    fontSize: 22,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    lineHeight: 30,
    marginBottom: 16,
  },
  page2Fact: {
    fontSize: 18,
    fontFamily: FONT_SERIF,
    fontStyle: "italic",
    color: THEME.accent,
    marginBottom: 20,
  },
  page2BodyWrap: { marginBottom: 32 },
  page2Body: {
    fontSize: 16,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 26,
  },
  page3Title: {
    fontSize: 24,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 24,
  },
  page3Block: {
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#f5f5f3",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: THEME.accent,
  },
  page3BlockTitle: {
    fontSize: 16,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 8,
  },
  page3BlockText: {
    fontSize: 15,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 24,
  },
  page3Bullet: {
    fontSize: 15,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 24,
    marginLeft: 8,
    marginTop: 4,
  },
  page3Closing: {
    fontSize: 14,
    fontFamily: FONT_SERIF,
    fontStyle: "italic",
    color: THEME.textMuted,
    marginBottom: 32,
  },
  page4Title: {
    fontSize: 26,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 20,
  },
  page4TextWrap: { marginBottom: 20 },
  page4Text: {
    fontSize: 17,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 26,
  },
  page4ListWrap: { marginBottom: 28 },
  page4Item: {
    fontSize: 16,
    fontFamily: FONT_SERIF,
    color: THEME.text,
    lineHeight: 28,
  },
  page4NoteWrap: { marginBottom: 32 },
  page4Note: {
    fontSize: 14,
    fontFamily: FONT_SERIF,
    fontStyle: "italic",
    color: THEME.textMuted,
    lineHeight: 22,
  },
  btnWrap: { marginTop: 32 },
  btn: {
    height: 48,
    backgroundColor: THEME.accent,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 24,
    paddingTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e0e0de",
  },
  dotActive: { backgroundColor: THEME.accent },
  page5IntroWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    zIndex: 10,
  },
  page5IntroTitle: {
    fontSize: 26,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.text,
    textAlign: "center",
    lineHeight: 36,
    marginBottom: 12,
  },
  page5IntroSub: {
    fontSize: 18,
    fontFamily: FONT_SANS,
    color: THEME.textMuted,
    textAlign: "center",
  },
  page5ContentWrap: { flex: 1 },
  progressWrap: { marginBottom: 24 },
  progressBg: {
    height: 4,
    backgroundColor: "#e8e8e6",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: THEME.accent,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontFamily: FONT_SANS,
    color: THEME.textMuted,
    marginTop: 6,
  },
  surveyPage: { paddingBottom: 40 },
  surveyTitle: {
    fontSize: 24,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 8,
  },
  surveySubtitle: {
    fontSize: 15,
    fontFamily: FONT_SANS,
    color: THEME.textMuted,
    marginBottom: 24,
    lineHeight: 22,
  },
  surveyQuestion: {
    fontSize: 18,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 16,
  },
  surveyHint: { fontSize: 13, color: THEME.textMuted, marginBottom: 12, fontFamily: FONT_SANS },
  surveySubLabel: {
    fontSize: 14,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.textMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  optionsWrap: { gap: 10, marginBottom: 8 },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e8e8e6",
    backgroundColor: "#fff",
  },
  optionBtnActive: {
    borderColor: THEME.accent,
    backgroundColor: "#fef5f0",
  },
  optionBtnText: { fontSize: 16, fontFamily: FONT_SANS, color: THEME.text },
  optionBtnTextActive: { color: THEME.accent, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  surveyBtn: { marginTop: 28 },
  btnDisabled: { opacity: 0.5 },
  analysisPage: { justifyContent: "center", alignItems: "center" },
  analysisTitle: {
    fontSize: 20,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 24,
  },
  analysisProgressBg: {
    height: 6,
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#e8e8e6",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 24,
  },
  analysisProgressFill: {
    height: "100%",
    backgroundColor: THEME.accent,
    borderRadius: 3,
  },
  analysisStep: {
    fontSize: 15,
    fontFamily: FONT_SANS,
    color: THEME.textMuted,
  },
  resultsPage: { paddingBottom: 40 },
  resultsTitle: {
    fontSize: 24,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 24,
  },
  resultsList: { marginBottom: 32 },
  resultsItem: { flexDirection: "row", marginBottom: 12, alignItems: "flex-start" },
  resultsBullet: { fontSize: 16, color: THEME.accent, marginRight: 8 },
  resultsText: { flex: 1, fontSize: 16, fontFamily: FONT_SERIF, color: THEME.text, lineHeight: 24 },
  focusAreasWrap: { marginBottom: 24 },
  focusAreasLabel: {
    fontSize: 14,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.textMuted,
    marginBottom: 10,
  },
  focusAreasRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  focusAreaChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#f5f5f3",
  },
  focusAreaText: { fontSize: 14, fontFamily: FONT_SERIF, color: THEME.text },
  aiValueText: {
    fontSize: 14,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 22,
    marginBottom: 24,
  },
});

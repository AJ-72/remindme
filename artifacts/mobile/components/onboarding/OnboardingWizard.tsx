import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import PersonaComparisonSheet from "@/components/PersonaComparisonSheet";
import {
  DEFAULT_PERSONA_TYPE,
  PERSONA_PROFILES,
  QUIZ_QUESTIONS,
} from "@/constants/personas";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import {
  hasCompletedOnboarding,
  markOnboardingCompleted,
} from "@/services/ReminderService";
import { PersonaType } from "@/types/persona";
import { getFontFamily } from "@/utils/getFontFamily";
import { calculatePersonaFromChoices } from "@/utils/personaScoring";

export const MAX_NAME_LENGTH = 40;

type OnboardingStep = "name" | "quiz" | "reveal";

interface Props {
  /** Gate from the root layout, true once permission onboarding has settled. */
  enabled: boolean;
  /** Optional override to force modal visibility (e.g. when re-taking quiz from Settings). */
  forceVisible?: boolean;
  /** Callback fired when onboarding or quiz finishes. */
  onDismiss?: () => void;
}

export default function OnboardingWizard({
  enabled,
  forceVisible = false,
  onDismiss,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userName, setUserName, setPersona } = useReminders();

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("name");
  const [name, setName] = useState(userName);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<PersonaType[]>([]);
  const [computedPersona, setComputedPersona] =
    useState<PersonaType>(DEFAULT_PERSONA_TYPE);
  const [comparisonVisible, setComparisonVisible] = useState(false);

  useEffect(() => {
    if (forceVisible) {
      setVisible(true);
      setStep("quiz"); // When opened from settings, start at quiz
      setQuestionIndex(0);
      setAnswers([]);
      return;
    }

    if (!enabled) return;
    let cancelled = false;
    hasCompletedOnboarding().then((completed) => {
      if (!cancelled && !completed) {
        setVisible(true);
        setStep("name");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, forceVisible]);

  useEffect(() => {
    setName(userName);
  }, [userName]);

  const handleNameContinue = async () => {
    if (name.trim()) {
      await setUserName(name.trim());
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("quiz");
    setQuestionIndex(0);
    setAnswers([]);
  };

  const handleNameSkip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("quiz");
    setQuestionIndex(0);
    setAnswers([]);
  };

  const handleSelectChoice = (target: PersonaType) => {
    Haptics.selectionAsync();
    const nextAnswers = [...answers];
    nextAnswers[questionIndex] = target;
    setAnswers(nextAnswers);

    if (questionIndex < QUIZ_QUESTIONS.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      const winner = calculatePersonaFromChoices(nextAnswers);
      setComputedPersona(winner);
      setStep("reveal");
    }
  };

  const handleQuizSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setComputedPersona(DEFAULT_PERSONA_TYPE);
    setStep("reveal");
  };

  const handleFinish = async () => {
    await setPersona(computedPersona, true);
    await markOnboardingCompleted();
    setVisible(false);
    onDismiss?.();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const currentQuestion = QUIZ_QUESTIONS[questionIndex];
  const revealedProfile =
    PERSONA_PROFILES[computedPersona] ??
    PERSONA_PROFILES[DEFAULT_PERSONA_TYPE];

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardAvoid: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === "web" ? 24 : 16),
      paddingBottom: insets.bottom + 24,
      justifyContent: "space-between",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    stepPill: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      backgroundColor: colors.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      alignSelf: "flex-start",
    },
    skipText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 21,
      marginBottom: 20,
    },
    inputCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    input: {
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    privacyNotice: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 8,
      lineHeight: 17,
    },
    choicesList: {
      gap: 12,
      marginBottom: 20,
    },
    choiceCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    choiceCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "0A",
    },
    choiceText: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      lineHeight: 20,
      marginRight: 10,
    },
    revealBadgeContainer: {
      alignItems: "center",
      marginVertical: 12,
    },
    revealBadge: {
      fontSize: 54,
      marginBottom: 8,
    },
    revealTag: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      backgroundColor: colors.primary + "18",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: 8,
    },
    revealName: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 4,
    },
    revealTagline: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 16,
    },
    revealDescriptionCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    revealDescription: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 19,
      marginBottom: 12,
    },
    adaptationSummary: {
      backgroundColor: colors.muted + "90",
      borderRadius: 12,
      padding: 12,
      gap: 6,
    },
    adaptationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    adaptationText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    compareBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      marginBottom: 12,
    },
    compareBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    buttonContainer: {
      marginTop: "auto",
      paddingTop: 12,
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtn: {
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={step === "reveal" ? handleFinish : undefined}
    >
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoid}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            testID="onboarding-scroll-view"
          >
            {step === "name" && (
              <View>
                <View style={styles.headerRow}>
                  <Text style={styles.stepPill}>Step 1 of 2</Text>
                  <Pressable onPress={handleNameSkip} testID="onboarding-name-skip">
                    <Text style={styles.skipText}>Skip</Text>
                  </Pressable>
                </View>

                <Text style={styles.title}>Welcome to Reminders</Text>
                <Text style={styles.subtitle}>
                  Let's personalize your setup in 1 minute so the app works the way you
                  do.
                </Text>

                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>What should we call you?</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { fontFamily: getFontFamily(name, "400Regular") },
                    ]}
                    placeholder="Your name"
                    placeholderTextColor={colors.mutedForeground}
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_NAME_LENGTH}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={handleNameContinue}
                    testID="onboarding-name-input"
                  />
                  <Text style={styles.privacyNotice}>
                    Used to greet you and sign your reminders. It stays 100% on this
                    device.
                  </Text>
                </View>
              </View>
            )}

            {step === "quiz" && currentQuestion && (
              <View>
                <View style={styles.headerRow}>
                  <Text style={styles.stepPill}>
                    Quiz {questionIndex + 1} of {QUIZ_QUESTIONS.length}
                  </Text>
                  <Pressable onPress={handleQuizSkip} testID="onboarding-quiz-skip">
                    <Text style={styles.skipText}>Skip</Text>
                  </Pressable>
                </View>

                <Text style={styles.title}>{currentQuestion.title}</Text>
                {currentQuestion.subtitle && (
                  <Text style={styles.subtitle}>{currentQuestion.subtitle}</Text>
                )}

                <View style={styles.choicesList}>
                  {currentQuestion.choices.map((choice) => {
                    const isSelected = answers[questionIndex] === choice.personaTarget;
                    return (
                      <Pressable
                        key={choice.id}
                        style={[
                          styles.choiceCard,
                          isSelected && styles.choiceCardSelected,
                        ]}
                        onPress={() => handleSelectChoice(choice.personaTarget)}
                        testID={`quiz-choice-${choice.id}`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.choiceText}>{choice.text}</Text>
                        <Feather
                          name={isSelected ? "check-circle" : "circle"}
                          size={18}
                          color={isSelected ? colors.primary : colors.mutedForeground}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {step === "reveal" && (
              <View>
                <View style={styles.revealBadgeContainer}>
                  <Text style={styles.revealBadge}>{revealedProfile.badge}</Text>
                  <Text style={styles.revealTag}>Your Reminder Style</Text>
                  <Text style={styles.revealName}>{revealedProfile.name}</Text>
                  <Text style={styles.revealTagline}>{revealedProfile.tagline}</Text>
                </View>

                <View style={styles.revealDescriptionCard}>
                  <Text style={styles.revealDescription}>
                    {revealedProfile.description}
                  </Text>

                  <View style={styles.adaptationSummary}>
                    <View style={styles.adaptationRow}>
                      <Feather name="bell" size={14} color={colors.primary} />
                      <Text style={styles.adaptationText}>
                        {revealedProfile.adaptations.leadTimeMinutes === 0
                          ? "Alerts on time"
                          : `${revealedProfile.adaptations.leadTimeMinutes}m advance heads-up`}
                      </Text>
                    </View>
                    <View style={styles.adaptationRow}>
                      <Feather name="clock" size={14} color={colors.primary} />
                      <Text style={styles.adaptationText}>
                        {revealedProfile.adaptations.defaultSnoozeMinutes}m default snooze •{" "}
                        {revealedProfile.adaptations.tone}
                      </Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  style={styles.compareBtn}
                  onPress={() => setComparisonVisible(true)}
                  testID="onboarding-view-all-profiles"
                >
                  <Feather name="info" size={15} color={colors.primary} />
                  <Text style={styles.compareBtnText}>
                    See all 4 styles & comparison table
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.buttonContainer}>
              {step === "name" && (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={handleNameContinue}
                  testID="onboarding-name-continue"
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </Pressable>
              )}

              {step === "quiz" && (
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={handleQuizSkip}
                  testID="onboarding-quiz-bottom-skip"
                >
                  <Text style={styles.secondaryBtnText}>Skip and use standard style</Text>
                </Pressable>
              )}

              {step === "reveal" && (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={handleFinish}
                  testID="onboarding-finish-btn"
                >
                  <Text style={styles.primaryBtnText}>Start using Reminders</Text>
                </Pressable>
              )}
            </View>
          </KeyboardAwareScrollViewCompat>
        </KeyboardAvoidingView>

        <PersonaComparisonSheet
          visible={comparisonVisible}
          activePersona={computedPersona}
          onSelectPersona={async (p) => {
            setComputedPersona(p);
            setComparisonVisible(false);
          }}
          onClose={() => setComparisonVisible(false)}
        />
      </View>
    </Modal>
  );
}

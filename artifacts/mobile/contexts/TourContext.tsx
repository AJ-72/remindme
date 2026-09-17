import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { FEATURE_TOUR_STEPS, TourStep } from "@/constants/featureTour";
import { markFeatureTourSeen } from "@/services/ReminderService";

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The subset of RN's NativeMethods that measuring needs. View, TextInput and
 * Pressable-wrapped Views all satisfy this, so one hook works as a ref for
 * any of them - a tour target is never one specific component type.
 */
interface Measurable {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}

interface TourContextValue {
  active: boolean;
  stepIndex: number;
  step: TourStep | null;
  isLastStep: boolean;
  /** Starts the tour from its first step, regardless of the "seen" flag - used by the on-demand replay. */
  start: () => void;
  next: () => void;
  skip: () => void;
  /** Registers the measurable element for a step's targetId. Returns an unregister function. */
  registerTarget: (id: string, ref: Measurable) => () => void;
  /** Looks up the current window rect of a registered target, or null if unregistered/unmeasurable. */
  measureTarget: (id: string) => Promise<TourRect | null>;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const targets = useRef(new Map<string, Measurable>()).current;

  const registerTarget = useCallback(
    (id: string, ref: Measurable) => {
      targets.set(id, ref);
      return () => {
        if (targets.get(id) === ref) targets.delete(id);
      };
    },
    [targets],
  );

  const measureTarget = useCallback(
    (id: string): Promise<TourRect | null> => {
      const node = targets.get(id);
      if (!node) return Promise.resolve(null);
      return new Promise((resolve) => {
        node.measureInWindow((x, y, width, height) => {
          if (!width || !height) {
            resolve(null);
            return;
          }
          resolve({ x, y, width, height });
        });
      });
    },
    [targets],
  );

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    markFeatureTourSeen();
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const nextIndex = i + 1;
      if (nextIndex >= FEATURE_TOUR_STEPS.length) {
        finish();
        return i;
      }
      return nextIndex;
    });
  }, [finish]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const step = active ? FEATURE_TOUR_STEPS[stepIndex] : null;
  const isLastStep = stepIndex === FEATURE_TOUR_STEPS.length - 1;

  const value = useMemo(
    () => ({
      active,
      stepIndex,
      step,
      isLastStep,
      start,
      next,
      skip,
      registerTarget,
      measureTarget,
    }),
    [active, stepIndex, step, isLastStep, start, next, skip, registerTarget, measureTarget],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

/**
 * Attach the returned ref to the element a tour step should spotlight,
 * matching a `targetId` in constants/featureTour.ts. Registration is
 * unconditional (cheap - just a Map entry) so a step whose screen isn't
 * mounted simply has nothing registered, which TourOverlay already treats
 * as "no spotlight" rather than an error.
 */
export function useTourTarget(id: string) {
  // Reads the context directly rather than via useTour(): a component using
  // this hook (QuickAddInput, the home header, Settings) has to keep
  // rendering standalone in tests that don't mount TourProvider, the same
  // way useColors() tolerates a missing ThemeProvider. No provider just
  // means nothing gets registered - not a crash.
  const ctx = useContext(TourContext);
  const setRef = useCallback(
    (node: Measurable | null) => {
      if (node && ctx) ctx.registerTarget(id, node);
    },
    [id, ctx],
  );
  return setRef;
}

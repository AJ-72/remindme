// Dedicated headless entry point.
// TaskManager.defineTask must be registered before the JS runtime is
// suspended for background/boot execution. Importing this file as a
// side-effect ensures defineTask is called as soon as the bundle loads,
// regardless of whether a React UI component ever mounts.
import "./tasks/rescheduleTask";
// Same reasoning: Mark Done / Snooze are delivered without opening the app,
// so their handler must be defined at bundle load rather than by a mounted
// React component that isn't running.
import "./tasks/notificationResponseTask";

// Load Expo Router as the root navigator.
import "expo-router/entry";

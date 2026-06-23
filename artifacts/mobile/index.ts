// Dedicated headless entry point.
// TaskManager.defineTask must be registered before the JS runtime is
// suspended for background/boot execution. Importing this file as a
// side-effect ensures defineTask is called as soon as the bundle loads,
// regardless of whether a React UI component ever mounts.
import "./tasks/rescheduleTask";

// Load Expo Router as the root navigator.
import "expo-router/entry";

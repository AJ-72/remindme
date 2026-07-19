module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  moduleNameMapper: {
    "^@react-native-async-storage/async-storage$":
      "@react-native-async-storage/async-storage/jest/async-storage-mock",
    "^react-native-keyboard-controller$":
      "react-native-keyboard-controller/jest",
    "^@/(.*)$": "<rootDir>/$1",
  },
  // NOTE: no custom transformIgnorePatterns. The jest-expo preset ships a
  // pnpm-aware default (it allow-lists the `.pnpm` store, so every package —
  // react-native, expo, chrono-node, etc. — gets transformed). Overriding it
  // with a flat-node_modules pattern breaks under pnpm's nested layout and
  // leaves react-native/jest/setup.js untransformed ("Cannot use import
  // statement outside a module").
};

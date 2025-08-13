export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!@microsoft/kiota-http-fetchlibrary).+\\.js$',
  ],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  testMatch: ['**/**/*.test.ts'],
};
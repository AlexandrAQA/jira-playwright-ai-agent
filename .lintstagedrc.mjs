export default {
  '*.{ts,mjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  // The generated-test gate always scans the whole folder, so it must not get
  // the staged paths appended to it: a function config returns the bare command.
  'tests/generated/*.spec.ts': () => 'tsx scripts/lint-generated-tests.ts',
};

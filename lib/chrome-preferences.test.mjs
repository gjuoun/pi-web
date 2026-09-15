import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  COMPOSER_HIDDEN_STORAGE_KEY,
  DEFAULT_CHROME_PREFERENCES,
  getChromePreferences,
  readChromePreferences,
  resetChromePreferences,
  setChromePreference,
  subscribeChromePreferences,
} = await jiti.import("./chrome-preferences.ts");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("defaults both toggles to false when there is no storage", () => {
  assert.deepEqual(DEFAULT_CHROME_PREFERENCES, { composerHidden: false });
  assert.deepEqual(readChromePreferences(null), DEFAULT_CHROME_PREFERENCES);
  assert.deepEqual(readChromePreferences(createStorage()), DEFAULT_CHROME_PREFERENCES);
});

test("reads the toggle from its own key, and ignores the retired fold key", () => {
  assert.deepEqual(
    readChromePreferences(createStorage({ [COMPOSER_HIDDEN_STORAGE_KEY]: "true" })),
    { composerHidden: true },
  );
  // The fold was removed; a stale key from an earlier build must not resurrect anything.
  assert.deepEqual(
    readChromePreferences(createStorage({ "pi-chat-status-bar-folded": "true" })),
    { composerHidden: false },
  );
});

test("treats anything but the exact string true as false", () => {
  for (const junk of ["1", "yes", "TRUE", "True", "", "false", "null", "{}"]) {
    assert.deepEqual(
      readChromePreferences(createStorage({ [COMPOSER_HIDDEN_STORAGE_KEY]: junk })),
      { composerHidden: false },
      `junk value ${JSON.stringify(junk)} must fall back to the default`,
    );
  }
});

test("falls back to the defaults when storage throws", () => {
  const throwing = {
    getItem() {
      throw new Error("storage disabled");
    },
  };
  assert.deepEqual(readChromePreferences(throwing), DEFAULT_CHROME_PREFERENCES);
});

test("uses the documented storage key", () => {
  assert.equal(COMPOSER_HIDDEN_STORAGE_KEY, "pi-chat-composer-hidden");
});

test("updates the snapshot and notifies subscribers", () => {
  resetChromePreferences();
  const seen = [];
  const unsubscribe = subscribeChromePreferences(() => seen.push(getChromePreferences()));

  setChromePreference("composerHidden", true);
  assert.deepEqual(getChromePreferences(), { composerHidden: true });
  assert.equal(seen.length, 1, "a change must notify once");
  assert.deepEqual(seen[0], { composerHidden: true });

  unsubscribe();
  setChromePreference("composerHidden", false);
  assert.equal(seen.length, 1, "an unsubscribed listener must not be called again");
  assert.deepEqual(getChromePreferences(), { composerHidden: false });

  resetChromePreferences();
  assert.deepEqual(getChromePreferences(), DEFAULT_CHROME_PREFERENCES);
});

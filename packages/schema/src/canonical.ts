const encoder = new TextEncoder();
/**
 * Key order for canonical JSON. Pinned to one collator so hashes never depend on the user's
 * locale; it matches the original `localeCompare` order, keeping stored run hashes verifiable.
 * This app hash is authoritative; the physics core's own scenario hash is internal to it.
 */
const keyCollator = new Intl.Collator("en");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }

  if (isRecord(value)) {
    const sortedKeys = Object.keys(value).sort(keyCollator.compare);
    const normalized: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      normalized[key] = canonicalizeValue(value[key]);
    }

    return normalized;
  }

  return value;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

export const canonicalJsonStringify = (input: unknown): string =>
  JSON.stringify(canonicalizeValue(input));

export const canonicalizeScenarioJson = (input: unknown): string => {
  return canonicalJsonStringify(input);
};

export const sha256Hex = async (input: string): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is unavailable");
  }

  const digest = await subtle.digest("SHA-256", encoder.encode(input));
  return toHex(new Uint8Array(digest));
};

export const hashScenario = async (input: unknown): Promise<string> => {
  const canonical = canonicalizeScenarioJson(input);
  return sha256Hex(canonical);
};

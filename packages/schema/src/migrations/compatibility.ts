export const compatibilityKinds = ["scenario", "protocol", "frame-layout", "persistence"] as const;
export type CompatibilityKind = (typeof compatibilityKinds)[number];

export type CompatibilityEntry = {
  version: number;
  status: "current" | "migratable";
  migratesTo: number | null;
};

export const compatibilityRegistry: Record<CompatibilityKind, readonly CompatibilityEntry[]> = {
  scenario: [
    { version: 1, status: "migratable", migratesTo: 2 },
    { version: 2, status: "migratable", migratesTo: 3 },
    { version: 3, status: "current", migratesTo: null }
  ],
  protocol: [
    { version: 1, status: "migratable", migratesTo: 2 },
    { version: 2, status: "migratable", migratesTo: 3 },
    { version: 3, status: "current", migratesTo: null }
  ],
  "frame-layout": [
    { version: 1, status: "migratable", migratesTo: 2 },
    { version: 2, status: "current", migratesTo: null }
  ],
  persistence: [
    { version: 1, status: "migratable", migratesTo: 2 },
    { version: 2, status: "current", migratesTo: null }
  ]
};

export const assertCompatibleVersion = (
  kind: CompatibilityKind,
  version: number
): CompatibilityEntry => {
  const entry = compatibilityRegistry[kind].find((candidate) => candidate.version === version);
  if (!entry) throw new Error(`Unsupported ${kind} version: ${version}`);
  return entry;
};

export const resolveMigrationPath = (kind: CompatibilityKind, fromVersion: number): number[] => {
  const path = [fromVersion];
  let entry = assertCompatibleVersion(kind, fromVersion);
  const visited = new Set(path);
  while (entry.migratesTo !== null) {
    if (visited.has(entry.migratesTo)) throw new Error(`Cyclic ${kind} migration registry`);
    path.push(entry.migratesTo);
    visited.add(entry.migratesTo);
    entry = assertCompatibleVersion(kind, entry.migratesTo);
  }
  return path;
};

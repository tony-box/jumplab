import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const transitions = {
  draft: ["provisionally-approved"],
  "provisionally-approved": ["evidence-complete"],
  "evidence-complete": ["approved"],
  approved: ["superseded"],
  superseded: []
};

export const validateEvidenceFreshness = (evidence, now = new Date(), maximumAgeDays = 60) => {
  const cutoff = now.getTime() - maximumAgeDays * 86_400_000;
  const stale = evidence.filter((item) => {
    const observed = Date.parse(item.observedAt);
    return Number.isNaN(observed) || observed < cutoff;
  });
  if (stale.length > 0)
    throw new Error(`Stale evidence: ${stale.map((item) => item.id).join(", ")}`);
};

export const validateExceptions = (exceptions, now = new Date()) => {
  const expired = exceptions.filter(
    (exception) => Date.parse(exception.expiresAt) <= now.getTime()
  );
  if (expired.length > 0)
    throw new Error(`Expired exceptions: ${expired.map((item) => item.id).join(", ")}`);
};

export const transitionDecision = (record, targetStatus, options = {}) => {
  if (!(transitions[record.status] ?? []).includes(targetStatus)) {
    throw new Error(`Invalid decision transition: ${record.status} -> ${targetStatus}`);
  }
  const actor = options.actor?.trim();
  if (!actor) throw new Error("A named approval actor is required");
  const timestamp = options.at ?? new Date().toISOString();
  const next = JSON.parse(JSON.stringify(record));
  next.status = targetStatus;

  if (targetStatus === "provisionally-approved") {
    next.provisionallyApprovedBy = actor;
    next.provisionallyApprovedAt = timestamp;
  }
  if (targetStatus === "evidence-complete") {
    validateEvidenceFreshness(
      options.evidence ?? [],
      new Date(timestamp),
      options.maximumAgeDays ?? 60
    );
    validateExceptions(options.exceptions ?? [], new Date(timestamp));
  }
  if (targetStatus === "approved") {
    if (!options.maintainerSignoff) throw new Error("Maintainer sign-off is required for approval");
    next.approvedBy = actor;
    next.approvedAt = timestamp;
  }
  if (targetStatus === "superseded") {
    if (!record.approvedBy || !record.approvedAt)
      throw new Error("Only approved decisions can be superseded");
    if (!options.supersedes) throw new Error("Supersession requires the replacement decision id");
    next.supersedes = options.supersedes;
  }
  return next;
};

const runFromCli = () => {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2)
    args.set(process.argv[index], process.argv[index + 1]);
  const decisionPath = args.get("--decision");
  const status = args.get("--status");
  const actor = args.get("--actor");
  if (!decisionPath || !status || !actor)
    throw new Error("Usage: --decision <json> --status <status> --actor <name>");
  const absolutePath = resolve(decisionPath);
  const record = JSON.parse(readFileSync(absolutePath, "utf8"));
  const next = transitionDecision(record, status, {
    actor,
    maintainerSignoff: args.get("--maintainer-signoff") === "true",
    supersedes: args.get("--supersedes"),
    evidence: args.get("--evidence")
      ? JSON.parse(readFileSync(resolve(args.get("--evidence")), "utf8")).evidence
      : []
  });
  writeFileSync(absolutePath, `${JSON.stringify(next, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runFromCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

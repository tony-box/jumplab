import { z } from "zod";

export * from "./canonical";
export * from "./decision";
export * from "./input-contract";
export * from "./input-contracts/spike-controls";
export * from "./application";
export * from "./migrations/index";
export * from "./migrations/compatibility";
export * from "./run-result";
export * from "./scenario";
export * from "./worker-protocol";

export const schemaPackageInfo = z
  .object({
    name: z.literal("@bike-jumper/schema"),
    version: z.string()
  })
  .strict();

export type SchemaPackageInfo = z.infer<typeof schemaPackageInfo>;

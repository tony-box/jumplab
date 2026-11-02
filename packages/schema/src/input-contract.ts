import { z } from "zod";

const finiteNumber = z.number().refine(Number.isFinite, "Expected a finite number");

export const inputControlContractSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    unit: z.string().min(1),
    minimum: finiteNumber,
    maximum: finiteNumber,
    step: finiteNumber.positive(),
    group: z.enum(["jump", "landing", "entry", "rider", "bike"]),
    physicalQuantity: z.string().min(1),
    explanation: z.string().min(1),
    scenarioPath: z.string().regex(/^scenario\.[A-Za-z0-9_.]+$/, "Expected canonical scenario path")
  })
  .strict()
  .superRefine((value, context) => {
    if (value.minimum >= value.maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minimum must be less than maximum",
        path: ["minimum"]
      });
    }

    if (value.step > value.maximum - value.minimum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "step must not exceed the control range",
        path: ["step"]
      });
    }
  });

export const inputControlContractsSchema = z
  .array(inputControlContractSchema)
  .superRefine((value, context) => {
    const seenIds = new Set<string>();
    const seenScenarioPaths = new Set<string>();

    for (const [index, contract] of value.entries()) {
      if (seenIds.has(contract.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Input control id values must be unique",
          path: [index, "id"]
        });
      }
      seenIds.add(contract.id);

      if (seenScenarioPaths.has(contract.scenarioPath)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "scenarioPath values must be unique",
          path: [index, "scenarioPath"]
        });
      }
      seenScenarioPaths.add(contract.scenarioPath);
    }
  });

export type InputControlContract = z.infer<typeof inputControlContractSchema>;

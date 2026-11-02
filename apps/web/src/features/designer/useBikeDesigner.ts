import { useCallback, useEffect, useRef, useState } from "react";

import {
  bikeSpecSchema,
  type BikeGeometryInspection,
  type BikeSpec,
  type DesignValidation,
  type GeometryIssue,
  type Scenario
} from "../../../../../packages/schema/src/index";
import { useAppServices } from "../../app/AppProviders";
import { selectStoreActions, useAppStore } from "../../state/store";
import {
  bikeDimensionGroups,
  fromBikeDisplayValue,
  toBikeDisplayValue,
  type BikeDimensionField,
  type BikeDimensionPath
} from "./bike-dimensions";

type DraftValues = Record<BikeDimensionPath, number>;

const fields = bikeDimensionGroups.flatMap((group) => group.fields);

const valueAt = (bike: BikeSpec, path: BikeDimensionPath): number => {
  const [owner, key] = path.split(".") as [string, string | undefined];
  if (!key) return bike[owner as "wheelSize" | "wheelbase" | "chainstay" | "bbHeight" | "mass"];
  if (owner === "geometry") return bike.geometry[key as keyof BikeSpec["geometry"]];
  const suspension = owner === "fork" ? bike.fork : bike.rearShock;
  return suspension?.[key as keyof BikeSpec["fork"]] ?? 0;
};

const valuesFromBike = (bike: BikeSpec): DraftValues =>
  Object.fromEntries(
    fields.map((field) => [field.path, toBikeDisplayValue(valueAt(bike, field.path), field.unit)])
  ) as DraftValues;

const setPath = (bike: BikeSpec, field: BikeDimensionField, displayValue: number): BikeSpec => {
  const value = fromBikeDisplayValue(displayValue, field.unit);
  const [owner, key] = field.path.split(".") as [string, string | undefined];
  if (!key) return { ...bike, [owner]: value };
  if (owner === "geometry") {
    return { ...bike, geometry: { ...bike.geometry, [key]: value } };
  }
  const suspension = owner === "fork" ? bike.fork : bike.rearShock;
  if (!suspension) return bike;
  return { ...bike, [owner]: { ...suspension, [key]: value } };
};

const bikeFromValues = (base: BikeSpec, values: DraftValues): BikeSpec =>
  fields.reduce((bike, field) => setPath(bike, field, values[field.path]), base);

const rangeIssues = (values: DraftValues): GeometryIssue[] =>
  fields.flatMap((field) => {
    const value = values[field.path];
    if (Number.isFinite(value) && value >= field.minimum && value <= field.maximum) return [];
    return [
      {
        code: "field-range" as const,
        fields: [field.path],
        bikeParts: [],
        message: `${field.label} must be within the supported range ${field.minimum} to ${field.maximum} ${field.unit}.`
      }
    ];
  });

export const useBikeDesigner = (scenario: Scenario | null) => {
  const services = useAppServices();
  const actions = useAppStore(selectStoreActions);
  const [values, setValues] = useState<DraftValues | null>(() =>
    scenario ? valuesFromBike(scenario.bike) : null
  );
  const [draftBike, setDraftBike] = useState<BikeSpec | null>(scenario?.bike ?? null);
  const [inspection, setInspection] = useState<BikeGeometryInspection | null>(null);
  const [validation, setValidation] = useState<DesignValidation | null>(null);
  const [issues, setIssues] = useState<GeometryIssue[]>([]);
  const [status, setStatus] = useState<"idle" | "pending" | "valid" | "invalid" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const appliedBikeRef = useRef<string | null>(scenario ? JSON.stringify(scenario.bike) : null);
  const riderRef = useRef<string | null>(scenario ? JSON.stringify(scenario.rider) : null);

  const inspectAndApply = useCallback(
    async (candidateBike: BikeSpec, candidateValues: DraftValues, apply: boolean) => {
      if (!scenario) return;
      const requestId = ++requestRef.current;
      setStatus("pending");
      setError(null);
      try {
        const nextInspection = await services.solverGateway.inspectBikeGeometry(candidateBike);
        if (requestId !== requestRef.current) return;
        setInspection(nextInspection);
        setIssues(nextInspection.issues);
        if (!nextInspection.valid) {
          setStatus("invalid");
          return;
        }
        const candidateScenario = { ...scenario, bike: candidateBike };
        const nextValidation = await services.solverGateway.validateDesign(candidateScenario);
        if (requestId !== requestRef.current) return;
        setValidation(nextValidation);
        setStatus("valid");
        if (apply) {
          appliedBikeRef.current = JSON.stringify(candidateBike);
          actions.updateScenario((current) => ({ ...current, bike: candidateBike }));
          setValues(candidateValues);
          setDraftBike(candidateBike);
        }
      } catch (caught) {
        if (requestId !== requestRef.current) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Bike geometry inspection unavailable");
      }
    },
    [actions, scenario, services.solverGateway]
  );

  useEffect(() => {
    if (!scenario) return;
    const signature = JSON.stringify(scenario.bike);
    if (!values || (signature !== appliedBikeRef.current && status !== "pending")) {
      appliedBikeRef.current = signature;
      const nextValues = valuesFromBike(scenario.bike);
      setValues(nextValues);
      setDraftBike(scenario.bike);
      void inspectAndApply(scenario.bike, nextValues, false);
    } else if (!inspection && status === "idle") {
      void inspectAndApply(scenario.bike, values, false);
    }
  }, [inspectAndApply, inspection, scenario, status, values]);

  useEffect(() => {
    if (!scenario) return;
    const riderSignature = JSON.stringify(scenario.rider);
    if (riderRef.current === riderSignature) return;
    const changed = riderRef.current !== null;
    riderRef.current = riderSignature;
    if (!changed) return;
    const requestId = ++requestRef.current;
    setStatus("pending");
    void services.solverGateway
      .validateDesign(scenario)
      .then((nextValidation) => {
        if (requestId !== requestRef.current) return;
        setValidation(nextValidation);
        setInspection(nextValidation.geometry);
        setIssues(nextValidation.geometry.issues);
        setStatus(nextValidation.geometry.valid ? "valid" : "invalid");
      })
      .catch((caught) => {
        if (requestId !== requestRef.current) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Design validation unavailable");
      });
  }, [scenario, services.solverGateway]);

  const updateValue = useCallback(
    (path: BikeDimensionPath, displayValue: number) => {
      if (!scenario || !values) return;
      const nextValues = { ...values, [path]: displayValue };
      setValues(nextValues);
      const structuralIssues = rangeIssues(nextValues);
      if (structuralIssues.length > 0) {
        ++requestRef.current;
        setIssues(structuralIssues);
        setStatus("invalid");
        return;
      }
      const candidate = bikeSpecSchema.safeParse(
        bikeFromValues(draftBike ?? scenario.bike, nextValues)
      );
      if (!candidate.success) {
        ++requestRef.current;
        setIssues(
          candidate.error.issues.map((issue) => ({
            code: "field-range",
            fields: [issue.path.join(".")],
            bikeParts: [],
            message: issue.message
          }))
        );
        setStatus("invalid");
        return;
      }
      setDraftBike(candidate.data);
      setStatus("pending");
      const requestId = ++requestRef.current;
      setTimeout(() => {
        if (requestId !== requestRef.current) return;
        --requestRef.current;
        void inspectAndApply(candidate.data, nextValues, true);
      }, 40);
    },
    [draftBike, inspectAndApply, scenario, values]
  );

  const updateFrameType = useCallback(
    (frameType: BikeSpec["frameType"]) => {
      if (!scenario || !values) return;
      const rearShock =
        frameType === "full"
          ? (draftBike?.rearShock ?? {
              travel: 0.14,
              sag: 0.03,
              springRate: 22000,
              damping: 1200
            })
          : null;
      const candidate = bikeSpecSchema.parse({
        ...(draftBike ?? scenario.bike),
        frameType,
        rearShock
      });
      setDraftBike(candidate);
      void inspectAndApply(candidate, values, true);
    },
    [draftBike, inspectAndApply, scenario, values]
  );

  return {
    values,
    draftBike,
    inspection,
    validation,
    issues,
    status,
    error,
    dirty: Boolean(
      scenario && draftBike && JSON.stringify(draftBike) !== JSON.stringify(scenario.bike)
    ),
    requestId: requestRef.current,
    updateValue,
    updateFrameType
  };
};

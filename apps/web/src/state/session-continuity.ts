import { z } from "zod";

import type { AppState } from "./store";

const SESSION_KEY = "bike-jumper/session-v1";

const staleReferenceSchema = z
  .object({
    kind: z.enum(["scenario", "run", "baseline", "preset", "validation"]),
    id: z.string().min(1),
    label: z.string().min(1),
    reason: z.string().min(1),
    stale: z.literal(true)
  })
  .strict();

const persistedSchema = z
  .object({
    activeRoute: z.string().min(1).optional(),
    activeWorkingId: z.string().min(1).optional(),
    view: z
      .object({
        workbenchTab: z.string().min(1).optional(),
        playbackRate: z.number().finite().optional(),
        libraryCategory: z.string().min(1).optional(),
        libraryQuery: z.string().optional(),
        reportRunId: z.string().optional(),
        reportBaselineRunId: z.string().optional(),
        validationDt: z.number().finite().optional()
      })
      .partial()
      .optional(),
    staleReferences: z.array(staleReferenceSchema).optional()
  })
  .strict();

export type PersistedSessionState = z.infer<typeof persistedSchema>;

export const canonicalSessionRoute = (route: string): string =>
  route === "/pose" ? "/designer" : route;

const safeRead = (): unknown => {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export const restoreSessionContinuity = (): PersistedSessionState => {
  const raw = safeRead();
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const source = raw as Record<string, unknown>;
  const restored: PersistedSessionState = {};

  const activeRoute = z.string().min(1).safeParse(source.activeRoute);
  if (activeRoute.success) {
    restored.activeRoute = canonicalSessionRoute(activeRoute.data);
  }

  const activeWorkingId = z.string().min(1).safeParse(source.activeWorkingId);
  if (activeWorkingId.success) {
    restored.activeWorkingId = activeWorkingId.data;
  }

  const view = z
    .object({
      workbenchTab: z.string().min(1).optional(),
      playbackRate: z.number().finite().optional(),
      libraryCategory: z.string().min(1).optional(),
      libraryQuery: z.string().optional(),
      reportRunId: z.string().optional(),
      reportBaselineRunId: z.string().optional(),
      validationDt: z.number().finite().optional()
    })
    .partial()
    .safeParse(source.view);
  if (view.success) {
    restored.view = view.data;
  }

  const staleReferences = z.array(staleReferenceSchema).safeParse(source.staleReferences);
  if (staleReferences.success) {
    restored.staleReferences = staleReferences.data;
  }

  return persistedSchema.parse(restored);
};

export const saveSessionContinuity = (state: AppState): void => {
  const payload: PersistedSessionState = {
    activeRoute: canonicalSessionRoute(state.session.activeRoute),
    activeWorkingId: state.session.activeWorkingId ?? undefined,
    view: {
      workbenchTab: state.session.view.workbenchTab,
      playbackRate: state.session.view.playbackRate,
      libraryCategory: state.session.view.libraryCategory,
      libraryQuery: state.session.view.libraryQuery,
      reportRunId: state.session.view.reportRunId,
      reportBaselineRunId: state.session.view.reportBaselineRunId,
      validationDt: state.session.view.validationDt
    },
    staleReferences: Object.values(state.session.staleReferences)
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
};

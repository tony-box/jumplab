import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProviders } from "./app/AppProviders";
import { createDefaultAppServices } from "./app/default-services";
import { registerApplicationServiceWorker } from "./app/pwa";
import { installPerformanceInstrumentation } from "./observability/performance";
import { restoreSessionContinuity, saveSessionContinuity } from "./state/session-continuity";
import { useAppStore, type SessionState } from "./state/store";
import { installTestHooks } from "./test-hooks";
import "./styles.css";

registerApplicationServiceWorker();
// Frame/input sampling only feeds the test hooks; production must not run its rAF loop.
if (import.meta.env.VITE_TEST_HOOKS === "1") {
  installPerformanceInstrumentation();
}
installTestHooks();

const restoredSession = restoreSessionContinuity();
const storeActions = useAppStore.getState().actions;
if (restoredSession.activeRoute) storeActions.setRoute(restoredSession.activeRoute);
for (const [key, value] of Object.entries(restoredSession.view ?? {})) {
  if (value !== undefined) {
    storeActions.setViewPreference(
      key as keyof SessionState["view"],
      value as SessionState["view"][keyof SessionState["view"]]
    );
  }
}
for (const reference of restoredSession.staleReferences ?? []) {
  storeActions.markStaleReference(reference);
}
useAppStore.subscribe((state) => saveSessionContinuity(state));

const services = createDefaultAppServices();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders services={services}>
      <App />
    </AppProviders>
  </React.StrictMode>
);

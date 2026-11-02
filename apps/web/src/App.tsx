import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { DesignerPage } from "./features/designer/DesignerPage";
import { LibraryPage } from "./features/library/LibraryPage";
import { ReportPage } from "./features/report/ReportPage";
import { ValidationPage } from "./features/validation/ValidationPage";
import { WorkbenchPage } from "./features/workbench/WorkbenchPage";

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Jump Lab route failed", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-error">
          <h1>Jump Lab could not open this view</h1>
          <button className="btn primary" onClick={() => location.assign("/workbench")}>
            Return to workbench
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/workbench" replace />} />
          <Route path="/workbench" element={<WorkbenchPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/designer" element={<DesignerPage />} />
          <Route path="/pose" element={<Navigate to="/designer" replace />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/report/:runId" element={<ReportPage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="*" element={<Navigate to="/workbench" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

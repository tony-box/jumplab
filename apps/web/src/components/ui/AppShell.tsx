import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { Button } from "./Button";
import { Status } from "./Status";

type AppShellProps = {
  children: ReactNode;
  scenarioLabel: string;
  status: string;
  source?: "solver" | "representative-fixture";
  contextSlot?: ReactNode;
  primaryLabel: string;
  primaryId: string;
  primaryIcon?: ReactNode;
  primaryDisabled?: boolean;
  onPrimary: () => void;
};

export const AppShell = ({
  children,
  scenarioLabel,
  status,
  source,
  contextSlot,
  primaryLabel,
  primaryId,
  primaryIcon,
  primaryDisabled,
  onPrimary
}: AppShellProps) => (
  <div className="app-shell">
    <header className="topbar" data-od-id="topbar">
      <NavLink className="product-mark" data-od-id="product-mark" to="/workbench">
        JUMP LAB <span>2D · v0.4</span>
      </NavLink>
      <nav className="primary-nav" data-od-id="primary-nav" aria-label="Primary">
        <NavLink to="/workbench">Workbench</NavLink>
        <NavLink to="/library">Library</NavLink>
        <NavLink to="/designer">Designer</NavLink>
        <NavLink to="/report">Report</NavLink>
        <NavLink to="/validation">Validation</NavLink>
      </nav>
      <span className="spacer" />
      <div className="scenario-chip" data-od-id="scenario-chip">
        <span>Scenario</span>
        <strong>{scenarioLabel}</strong>
      </div>
      <Status id="core-status" label={status} source={source} />
      {contextSlot}
      <Button
        id={primaryId}
        data-od-id={primaryId}
        variant="primary"
        icon={primaryIcon}
        disabled={primaryDisabled}
        onClick={onPrimary}
      >
        {primaryLabel}
      </Button>
    </header>
    {children}
  </div>
);

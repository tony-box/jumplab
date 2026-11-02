import type { ReactNode } from "react";

type StatusProps = {
  id?: string;
  label: string;
  source?: "solver" | "representative-fixture";
  icon?: ReactNode;
};

const sourceText = (source: StatusProps["source"]): string => {
  if (!source) return "";
  return source === "solver" ? "solver" : "recorded fixture";
};

export const Status = ({ id, label, source, icon }: StatusProps) => (
  <span className="status-pill" id={id}>
    <i aria-hidden="true" />
    {icon}
    {label}
    {source ? <span className="status-source">{sourceText(source)}</span> : null}
  </span>
);

import type { ReactNode } from "react";

type CalloutProps = {
  title: string;
  children: ReactNode;
  tone?: "info" | "warning" | "error";
  id?: string;
};

export const Callout = ({ title, children, tone = "info", id }: CalloutProps) => (
  <section className={`callout callout-${tone}`} role="status" id={id}>
    <h2>{title}</h2>
    <div>{children}</div>
  </section>
);

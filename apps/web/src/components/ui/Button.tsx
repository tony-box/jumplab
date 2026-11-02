import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "default" | "primary" | "icon";
};

export const Button = ({
  icon,
  variant = "default",
  className = "",
  children,
  ...props
}: ButtonProps) => (
  <button className={`btn ${variant === "default" ? "" : variant} ${className}`.trim()} {...props}>
    {icon}
    {children}
  </button>
);

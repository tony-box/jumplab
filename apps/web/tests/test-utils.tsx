import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { AppProviders } from "../src/app/AppProviders";
import type { AppServices } from "../src/app/services";

type ExtendedRenderOptions = Omit<RenderOptions, "wrapper"> & {
  route?: string;
  services?: Partial<AppServices>;
};

const Providers = ({
  children,
  route,
  services
}: {
  children: ReactNode;
  route: string;
  services?: Partial<AppServices>;
}) => (
  <MemoryRouter initialEntries={[route]}>
    <AppProviders services={services}>{children}</AppProviders>
  </MemoryRouter>
);

export const renderWithProviders = (
  ui: ReactElement,
  { route = "/workbench", services, ...options }: ExtendedRenderOptions = {}
) =>
  render(ui, {
    wrapper: ({ children }) => (
      <Providers route={route} services={services}>
        {children}
      </Providers>
    ),
    ...options
  });

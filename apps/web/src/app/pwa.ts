import { registerSW } from "virtual:pwa-register";

export const registerApplicationServiceWorker = (): void => {
  if (import.meta.env.DEV) {
    void navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );
    return;
  }

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (window.confirm("A new Jump Lab version is ready. Reload now?")) {
        void updateServiceWorker(true);
      }
    }
  });
};

// Adapted from shadcn/ui's Sonner registry component to use this app's theme tokens.
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useSyncExternalStore } from "react";
import { t } from "../i18n.js";
import { getPreferences, preferencesEvent } from "../preferences.js";

const subscribe = (callback) => {
  window.addEventListener(preferencesEvent, callback);
  return () => window.removeEventListener(preferencesEvent, callback);
};
export function usePreferences() {
  return useSyncExternalStore(subscribe, () => JSON.stringify(getPreferences()));
}

export function Toaster() {
  usePreferences();
  return <Sonner
    theme={getPreferences().theme}
    className="toaster"
    position="bottom-right"
    closeButton
    visibleToasts={3}
    duration={4500}
    offset={24}
    mobileOffset={16}
    customAriaLabel={t("Notifications")}
    icons={{
      success: <CircleCheckIcon size={18} />,
      info: <InfoIcon size={18} />,
      warning: <TriangleAlertIcon size={18} />,
      error: <OctagonXIcon size={18} />,
      loading: <Loader2Icon size={18} className="toast-spinner" />,
      close: <XIcon size={14} />,
    }}
    style={{
      "--normal-bg": "var(--panel)",
      "--normal-text": "var(--text)",
      "--normal-border": "var(--line)",
      "--border-radius": "var(--radius)",
    }}
    toastOptions={{ closeButtonAriaLabel: t("Dismiss notification") }}
  />;
}

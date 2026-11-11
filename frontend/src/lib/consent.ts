import { api } from "./api";
import type { ConsentPurpose, ConsentState } from "./types";

/** Version of the privacy notice shown in onboarding and settings. Bump when it changes. */
export const POLICY_VERSION = "2026-10-01";

export const CONSENT_COPY: Record<ConsentPurpose, { title: string; body: string }> = {
  health_data_processing: {
    title: "Store my pregnancy and health details",
    body: "Needed to save your due date, journal, checklist and reminders. Without it we can only show general articles.",
  },
  product_analytics: {
    title: "Help improve the product",
    body: "Anonymous usage statistics. Never includes dates, symptoms or notes.",
  },
  marketing_email: {
    title: "Occasional emails",
    body: "News about new features. Unsubscribe any time.",
  },
};

export function recordConsent(purpose: ConsentPurpose, granted: boolean, source: string) {
  return api<ConsentState>("/v1/me/consents", {
    method: "POST",
    body: { purpose, granted, policyVersion: POLICY_VERSION, source },
  });
}

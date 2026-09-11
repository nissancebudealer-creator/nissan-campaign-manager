import { api } from "./api";

export interface Branding {
  companyName: string | null;
  logoUrl: string | null;
}

export const settingsApi = {
  getBranding: () => api.get<Branding>("/settings/branding"),
  updateBranding: (input: { companyName?: string | null; logoUrl?: string | null }) =>
    api.put<Branding>("/settings/branding", input),
};

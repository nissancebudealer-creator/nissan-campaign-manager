import { create } from "zustand";
import { settingsApi, type Branding } from "../lib/settingsApi";

interface BrandingState extends Branding {
  loaded: boolean;
  load: () => Promise<void>;
  setBranding: (b: Branding) => void;
}

export const useBrandingStore = create<BrandingState>((set) => ({
  companyName: null,
  logoUrl: null,
  loaded: false,
  load: async () => {
    try {
      const branding = await settingsApi.getBranding();
      set({ ...branding, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  setBranding: (branding) => set(branding),
}));

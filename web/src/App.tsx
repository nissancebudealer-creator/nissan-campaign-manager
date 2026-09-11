import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { useBrandingStore } from "./store/brandingStore";
import {
  Administration,
  Automation,
  AutomationBuilder,
  Campaigns,
  CampaignBuilder,
  Contacts,
  Dashboard,
  Help,
  Integrations,
  Login,
  Reports,
  SegmentBuilder,
  Segments,
  TemplateBuilder,
  Templates,
} from "./pages";

export function App() {
  const companyName = useBrandingStore((s) => s.companyName);
  const logoUrl = useBrandingStore((s) => s.logoUrl);

  useEffect(() => {
    useBrandingStore.getState().load();
  }, []);

  // Browser tab title and favicon — the only two things a backgrounded/pinned tab actually shows.
  useEffect(() => {
    document.title = companyName || "Campaign Manager";
  }, [companyName]);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (logoUrl) {
      link.href = logoUrl;
    } else {
      link.remove();
    }
  }, [logoUrl]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/segments" element={<Segments />} />
          <Route path="/segments/new" element={<SegmentBuilder />} />
          <Route path="/segments/:id" element={<SegmentBuilder />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<CampaignBuilder />} />
          <Route path="/campaigns/:id" element={<CampaignBuilder />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/new" element={<TemplateBuilder />} />
          <Route path="/templates/:id" element={<TemplateBuilder />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="/automation/new" element={<AutomationBuilder />} />
          <Route path="/automation/:id" element={<AutomationBuilder />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings" element={<Administration />} />
          <Route path="/help" element={<Help />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

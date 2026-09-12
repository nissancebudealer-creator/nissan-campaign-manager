import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RequireModule } from "./routes/RequireModule";
import { useBrandingStore } from "./store/brandingStore";
import { useAuthStore } from "./store/authStore";
import { api } from "./lib/api";
import type { AuthUser } from "./types";
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

  // Refreshes the cached user from the server on every app load — picks up role/module changes
  // (an admin re-assigning your role, or this app adding a new module) without needing to log out
  // and back in, since the only other place this data comes from is the one-time login response.
  useEffect(() => {
    const { token, user, setAuth } = useAuthStore.getState();
    if (!token || !user) return;
    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((r) => setAuth({ token, user: r.user }))
      .catch(() => {
        /* stale/expired token — the next authenticated request will surface the real 401 */
      });
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
          <Route path="/reports" element={<Reports />} />
          <Route path="/help" element={<Help />} />
          {/* Settings has its own real, backend-verified access check (Administration.tsx) */}
          <Route path="/settings" element={<Administration />} />

          <Route element={<RequireModule module="contacts" />}>
            <Route path="/contacts" element={<Contacts />} />
          </Route>
          <Route element={<RequireModule module="segments" />}>
            <Route path="/segments" element={<Segments />} />
            <Route path="/segments/new" element={<SegmentBuilder />} />
            <Route path="/segments/:id" element={<SegmentBuilder />} />
          </Route>
          <Route element={<RequireModule module="campaigns" />}>
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<CampaignBuilder />} />
            <Route path="/campaigns/:id" element={<CampaignBuilder />} />
          </Route>
          <Route element={<RequireModule module="templates" />}>
            <Route path="/templates" element={<Templates />} />
            <Route path="/templates/new" element={<TemplateBuilder />} />
            <Route path="/templates/:id" element={<TemplateBuilder />} />
          </Route>
          <Route element={<RequireModule module="automation" />}>
            <Route path="/automation" element={<Automation />} />
            <Route path="/automation/new" element={<AutomationBuilder />} />
            <Route path="/automation/:id" element={<AutomationBuilder />} />
          </Route>
          <Route element={<RequireModule module="integrations" />}>
            <Route path="/integrations" element={<Integrations />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useBrandingStore } from "../../store/brandingStore";
import { useAuthStore } from "../../store/authStore";

// The `module` key matches MODULE_GROUPS on the server (config/roles.ts) — a link only shows when
// the signed-in user's role actually has that module in its real, server-computed grant list, not
// a separately-maintained guess of who should see what.
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", module: "dashboard" },
  { to: "/contacts", label: "Contacts", module: "contacts" },
  { to: "/segments", label: "Segments", module: "segments" },
  { to: "/campaigns", label: "Campaigns", module: "campaigns" },
  { to: "/templates", label: "Templates", module: "templates" },
  { to: "/automation", label: "Automation", module: "automation" },
  { to: "/reports", label: "Reports", module: "reports" },
  { to: "/integrations", label: "Integrations", module: "integrations" },
  { to: "/settings", label: "Settings", module: "settings" },
  { to: "/help", label: "Help", module: "help" },
];

export function Sidebar() {
  const { companyName, logoUrl } = useBrandingStore();
  const modules = useAuthStore((s) => s.user?.modules) ?? [];
  const visibleItems = NAV_ITEMS.filter((item) => modules.includes(item.module));

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        {logoUrl && <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />}
        <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
          {companyName || "Campaign Manager"}
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              clsx(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

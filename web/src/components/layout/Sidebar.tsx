import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useBrandingStore } from "../../store/brandingStore";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/contacts", label: "Contacts" },
  { to: "/segments", label: "Segments" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/templates", label: "Templates" },
  { to: "/automation", label: "Automation" },
  { to: "/reports", label: "Reports" },
  { to: "/integrations", label: "Integrations" },
  { to: "/settings", label: "Settings" },
  { to: "/help", label: "Help" },
];

export function Sidebar() {
  const { companyName, logoUrl } = useBrandingStore();

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        {logoUrl && <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />}
        <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
          {companyName || "Campaign Manager"}
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => (
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

import {
  Activity,
  ArrowLeftFromLine,
  ChevronDown,
  FlaskConical,
  History,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Section } from "../types";

const navigation: { label: Section; icon: LucideIcon }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Consent Playground", icon: ShieldCheck },
  { label: "Data Access Simulator", icon: LockKeyhole },
  { label: "Automated Test Lab", icon: FlaskConical },
  { label: "Consent History", icon: History }
];

interface SidebarProps {
  current: Section;
  onNavigate: (section: Section) => void;
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ current, onNavigate, mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">anumati<span>.</span></div>
            <div className="brand-subtitle">SANDBOX</div>
          </div>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span className="workspace-copy"><strong>Northstar Financial</strong><small>Demo workspace</small></span>
          <ChevronDown size={16} className="workspace-chevron" />
        </button>

        <div className="nav-label">MENU</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${current === label ? "nav-item-active" : ""}`}
              onClick={() => { onNavigate(label); onClose(); }}
              aria-current={current === label ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Automated Test Lab" && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sandbox-note">
            <div className="sandbox-note-icon"><Activity size={16} /></div>
            <strong>Safe to experiment</strong>
            <p>This sandbox uses synthetic data. Nothing here affects real accounts.</p>
            <span className="sandbox-note-link">Learn about the sandbox <ArrowLeftFromLine size={13} /></span>
          </div>
          <div className="sidebar-version"><span className="status-dot" /> All systems operational <span>v0.1</span></div>
        </div>
      </aside>
    </>
  );
}

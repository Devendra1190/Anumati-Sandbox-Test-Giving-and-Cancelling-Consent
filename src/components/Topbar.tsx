import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { demoUser } from "../data/demo";
import type { Section } from "../types";

interface TopbarProps {
  current: Section;
  onMenuClick: () => void;
}

export default function Topbar({ current, onMenuClick }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenuClick}><Menu size={20} /></button>
        <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{current}</strong></div>
      </div>
      <div className="topbar-actions">
        <div className="demo-pill"><span /> DEMO ENVIRONMENT</div>
        <button className="icon-button topbar-search" aria-label="Search"><Search size={18} /></button>
        <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
        <div className="topbar-divider" />
        <button className="profile-button">
          <span className="user-avatar">{demoUser.initials}</span>
          <span className="profile-copy"><strong>{demoUser.name}</strong><small>Demo user</small></span>
          <ChevronDown size={15} className="profile-chevron" />
        </button>
      </div>
    </header>
  );
}

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  tone: "teal" | "blue" | "amber" | "rose";
}

export default function StatCard({ label, value, helper, icon: Icon, tone }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-icon-${tone}`}><Icon size={19} strokeWidth={1.9} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-helper">{helper}</div>
    </article>
  );
}

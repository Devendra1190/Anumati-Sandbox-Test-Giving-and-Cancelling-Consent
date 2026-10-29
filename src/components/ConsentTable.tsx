import { ArrowUpRight, MoreHorizontal, ShieldCheck } from "lucide-react";
import type { ConsentRecord } from "../types";

interface ConsentTableProps {
  records: ConsentRecord[];
  onViewAll?: () => void;
  title?: string;
}

export default function ConsentTable({ records, onViewAll, title = "Recent consents" }: ConsentTableProps) {
  return (
    <section className="panel consent-panel">
      <div className="panel-heading">
        <div><h2>{title}</h2><p>A quick look at the latest consent activity</p></div>
        {onViewAll && <button className="text-button" onClick={onViewAll}>View all <ArrowUpRight size={15} /></button>}
      </div>
      {records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><ShieldCheck size={21} /></div>
          <strong>No consent records found</strong>
          <p>Try changing the filters or grant a new consent in the playground.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="consent-table">
            <thead><tr><th>CONSENT PURPOSE</th><th>STATUS</th><th>GRANTED</th><th>EXPIRES</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td><div className="purpose-cell"><span className="purpose-icon"><ShieldCheck size={15} /></span><span><strong>{record.purpose}</strong><small>{record.category} · {record.id}</small></span></div></td>
                  <td><span className={`status-badge status-${record.status}`}><i />{record.status}</span></td>
                  <td className="date-cell">{formatDate(record.grantedAt)}</td>
                  <td className="date-cell">{formatDate(record.expiresAt)}</td>
                  <td><button className="icon-button row-more" aria-label={`More options for ${record.purpose}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  FlaskConical,
  LockKeyhole,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createConsentRequest, getConsentHistory, getConsents, getCurrentConsentStatus, transitionConsent } from "./api";
import ConsentTable from "./components/ConsentTable";
import Sidebar from "./components/Sidebar";
import StatCard from "./components/StatCard";
import Topbar from "./components/Topbar";
import { demoOrganisation, demoPurposes, demoUser, initialTestResults } from "./data/demo";
import type { ConsentEvent, ConsentRecord, ConsentStatus, Section, TestResult } from "./types";

function App() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [consentEvents, setConsentEvents] = useState<ConsentEvent[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>(initialTestResults);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [accessPurpose, setAccessPurpose] = useState(demoPurposes[0].id);
  const [accessResult, setAccessResult] = useState<{ status: ConsentStatus | "not_found"; consent: ConsentRecord | null } | null>(null);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(true);

  const refreshConsentData = useCallback(async () => {
    const [records, events] = await Promise.all([getConsents(), getConsentHistory()]);
    setConsents(records);
    setConsentEvents(events);
    setApiLoading(false);
  }, []);

  useEffect(() => {
    refreshConsentData().catch((error: unknown) => {
      setApiError(error instanceof Error ? error.message : "Unable to load consent data.");
      setApiLoading(false);
    });
  }, [refreshConsentData]);

  const counts = useMemo(() => ({
    active: consents.filter((consent) => consent.status === "active").length,
    withdrawn: consents.filter((consent) => consent.status === "withdrawn").length,
    tests: testResults.length,
    failed: testResults.filter((test) => test.result === "Failed").length
  }), [consents, testResults]);

  async function performConsentAction(action: () => Promise<unknown>) {
    setApiError("");
    try {
      await action();
      await refreshConsentData();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to update consent.");
    }
  }

  function createRequest(purposeId: string) {
    return performConsentAction(() => createConsentRequest(purposeId));
  }

  function updateConsent(id: string, action: "grant" | "reject" | "withdraw") {
    return performConsentAction(() => transitionConsent(id, action));
  }

  async function simulateAccessRequest() {
    setApiError("");
    try {
      setAccessResult(await getCurrentConsentStatus(accessPurpose));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to evaluate this request.");
    }
  }

  function runTest(name?: string) {
    const testNames = [
      "Withdrawal blocks future access",
      "Purpose limitation check",
      "Consent expiry enforcement",
      "Consent record integrity"
    ];
    const selectedTests = name ? [name] : testNames;
    setTestResults((current) => [
      ...selectedTests.map((selected, index): TestResult => {
        const failed = selected === "Consent expiry enforcement";
        return {
          id: `TST-${String(83 + current.length - initialTestResults.length + index).padStart(4, "0")}`,
          name: selected,
          result: failed ? "Failed" : "Passed",
          detail: failed ? "An expired consent was accepted by the mock service." : "The simulated consent checks behaved as expected.",
          time: "Just now"
        };
      }),
      ...current
    ]);
  }

  function renderPage() {
    switch (section) {
      case "Consent Playground":
        return <PlaygroundPage consents={consents} onCreateRequest={createRequest} onUpdate={updateConsent} />;
      case "Data Access Simulator":
        return <AccessPage purpose={accessPurpose} onPurposeChange={(value) => { setAccessPurpose(value); setAccessResult(null); }} result={accessResult} onSimulate={simulateAccessRequest} />;
      case "Automated Test Lab":
        return <TestLabPage results={testResults} onRun={runTest} failed={counts.failed} />;
      case "Consent History":
        return <HistoryPage events={consentEvents} filter={filter} onFilterChange={setFilter} search={search} onSearchChange={setSearch} />;
      default:
        return <DashboardPage counts={counts} consents={consents} onNavigate={setSection} results={testResults} />;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar current={section} onNavigate={setSection} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-area">
        <Topbar current={section} onMenuClick={() => setMobileOpen(true)} />
        <div className="page-content">
          {apiError && <div className="api-error" role="alert"><ShieldAlert size={16} /><span>{apiError}</span><button onClick={() => { setApiError(""); setApiLoading(true); refreshConsentData().catch((error: unknown) => { setApiError(error instanceof Error ? error.message : "Unable to load consent data."); setApiLoading(false); }); }}>Retry</button></div>}
          {apiLoading && <div className="api-loading" role="status">Connecting to the consent sandbox…</div>}
          {renderPage()}
        </div>
        <footer className="page-footer"><span>© 2026 Anumati Sandbox</span><span><span className="footer-dot" /> Synthetic demo data · Not connected to real accounts</span><button onClick={() => setSection("Dashboard")}>DPDP Act, 2023 <ArrowUpRight size={13} /></button></footer>
      </main>
    </div>
  );
}

interface DashboardPageProps {
  counts: { active: number; withdrawn: number; tests: number; failed: number };
  consents: ConsentRecord[];
  onNavigate: (section: Section) => void;
  results: TestResult[];
}

function DashboardPage({ counts, consents, onNavigate, results }: DashboardPageProps) {
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> OVERVIEW</div><h1>Good morning, Aarav <span className="wave">✦</span></h1><p>Here&apos;s what&apos;s happening with consent in your sandbox today.</p></div>
        <button className="button button-primary" onClick={() => onNavigate("Consent Playground")}><Plus size={17} /> New consent</button>
      </div>
      <div className="demo-banner">
        <div className="demo-banner-icon"><Sparkles size={17} /></div>
        <div><strong>You&apos;re exploring a demo workspace</strong><p>Every person, organisation, and record here is synthetic. Feel free to experiment — changes won&apos;t affect real data.</p></div>
        <span className="demo-banner-tag">DEMO DATA</span>
      </div>

      <section className="stats-grid" aria-label="Consent statistics">
        <StatCard label="Active consents" value={counts.active} helper="+2 this month" icon={ShieldCheck} tone="teal" />
        <StatCard label="Withdrawn consents" value={counts.withdrawn} helper="All withdrawals honoured" icon={ArrowDownRight} tone="blue" />
        <StatCard label="Tests executed" value={counts.tests} helper="+12% from last week" icon={FlaskConical} tone="amber" />
        <StatCard label="Failed tests" value={counts.failed} helper={counts.failed ? "Needs your attention" : "All clear"} icon={ShieldAlert} tone="rose" />
      </section>

      <div className="dashboard-grid">
        <ConsentTable records={consents.slice(0, 4)} onViewAll={() => onNavigate("Consent History")} />
        <section className="panel profile-panel">
          <div className="panel-heading"><div><h2>Demo identity</h2><p>Your sandbox test subject</p></div><span className="profile-shield"><ShieldCheck size={17} /></span></div>
          <div className="identity-card">
            <div className="identity-avatar">AM<span /></div>
            <div><strong>{demoUser.name}</strong><small>{demoUser.email}</small></div>
          </div>
          <div className="detail-list">
            <div><span>Demo user ID</span><strong>{demoUser.id}</strong></div>
            <div><span>Data fiduciary</span><strong>{demoOrganisation.name}</strong></div>
            <div><span>Industry</span><strong>{demoOrganisation.sector}</strong></div>
          </div>
          <div className="identity-footnote"><LockKeyhole size={14} /> Synthetic identity · No real personal data</div>
        </section>
      </div>

      <div className="lower-grid">
        <section className="panel activity-panel">
          <div className="panel-heading"><div><h2>Consent activity</h2><p>Grant and withdrawal activity over the last 7 days</p></div><button className="period-select">Last 7 days <ChevronTiny /></button></div>
          <div className="chart-area">
            <div className="chart-y-labels"><span>8</span><span>6</span><span>4</span><span>2</span><span>0</span></div>
            <div className="chart-content">
              <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
              <div className="bar-chart">
                {[["Mon", 42, 16], ["Tue", 66, 22], ["Wed", 48, 12], ["Thu", 82, 25], ["Fri", 58, 12], ["Sat", 36, 10], ["Sun", 72, 18]].map(([day, grant, withdraw]) => (
                  <div className="bar-group" key={day}>
                    <div className="bar-stack"><i className="bar-granted" style={{ height: `${grant}%` }} /><i className="bar-withdrawn" style={{ height: `${withdraw}%` }} /></div>
                    <span>{day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-legend"><span><i className="legend-granted" /> Granted</span><span><i className="legend-withdrawn" /> Withdrawn</span><span className="chart-demo-label">Illustrative demo data</span></div>
        </section>
        <section className="panel test-summary">
          <div className="panel-heading"><div><h2>Latest test runs</h2><p>Quality checks in your sandbox</p></div><button className="text-button" onClick={() => onNavigate("Automated Test Lab")}>Test lab <ArrowRight size={14} /></button></div>
          <div className="test-list">
            {results.slice(0, 3).map((test) => <div className="test-row" key={test.id}><span className={`test-result-icon ${test.result === "Passed" ? "test-passed" : "test-failed"}`}>{test.result === "Passed" ? <Check size={14} /> : <XCircle size={15} />}</span><div className="test-row-copy"><strong>{test.name}</strong><small>{test.time}</small></div><span className={`test-result-label ${test.result.toLowerCase()}`}>{test.result}</span></div>)}
          </div>
        </section>
      </div>
    </>
  );
}

function ChevronTiny() {
  return <ArrowDownRight size={13} className="rotate-chevron" />;
}

interface PlaygroundPageProps {
  consents: ConsentRecord[];
  onCreateRequest: (purposeId: string) => void;
  onUpdate: (id: string, action: "grant" | "reject" | "withdraw") => void;
}

function PlaygroundPage({ consents, onCreateRequest, onUpdate }: PlaygroundPageProps) {
  const descriptions: Record<string, { description: string; icon: LucideIcon }> = {
    "PUR-RECOMMENDATIONS": { description: "Use your preferences to tailor suggestions and experiences.", icon: Sparkles },
    "PUR-STATEMENTS": { description: "Send account summaries and service-related updates.", icon: FileCheck2 },
    "PUR-PARTNER-OFFERS": { description: "Share relevant offers from selected partners.", icon: Activity },
    "PUR-FRAUD-PREVENTION": { description: "Use information to help identify suspicious activity.", icon: ShieldCheck },
    "PUR-LOCATION": { description: "Use approximate location to provide nearby services.", icon: LockKeyhole }
  };
  return (
    <>
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HANDS-ON DEMO</div><h1>Consent Playground</h1><p>Grant or withdraw consent and see the state update instantly.</p></div><span className="page-demo-badge"><span /> Sandbox only</span></div>
      <div className="demo-banner"><div className="demo-banner-icon"><Sparkles size={17} /></div><div><strong>Try out a consent lifecycle</strong><p>Use the actions below to create, grant, reject, or withdraw consent for {demoUser.name}. Changes are persisted in the local SQLite database.</p></div><span className="demo-banner-tag">SYNTHETIC</span></div>
      <div className="playground-layout">
        <section className="panel playground-panel"><div className="panel-heading"><div><h2>Consent preferences</h2><p>Choose which purposes are permitted</p></div><span className="consent-count">{consents.filter((item) => item.status === "active").length} active</span></div>
          <div className="preference-list">{demoPurposes.map(({ id: purposeId, name: purpose, category }) => {
            const record = consents.find((item) => item.purposeId === purposeId);
            const active = record?.status === "active";
            const pending = record?.status === "pending";
            const { description, icon: Icon } = descriptions[purposeId];
            return <article className="preference-row" key={purposeId}><div className="preference-icon"><Icon size={18} /></div><div className="preference-copy"><strong>{purpose}</strong><span>{description}</span><small>{category}{record ? ` · ${record.id} · ${record.status}` : ""}</small></div><div className="consent-actions">{active ? <button className="button button-secondary" onClick={() => onUpdate(record.id, "withdraw")}>Withdraw</button> : pending ? <><button className="button button-secondary" onClick={() => onUpdate(record.id, "reject")}>Reject</button><button className="button button-primary" onClick={() => onUpdate(record.id, "grant")}>Grant</button></> : <button className="button button-secondary" onClick={() => onCreateRequest(purposeId)}>{record ? "Request again" : "Create request"}</button>}</div></article>;
          })}</div>
          <div className="playground-foot"><LockKeyhole size={14} /><span>Withdrawals take effect immediately in this simulation.</span></div>
        </section>
        <aside className="panel lifecycle-panel"><div className="panel-heading"><div><h2>Consent lifecycle</h2><p>What happens when you withdraw?</p></div></div><div className="lifecycle-steps"><div className="lifecycle-step"><span className="lifecycle-number">1</span><div><strong>Choose a purpose</strong><p>Toggle an active consent off.</p></div></div><div className="lifecycle-connector" /><div className="lifecycle-step"><span className="lifecycle-number">2</span><div><strong>Access is blocked</strong><p>Future requests for that purpose are denied.</p></div></div><div className="lifecycle-connector" /><div className="lifecycle-step"><span className="lifecycle-number">3</span><div><strong>History is preserved</strong><p>The withdrawal is recorded in your history.</p></div></div></div><div className="lifecycle-callout"><ShieldCheck size={17} /><span>Designed to demonstrate purpose-specific consent control under the DPDP Act, 2023.</span></div></aside>
      </div>
      <ConsentTable records={consents.slice(0, 5)} title="Consent records" />
    </>
  );
}

interface AccessPageProps {
  purpose: string;
  onPurposeChange: (value: string) => void;
  result: { status: ConsentStatus | "not_found"; consent: ConsentRecord | null } | null;
  onSimulate: () => void;
}

function AccessPage({ purpose, onPurposeChange, result, onSimulate }: AccessPageProps) {
  const allowed = result?.status === "active";
  const selected = result?.consent;
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> REQUEST SIMULATOR</div><h1>Data Access Simulator</h1><p>See how consent status affects a data access request.</p></div><span className="page-demo-badge"><span /> Mock API</span></div>
    <div className="demo-banner"><div className="demo-banner-icon"><Database size={17} /></div><div><strong>This does not contact a real service</strong><p>Requests are evaluated against local demo records only. No personal data is read, sent, or stored remotely.</p></div><span className="demo-banner-tag">OFFLINE</span></div>
    <div className="access-layout"><section className="panel access-form"><div className="panel-heading"><div><h2>Simulate a data request</h2><p>Configure a mock request from the organisation</p></div></div>
      <label className="field-label">DATA FIDUCIARY</label><div className="mock-field"><span className="workspace-avatar">N</span><div><strong>{demoOrganisation.name}</strong><small>{demoOrganisation.id} · {demoOrganisation.sector}</small></div><span className="readonly-tag">DEMO</span></div>
      <label className="field-label" htmlFor="access-purpose">CONSENT PURPOSE</label><select className="form-select" id="access-purpose" value={purpose} onChange={(event) => onPurposeChange(event.target.value)}>{demoPurposes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
      <div className="request-detail"><span>Requested data</span><strong>Profile &amp; preference data</strong><span>Data principal</span><strong>{demoUser.name} <small>({demoUser.id})</small></strong></div>
      <button className="button button-primary access-submit" onClick={onSimulate}><Activity size={16} /> Simulate access request</button>
    </section>
    <section className="panel access-result-panel"><div className="panel-heading"><div><h2>Request outcome</h2><p>Consent-aware access evaluation</p></div></div>
      {!result ? <div className="result-empty"><div className="result-empty-icon"><Database size={22} /></div><strong>Ready to evaluate</strong><p>Run a request to check the selected purpose against the current consent record.</p><div className="result-check"><span><Check size={13} /></span> Consent status check</div><div className="result-check"><span><Check size={13} /></span> Purpose matching</div></div> : <div className={`result-outcome ${allowed ? "allowed" : "denied"}`}><div className={`outcome-icon ${allowed ? "allowed" : "denied"}`} >{allowed ? <CheckCircle2 size={26} /> : <XCircle size={26} />}</div><span className={`outcome-kicker ${allowed ? "allowed" : "denied"}`}>{allowed ? "REQUEST AUTHORISED" : "REQUEST DENIED"}</span><h3>{allowed ? "Consent is active" : "No active consent found"}</h3><p>{allowed ? "The demo user has granted permission for this purpose. The mock request may proceed." : "The demo user does not have active permission for this purpose. Access is blocked."}</p><div className="outcome-record"><span>Matched consent record</span><strong>{selected?.id ?? "No active record"}</strong><span>Current status</span><strong className={allowed ? "allowed" : "denied"}>{selected?.status ?? "Not granted"}</strong></div><button className="button button-secondary" onClick={onSimulate}><RotateCcw size={15} /> Run again</button></div>}
    </section></div>
  </>;
}

interface TestLabPageProps {
  results: TestResult[];
  onRun: (name?: string) => void;
  failed: number;
}

function TestLabPage({ results, onRun, failed }: TestLabPageProps) {
  const cases = [
    { name: "Withdrawal blocks future access", description: "Verify access is denied immediately after consent is withdrawn.", icon: LockKeyhole },
    { name: "Purpose limitation check", description: "Confirm data is only used for the purpose the user approved.", icon: ShieldCheck },
    { name: "Consent expiry enforcement", description: "Ensure expired permissions cannot authorise new requests.", icon: Clock3 },
    { name: "Consent record integrity", description: "Check that consent records retain a clear, auditable history.", icon: FileCheck2 }
  ];
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> QUALITY ASSURANCE</div><h1>Automated Test Lab</h1><p>Run consent safeguards against the synthetic sandbox environment.</p></div><button className="button button-primary" onClick={() => onRun()}><FlaskConical size={16} /> Run all tests</button></div>
    <div className="demo-banner"><div className="demo-banner-icon"><FlaskConical size={17} /></div><div><strong>Tests run locally against mock records</strong><p>Results illustrate expected consent behaviours — they do not certify legal or regulatory compliance.</p></div><span className="demo-banner-tag">SIMULATION</span></div>
    <div className="test-lab-stats"><div><span className="mini-stat-icon green"><CheckCircle2 size={17} /></span><span><strong>{results.filter((item) => item.result === "Passed").length}</strong><small>Passed</small></span></div><div><span className="mini-stat-icon red"><XCircle size={17} /></span><span><strong>{failed}</strong><small>Failed</small></span></div><div><span className="mini-stat-icon blue"><Activity size={17} /></span><span><strong>{results.length}</strong><small>Total runs</small></span></div></div>
    <section className="panel test-cases-panel"><div className="panel-heading"><div><h2>Available test cases</h2><p>Run individual checks or the full test suite</p></div><span className="consent-count">{cases.length} test cases</span></div><div className="test-cases-list">{cases.map(({ name, description, icon: Icon }) => <article className="test-case-row" key={name}><span className="test-case-icon"><Icon size={18} /></span><div><strong>{name}</strong><p>{description}</p></div><button className="button button-secondary run-test-button" onClick={() => onRun(name)}>Run test <ArrowRight size={14} /></button></article>)}</div></section>
    <section className="panel results-panel"><div className="panel-heading"><div><h2>Test run history</h2><p>Latest results from this session</p></div><span className="results-session">This session</span></div>{results.length === 0 ? <div className="empty-state"><div className="empty-icon"><FlaskConical size={21} /></div><strong>No tests have been run</strong><p>Run a test to see its results here.</p></div> : <div className="test-history">{results.map((result) => <div className="test-history-row" key={result.id}><span className={`test-result-icon ${result.result === "Passed" ? "test-passed" : "test-failed"}`}>{result.result === "Passed" ? <Check size={14} /> : <XCircle size={15} />}</span><div className="test-history-copy"><strong>{result.name}</strong><span>{result.detail}</span></div><span className={`status-badge ${result.result === "Passed" ? "status-active" : "status-failed"}`}><i />{result.result}</span><small>{result.time}</small></div>)}</div>}</section>
  </>;
}

interface HistoryPageProps {
  events: ConsentEvent[];
  filter: string;
  onFilterChange: (filter: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

function HistoryPage({ events, filter, onFilterChange, search, onSearchChange }: HistoryPageProps) {
  const visibleEvents = events.filter((event) => {
    const matchesType = filter === "all" || event.eventType === filter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${event.purpose} ${event.category} ${event.consentId} ${event.eventType}`.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AUDIT TRAIL</div><h1>Consent History</h1><p>A transparent, purpose-specific record of consent changes.</p></div><span className="page-demo-badge"><span /> Demo records</span></div>
    <div className="demo-banner"><div className="demo-banner-icon"><HistoryIcon /></div><div><strong>Append-only consent audit trail</strong><p>Every request and status change is timestamped in SQLite. This synthetic demo history is not a legally binding record.</p></div><span className="demo-banner-tag">SYNTHETIC</span></div>
    <section className="panel history-panel"><div className="history-toolbar"><div><h2>Consent events</h2><p>{visibleEvents.length} {visibleEvents.length === 1 ? "event" : "events"} in this view</p></div><div className="history-controls"><label className="search-field"><SearchIcon /><input aria-label="Search consent events" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search events..." /></label><select className="filter-select" aria-label="Filter by event type" value={filter} onChange={(event) => onFilterChange(event.target.value)}><option value="all">All events</option><option value="requested">Requested</option><option value="granted">Granted</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option></select></div></div>
      {visibleEvents.length === 0 ? <div className="empty-state"><div className="empty-icon"><HistoryIcon /></div><strong>No consent events found</strong><p>Try changing your search or event filter.</p></div> : <div className="table-scroll"><table className="consent-table event-table"><thead><tr><th>EVENT</th><th>CONSENT PURPOSE</th><th>CONSENT ID</th><th>TIMESTAMP</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td><span className={`status-badge status-${eventStatus(event.eventType)}`}><i />{event.eventType}</span></td><td><div className="purpose-cell"><span className="purpose-icon"><ShieldCheck size={15} /></span><span><strong>{event.purpose}</strong><small>{event.category}</small></span></div></td><td className="date-cell">{event.consentId}</td><td className="date-cell">{formatEventDate(event.occurredAt)}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="history-note"><ShieldCheck size={16} /><span>In a production system, consent records should be tamper-evident and retained according to applicable policies.</span></div>
  </>;
}

function eventStatus(event: ConsentEvent["eventType"]): ConsentStatus {
  if (event === "requested") return "pending";
  if (event === "granted") return "active";
  return event;
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

function HistoryIcon() {
  return <Clock3 size={17} />;
}

function SearchIcon() {
  return <Search size={16} />;
}

export default App;

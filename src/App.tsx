import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
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
import { checkMockDataAccess, createConsentRequest, getConsentHistory, getConsents, getDashboardStats, getTestResults, requestMockDataAccess, resetDemoData, runAutomatedTests, transitionConsent, getTestLabConfig, updateTestLabConfig } from "./api";
import ConsentTable from "./components/ConsentTable";
import Sidebar from "./components/Sidebar";
import StatCard from "./components/StatCard";
import Topbar from "./components/Topbar";
import { demoDataCategories, demoOrganisation, demoPurposes, demoUser, demoUsers } from "./data/demo";
import type { AccessResponse, ConsentEvent, ConsentRecord, ConsentStatus, DashboardStats, Section, TestLabConfig, TestResult } from "./types";

function App() {
  const defaultTestConfig: TestLabConfig = {
    extraNavigation: false,
    mandatoryField: false,
    extraConfirmation: false,
    unnecessaryError: false
  };
  const [section, setSection] = useState<Section>("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [consentEvents, setConsentEvents] = useState<ConsentEvent[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    active: 0, withdrawn: 0, tests: 0, passed: 0, failed: 0, needsReview: 0, activity: []
  });
  const [testConfig, setTestConfig] = useState<TestLabConfig>(defaultTestConfig);
  const [testRunning, setTestRunning] = useState(false);
  const [scenarioSaving, setScenarioSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [apiSuccess, setApiSuccess] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [accessPurpose, setAccessPurpose] = useState(demoPurposes[0].id);
  const [accessUser, setAccessUser] = useState(demoUser.id);
  const [accessCategory, setAccessCategory] = useState(demoPurposes[0].category);
  const [accessResult, setAccessResult] = useState<AccessResponse | null>(null);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(true);

  const refreshApplicationData = useCallback(async () => {
    try {
      const [records, events, stats, results, config] = await Promise.all([
        getConsents(),
        getConsentHistory(),
        getDashboardStats(),
        getTestResults(),
        getTestLabConfig()
      ]);
      setConsents(records);
      setConsentEvents(events);
      setDashboardStats(stats);
      setTestResults(results);
      setTestConfig(config);
    } finally {
      setApiLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshApplicationData().catch((error: unknown) => {
      setApiError(error instanceof Error ? error.message : "Unable to load sandbox data.");
    });
  }, [refreshApplicationData]);

  useEffect(() => {
    if (!apiSuccess) return;
    const timer = window.setTimeout(() => setApiSuccess(""), 5000);
    return () => window.clearTimeout(timer);
  }, [apiSuccess]);

  async function performConsentAction(action: () => Promise<unknown>, successMessage: string) {
    setApiError("");
    setApiSuccess("");
    setActionBusy(true);
    try {
      await action();
      await refreshApplicationData();
      setApiSuccess(successMessage);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to update consent.");
    } finally {
      setActionBusy(false);
    }
  }

  function createRequest(purposeId: string) {
    const purpose = demoPurposes.find((item) => item.id === purposeId)?.name ?? "consent";
    return performConsentAction(() => createConsentRequest(purposeId), `Consent request created for ${purpose}.`);
  }

  function updateConsent(id: string, action: "grant" | "reject" | "withdraw") {
    const successMessage = action === "grant" ? "Consent granted and saved." :
      action === "withdraw" ? "Consent withdrawn. Future access is blocked." : "Consent request rejected.";
    return performConsentAction(() => transitionConsent(id, action), successMessage);
  }

  function getAccessInput() {
    return { userId: accessUser, purposeId: accessPurpose, dataCategory: accessCategory };
  }

  async function checkAccess() {
    setApiError("");
    setApiSuccess("");
    setActionBusy(true);
    try {
      setAccessResult(await checkMockDataAccess(getAccessInput()));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to evaluate this request.");
    } finally {
      setActionBusy(false);
    }
  }

  async function requestAccess() {
    setApiError("");
    setApiSuccess("");
    setActionBusy(true);
    try {
      const response = await requestMockDataAccess(getAccessInput());
      setAccessResult(response);
      await refreshApplicationData();
      setApiSuccess(response.httpStatus === 200 ?
        "Mock data request allowed and recorded in the audit history." :
        "Access denied as expected; no protected mock data was returned.");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to request mock data.");
    } finally {
      setActionBusy(false);
    }
  }

  async function runTest(testId?: string) {
    setApiError("");
    setTestRunning(true);
    try {
      const response = await runAutomatedTests(testId);
      setTestConfig(response.config);
      await refreshApplicationData();
      const passes = response.results.filter((result) => result.status === "PASS").length;
      const failures = response.results.filter((result) => result.status === "FAIL").length;
      const reviews = response.results.filter((result) => result.status === "NEEDS REVIEW").length;
      setApiSuccess(`${response.results.length} test${response.results.length === 1 ? "" : "s"} completed: ${passes} passed, ${failures} failed, ${reviews} need review.`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to run the automated tests.");
    } finally {
      setTestRunning(false);
    }
  }

  async function changeTestConfig(config: TestLabConfig) {
    setApiError("");
    setApiSuccess("");
    setScenarioSaving(true);
    try {
      setTestConfig(await updateTestLabConfig(config));
      setApiSuccess("Withdrawal journey scenario saved.");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to update the withdrawal scenario.");
    } finally {
      setScenarioSaving(false);
    }
  }

  async function resetDemo() {
    setApiError("");
    setApiSuccess("");
    setResetting(true);
    try {
      const response = await resetDemoData();
      setAccessResult(null);
      setFilter("all");
      setSearch("");
      await refreshApplicationData();
      setApiSuccess(response.message);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to reset the synthetic demo data.");
    } finally {
      setResetting(false);
    }
  }

  function renderPage() {
    switch (section) {
      case "Consent Playground":
        return <PlaygroundPage consents={consents} onCreateRequest={createRequest} onUpdate={updateConsent} busy={actionBusy || resetting} />;
      case "Data Access Simulator":
        return <AccessPage userId={accessUser} onUserChange={(value) => { setAccessUser(value); setAccessResult(null); }} category={accessCategory} onCategoryChange={(value) => { setAccessCategory(value); setAccessResult(null); }} purpose={accessPurpose} onPurposeChange={(value) => { setAccessPurpose(value); setAccessResult(null); }} result={accessResult} onCheck={checkAccess} onRequest={requestAccess} busy={actionBusy || resetting} />;
      case "Automated Test Lab":
        return <TestLabPage results={testResults} onRun={runTest} stats={dashboardStats} config={testConfig} onConfigChange={changeTestConfig} running={testRunning || scenarioSaving || resetting} />;
      case "Consent History":
        return <HistoryPage events={consentEvents} filter={filter} onFilterChange={setFilter} search={search} onSearchChange={setSearch} />;
      default:
        return <DashboardPage stats={dashboardStats} consents={consents} onNavigate={setSection} results={testResults} onReset={resetDemo} resetting={resetting} />;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar current={section} onNavigate={setSection} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-area">
        <Topbar current={section} onMenuClick={() => setMobileOpen(true)} />
        <div className="page-content">
          {apiError && <div className="api-error" role="alert"><ShieldAlert size={16} /><span>{apiError}</span><button onClick={() => { setApiError(""); setApiLoading(true); refreshApplicationData().catch((error: unknown) => setApiError(error instanceof Error ? error.message : "Unable to reload sandbox data.")); }}>Retry loading</button></div>}
          {apiSuccess && <div className="api-success" role="status" aria-live="polite"><CheckCircle2 size={16} /><span>{apiSuccess}</span><button aria-label="Dismiss notification" onClick={() => setApiSuccess("")}>Dismiss</button></div>}
          {apiLoading && <div className="api-loading" role="status" aria-live="polite">Loading live synthetic data from the local consent sandbox…</div>}
          {renderPage()}
        </div>
        <footer className="page-footer"><span>© 2026 Anumati Sandbox</span><span><span className="footer-dot" /> Synthetic demo data · Not connected to real accounts</span><span className="footer-disclaimer">Not a regulated Consent Manager</span></footer>
      </main>
    </div>
  );
}

interface DashboardPageProps {
  stats: DashboardStats;
  consents: ConsentRecord[];
  onNavigate: (section: Section) => void;
  results: TestResult[];
  onReset: () => void;
  resetting: boolean;
}

function DashboardPage({ stats, consents, onNavigate, results, onReset, resetting }: DashboardPageProps) {
  const maximumActivity = Math.max(1, ...stats.activity.map((day) => day.grants + day.withdrawals));
  const chartScale = Math.ceil(maximumActivity / 4) * 4;
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> OVERVIEW</div><h1>Good morning, Aarav <span className="wave" aria-hidden="true">✦</span></h1><p>Live consent and test data from your local sandbox.</p></div>
        <div className="dashboard-actions"><button className="button button-secondary" onClick={onReset} disabled={resetting} title="Restore synthetic sample data and keep the audit trail"><RotateCcw size={15} /> {resetting ? "Resetting…" : "Reset demo"}</button><button className="button button-primary" onClick={() => onNavigate("Consent Playground")}><Plus size={17} /> New consent</button></div>
      </div>
      <div className="demo-banner">
        <div className="demo-banner-icon"><Sparkles size={17} /></div>
        <div><strong>You&apos;re exploring a test sandbox</strong><p>People, organisations, and consent records are synthetic. This application is not a regulated Consent Manager.</p></div>
        <span className="demo-banner-tag">DEMO DATA</span>
      </div>

      <section className="stats-grid" aria-label="Consent statistics">
        <StatCard label="Active consents" value={stats.active} helper="Current synthetic records" icon={ShieldCheck} tone="teal" />
        <StatCard label="Withdrawn consents" value={stats.withdrawn} helper="Current synthetic records" icon={ArrowDownRight} tone="blue" />
        <StatCard label="Tests executed" value={stats.tests} helper="Persisted backend outcomes" icon={FlaskConical} tone="amber" />
        <StatCard label="Failed tests" value={stats.failed} helper={stats.failed ? "Review the Test Lab results" : "No recorded failures"} icon={ShieldAlert} tone="rose" />
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
          <div className="panel-heading"><div><h2>Consent activity</h2><p>Recorded grants and withdrawals over the last 7 days</p></div><span className="page-demo-badge"><span /> LIVE DATA</span></div>
          <div className="chart-area" role="img" aria-label="Daily consent grant and withdrawal events over the last seven days">
            <div className="chart-y-labels" aria-hidden="true">{[4, 3, 2, 1, 0].map((step) => <span key={step}>{Math.round(chartScale * step / 4)}</span>)}</div>
            <div className="chart-content">
              <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
              <div className="bar-chart">
                {stats.activity.map((day) => (
                  <div className="bar-group" key={day.date} aria-label={`${day.date}: ${day.grants} grants, ${day.withdrawals} withdrawals`}>
                    <div className="bar-stack"><i className="bar-granted" style={{ height: `${day.grants / chartScale * 80}%` }} /><i className="bar-withdrawn" style={{ height: `${day.withdrawals / chartScale * 80}%` }} /></div>
                    <span>{day.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-legend"><span><i className="legend-granted" /> Granted</span><span><i className="legend-withdrawn" /> Withdrawn</span><span className="chart-demo-label">Append-only SQLite events</span></div>
        </section>
        <section className="panel test-summary">
          <div className="panel-heading"><div><h2>Latest test runs</h2><p>Quality checks in your sandbox</p></div><button className="text-button" onClick={() => onNavigate("Automated Test Lab")}>Test lab <ArrowRight size={14} /></button></div>
          {results.length === 0 ? <div className="dashboard-empty"><FlaskConical size={18} /><span>No test results yet. Run the suite in the Test Lab.</span></div> : <div className="test-list">
            {results.slice(0, 3).map((test) => <div className="test-row" key={test.id}><span className={`test-result-icon ${test.status === "PASS" ? "test-passed" : test.status === "FAIL" ? "test-failed" : "test-needs-review"}`}>{test.status === "PASS" ? <Check size={14} /> : test.status === "FAIL" ? <XCircle size={15} /> : <Activity size={14} />}</span><div className="test-row-copy"><strong>{test.name}</strong><small>{test.executionTimeMs} ms · {formatEventDate(test.executedAt)}</small></div><span className={`test-result-label ${test.status.toLowerCase().replace(" ", "-")}`}>{test.status}</span></div>)}
          </div>}
        </section>
      </div>
    </>
  );
}

interface PlaygroundPageProps {
  consents: ConsentRecord[];
  onCreateRequest: (purposeId: string) => void;
  onUpdate: (id: string, action: "grant" | "reject" | "withdraw") => void;
  busy: boolean;
}

function PlaygroundPage({ consents, onCreateRequest, onUpdate, busy }: PlaygroundPageProps) {
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
            return <article className="preference-row" key={purposeId}><div className="preference-icon"><Icon size={18} /></div><div className="preference-copy"><strong>{purpose}</strong><span>{description}</span><small>{category}{record ? ` · ${record.id} · ${record.status}` : ""}</small></div><div className="consent-actions">{active ? <button className="button button-secondary" disabled={busy} onClick={() => onUpdate(record.id, "withdraw")}>Withdraw</button> : pending ? <><button className="button button-secondary" disabled={busy} onClick={() => onUpdate(record.id, "reject")}>Reject</button><button className="button button-primary" disabled={busy} onClick={() => onUpdate(record.id, "grant")}>Grant</button></> : <button className="button button-secondary" disabled={busy} onClick={() => onCreateRequest(purposeId)}>{record ? "Request again" : "Create request"}</button>}</div></article>;
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
  userId: string;
  onUserChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  purpose: string;
  onPurposeChange: (value: string) => void;
  result: AccessResponse | null;
  onCheck: () => void;
  onRequest: () => void;
  busy: boolean;
}

function AccessPage({ userId, onUserChange, category, onCategoryChange, purpose, onPurposeChange, result, onCheck, onRequest, busy }: AccessPageProps) {
  const user = demoUsers.find((candidate) => candidate.id === userId) ?? demoUser;
  const selectedPurpose = demoPurposes.find((candidate) => candidate.id === purpose) ?? demoPurposes[0];
  const decision = result?.body.data;
  const allowed = decision?.decision === "allowed";
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> REQUEST SIMULATOR</div><h1>Data Access Simulator</h1><p>See how consent status affects a data access request.</p></div><span className="page-demo-badge"><span /> Mock API</span></div>
    <div className="demo-banner"><div className="demo-banner-icon"><Database size={17} /></div><div><strong>Backend-enforced access to synthetic data</strong><p>The API checks the user, exact purpose, data category, consent status, and expiry before returning mock data.</p></div><span className="demo-banner-tag">SYNTHETIC</span></div>
    <div className="access-layout"><section className="panel access-form"><div className="panel-heading"><div><h2>Simulate a data request</h2><p>Configure a mock request from the organisation</p></div></div>
      <label className="field-label">DATA FIDUCIARY</label><div className="mock-field"><span className="workspace-avatar">N</span><div><strong>{demoOrganisation.name}</strong><small>{demoOrganisation.id} · {demoOrganisation.sector}</small></div><span className="readonly-tag">DEMO</span></div>
      <label className="field-label" htmlFor="access-user">SYNTHETIC USER</label><select className="form-select" id="access-user" value={userId} onChange={(event) => onUserChange(event.target.value)}>{demoUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>)}</select>
      <label className="field-label" htmlFor="access-category">DATA CATEGORY</label><select className="form-select" id="access-category" value={category} onChange={(event) => onCategoryChange(event.target.value)}>{demoDataCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <label className="field-label" htmlFor="access-purpose">PROCESSING PURPOSE</label><select className="form-select" id="access-purpose" value={purpose} onChange={(event) => onPurposeChange(event.target.value)}>{demoPurposes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
      <div className="request-detail"><span>Data principal</span><strong>{user.name} <small>({user.id})</small></strong><span>Requested category</span><strong>{category}</strong><span>Processing purpose</span><strong>{selectedPurpose.name}</strong></div>
      <div className="access-buttons"><button className="button button-secondary" onClick={onCheck} disabled={busy}><ShieldCheck size={15} /> {busy ? "Checking…" : "Check consent"}</button><button className="button button-primary access-submit" onClick={onRequest} disabled={busy}><LockKeyhole size={15} /> {busy ? "Requesting…" : "Request mock data"}</button></div>
    </section>
    <section className="panel access-result-panel"><div className="panel-heading"><div><h2>API response</h2><p>Access decision from the backend</p></div>{result && <span className={`http-status ${allowed ? "http-allowed" : "http-denied"}`}>HTTP {result.httpStatus}</span>}</div>
      {!result ? <div className="result-empty"><div className="result-empty-icon"><Database size={22} /></div><strong>Ready to evaluate</strong><p>Check consent or request the protected mock data. Each access request is audited by the server.</p><div className="result-check"><span><Check size={13} /></span> Exact purpose and category check</div><div className="result-check"><span><Check size={13} /></span> Protected data returned only if authorised</div></div> : <div className={`result-outcome ${allowed ? "allowed" : "denied"}`} aria-live="polite"><div className={`outcome-icon ${allowed ? "allowed" : "denied"}`} >{allowed ? <CheckCircle2 size={26} /> : <XCircle size={26} />}</div><span className={`outcome-kicker ${allowed ? "allowed" : "denied"}`}>{allowed ? "REQUEST AUTHORISED" : "REQUEST DENIED"}</span><h3>{allowed ? "Consent is active" : "Access blocked"}</h3><p>{decision?.reason}</p><div className="outcome-record"><span>Matched consent</span><strong>{decision?.consentId ?? "None"}</strong><span>Consent status</span><strong className={allowed ? "allowed" : "denied"}>{decision?.consentStatus}</strong><span>Audit entry</span><strong>{decision?.auditId ? `#${decision.auditId}` : "Consent check only"}</strong></div><div className="api-response-json"><strong>{decision?.mockData ? "Protected mock data" : decision?.auditId ? "No protected data returned" : "Consent check response"}</strong><pre>{JSON.stringify(result.body, null, 2)}</pre></div><button className="button button-secondary" disabled={busy} onClick={onRequest}><RotateCcw size={15} /> Retry access request</button></div>}
    </section></div>
  </>;
}

interface TestLabPageProps {
  results: TestResult[];
  onRun: (testId?: string) => void;
  stats: DashboardStats;
  config: TestLabConfig;
  onConfigChange: (config: TestLabConfig) => void;
  running: boolean;
}

function TestLabPage({ results, onRun, stats, config, onConfigChange, running }: TestLabPageProps) {
  const cases = [
    { id: "grant", name: "Consent can be granted successfully", description: "A pending request transitions to active.", icon: CheckCircle2 },
    { id: "withdraw", name: "Consent can be withdrawn successfully", description: "An active consent transitions to withdrawn.", icon: ArrowDownRight },
    { id: "access-after-withdrawal", name: "Data access stops immediately after withdrawal", description: "Retry the same request after withdrawal and verify access is denied.", icon: LockKeyhole },
    { id: "no-consent", name: "Access without consent is denied", description: "No matching consent must produce a denied decision.", icon: ShieldAlert },
    { id: "purpose-mismatch", name: "Purpose and data-category mismatches are denied", description: "Consent for one purpose or category cannot authorize another.", icon: ShieldCheck },
    { id: "expired", name: "Expired consent is denied", description: "An expired permission cannot authorize access.", icon: Clock3 },
    { id: "audit-history", name: "Grant and withdrawal appear in audit history", description: "Verify both events remain in append-only history.", icon: FileCheck2 },
    { id: "repeated-withdrawal", name: "Repeated withdrawal preserves canonical state", description: "A second withdrawal must not reactivate consent or add a duplicate event.", icon: RotateCcw },
    { id: "withdrawal-ease", name: "Withdrawal requires no unjustified extra steps", description: "Compare actions, navigation, required fields, confirmations, obstacles, and errors.", icon: Activity }
  ];
  const currentJourneyResult = results.find((result) => result.testId === "withdrawal-ease")?.journeyComparison;
  function changeScenario(key: keyof TestLabConfig, value: boolean) {
    onConfigChange({ ...config, [key]: value });
  }
  const scenarioOptions: Array<{ key: keyof TestLabConfig; label: string; description: string }> = [
    { key: "extraNavigation", label: "Add extra navigation", description: "Route withdrawal through Account Settings and Privacy Centre." },
    { key: "mandatoryField", label: "Require an extra field", description: "Require a withdrawal explanation that granting does not request." },
    { key: "extraConfirmation", label: "Add an extra confirmation", description: "Require a second confirmation before withdrawal." },
    { key: "unnecessaryError", label: "Inject an unnecessary error", description: "Simulate an avoidable failure and recovery step." }
  ];
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> QUALITY ASSURANCE</div><h1>Automated Test Lab</h1><p>Run nine consent and withdrawal checks against real backend logic.</p></div><button className="button button-primary" onClick={() => onRun()} disabled={running} aria-busy={running}><FlaskConical size={16} /> {running ? "Working…" : "Run all tests"}</button></div>
    <div className="demo-banner"><div className="demo-banner-icon"><FlaskConical size={17} /></div><div><strong>Isolated tests against application consent logic</strong><p>Each run uses temporary SQLite data and leaves the persisted demo records unchanged. This is a technical assessment, not legal certification or a DPDP compliance score.</p></div><span className="demo-banner-tag">SYNTHETIC</span></div>
    <div className="test-lab-stats"><div><span className="mini-stat-icon green"><CheckCircle2 size={17} /></span><span><strong>{stats.passed}</strong><small>Passed total</small></span></div><div><span className="mini-stat-icon red"><XCircle size={17} /></span><span><strong>{stats.failed}</strong><small>Failed total</small></span></div><div><span className="mini-stat-icon amber"><Activity size={17} /></span><span><strong>{stats.needsReview}</strong><small>Needs review</small></span></div><div><span className="mini-stat-icon blue"><Activity size={17} /></span><span><strong>{stats.tests}</strong><small>Checks executed</small></span></div></div>
    <section className="panel scenario-panel"><div className="panel-heading"><div><h2>Withdrawal journey scenario</h2><p>Configure realistic friction to verify the tester catches it</p></div><button className="button button-secondary" disabled={running} onClick={() => onConfigChange({ extraNavigation: false, mandatoryField: false, extraConfirmation: false, unnecessaryError: false })}><RotateCcw size={14} /> Restore normal journey</button></div><div className="scenario-options">{scenarioOptions.map(({ key, label, description }) => <label className="scenario-option" key={key}><input type="checkbox" checked={config[key]} disabled={running} onChange={(event) => changeScenario(key, event.target.checked)} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div><p className="scenario-note">Scenario settings are stored by the backend. Run the “withdrawal ease” test after changing a setting to see PASS, FAIL, or NEEDS REVIEW.</p></section>
    <section className="panel test-cases-panel"><div className="panel-heading"><div><h2>Available test cases</h2><p>Run an individual backend check or the complete suite</p></div><span className="consent-count">{cases.length} test cases</span></div><div className="test-cases-list">{cases.map(({ id, name, description, icon: Icon }) => <article className="test-case-row" key={id}><span className="test-case-icon"><Icon size={18} /></span><div><strong>{name}</strong><p>{description}</p></div><button className="button button-secondary run-test-button" disabled={running} onClick={() => onRun(id)}>Run test <ArrowRight size={14} /></button></article>)}</div></section>
    {currentJourneyResult && <section className="panel journey-comparison"><div className="panel-heading"><div><h2>Journey comparison</h2><p>Measured from the configured synthetic workflow</p></div><span className={`journey-result ${currentJourneyResult.status.toLowerCase().replace(" ", "-")}`}>{currentJourneyResult.status}</span></div><div className="journey-table-wrap"><table className="journey-table"><thead><tr><th>Measure</th><th>Grant consent</th><th>Withdraw consent</th></tr></thead><tbody><tr><th>Action sequence</th><td>{currentJourneyResult.grant.actions.join(" → ")}</td><td>{currentJourneyResult.withdrawal.actions.join(" → ")}</td></tr><tr><th>User actions / clicks</th><td>{metricLabel(currentJourneyResult.grant.clicks, "click")}</td><td>{metricLabel(currentJourneyResult.withdrawal.clicks, "click")}</td></tr><tr><th>Navigation transitions</th><td>{currentJourneyResult.grant.navigationTransitions}</td><td>{currentJourneyResult.withdrawal.navigationTransitions}</td></tr><tr><th>Mandatory form fields</th><td>{currentJourneyResult.grant.mandatoryFields}</td><td>{currentJourneyResult.withdrawal.mandatoryFields}</td></tr><tr><th>Additional confirmations</th><td>{currentJourneyResult.grant.additionalConfirmations}</td><td>{currentJourneyResult.withdrawal.additionalConfirmations}</td></tr><tr><th>Unnecessary obstacles / errors</th><td>{currentJourneyResult.grant.unnecessaryObstacles} / {currentJourneyResult.grant.errors}</td><td>{currentJourneyResult.withdrawal.unnecessaryObstacles} / {currentJourneyResult.withdrawal.errors}</td></tr></tbody></table></div><p className="journey-explanation">{currentJourneyResult.explanation} Click counts alone do not establish DPDP compliance.</p></section>}
    <section className="panel results-panel"><div className="panel-heading"><div><h2>Recent test results</h2><p>Persisted outcomes, retained across refreshes (up to 50 shown)</p></div><span className="results-session">{results.length} results loaded</span></div>{results.length === 0 ? <div className="empty-state"><div className="empty-icon"><FlaskConical size={21} /></div><strong>No tests have been run</strong><p>Run an individual test or the complete suite to see measured results.</p></div> : <div className="detailed-test-results">{results.map((result) => <article className="detailed-test-result" key={result.id}><div className="test-result-heading"><span className={`status-badge test-status-${result.status.toLowerCase().replace(" ", "-")}`}><i />{result.status}</span><strong>{result.name}</strong><small>{result.executionTimeMs.toFixed(2)} ms · {formatEventDate(result.executedAt)}</small></div><dl><div><dt>Expected</dt><dd>{result.expectedResult}</dd></div><div><dt>Actual</dt><dd>{result.actualResult}</dd></div>{result.failureExplanation && <div><dt>Explanation</dt><dd className="failure-explanation">{result.failureExplanation}</dd></div>}</dl></article>)}</div>}</section>
  </>;
}

function metricLabel(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
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
    <section className="panel history-panel"><div className="history-toolbar"><div><h2>Consent &amp; access events</h2><p>{visibleEvents.length} {visibleEvents.length === 1 ? "event" : "events"} in this view</p></div><div className="history-controls"><label className="search-field"><SearchIcon /><input aria-label="Search consent events" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search events..." /></label><select className="filter-select" aria-label="Filter by event type" value={filter} onChange={(event) => onFilterChange(event.target.value)}><option value="all">All events</option><option value="requested">Requested</option><option value="granted">Granted</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option><option value="access_allowed">Access allowed</option><option value="access_denied">Access denied</option><option value="demo_reset">Sandbox reset</option></select></div></div>
      {visibleEvents.length === 0 ? <div className="empty-state"><div className="empty-icon"><HistoryIcon /></div><strong>No consent or access events found</strong><p>{events.length === 0 ? "Consent and data-access activity will appear here as you use the sandbox." : "Try changing your search or event filter."}</p></div> : <div className="table-scroll"><table className="consent-table event-table"><thead><tr><th>EVENT</th><th>PROCESSING PURPOSE</th><th>DATA CATEGORY</th><th>CONSENT / AUDIT ID</th><th>TIMESTAMP</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td><span className={`status-badge status-${eventStatus(event.eventType)}`}><i />{formatEventName(event.eventType)}</span></td><td><div className="purpose-cell"><span className="purpose-icon"><ShieldCheck size={15} /></span><span><strong>{event.purpose}</strong><small>{event.userId}</small></span></div></td><td className="date-cell">{event.category}</td><td className="date-cell">{event.consentId ?? `ACCESS-${event.id.toString().replace("access-", "")}`}</td><td className="date-cell">{formatEventDate(event.occurredAt)}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="history-note"><ShieldCheck size={16} /><span>In a production system, consent records should be tamper-evident and retained according to applicable policies.</span></div>
  </>;
}

function eventStatus(event: ConsentEvent["eventType"]): ConsentStatus {
  if (event === "requested" || event === "demo_reset") return "pending";
  if (event === "granted" || event === "access_allowed") return "active";
  if (event === "access_denied") return "rejected";
  return event;
}

function formatEventName(event: ConsentEvent["eventType"]): string {
  if (event === "access_allowed") return "Access allowed";
  if (event === "access_denied") return "Access denied";
  if (event === "demo_reset") return "Sandbox reset";
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

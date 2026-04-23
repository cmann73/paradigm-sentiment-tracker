'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────
interface DailyData { date: string; count: number; unique_accounts: number; high_severity_count: number; alerts_count: number; avg_sentiment: number; }
interface SourceBreak { source: string; count: number; avg_sentiment: number; }
interface Mention { id: number; source: string; title: string | null; content: string; url: string; published_at: string; severity_score: number; sentiment_score: number; threat_level: string; threat_keywords: string[]; employee_mentions: string[]; }
interface Alert { id: number; mention_id: number; alert_level: string; alert_reason: string; is_reviewed: boolean; created_at: string; }
interface ThreatKw { keyword: string; count: number; }
interface EmpMention { name: string; count: number; sentiment: number; }
interface ApiData {
  ok: boolean; last_updated: string; target: string; error?: string;
  stats: { total_mentions: number; unique_accounts: number; avg_sentiment: number; threat_counts: { critical: number; high: number; medium: number; low: number }; daily_data: DailyData[]; source_breakdown: SourceBreak[]; };
  high_severity_mentions: Mention[]; alerts: Alert[]; recent_mentions: Mention[];
  threat_keywords: ThreatKw[]; employee_mentions: EmpMention[];
}

// ── Styles ───────────────────────────────────────────────────────────────────
const G = { black: '#000000', dark: '#0A0A0A', gray: '#1A1A1A', border: '#2A2A2A', muted: '#666666', green: '#00D395', red: '#FF4D4D', orange: '#FF9F43', yellow: '#FFE066', white: '#FFFFFF' };

const globalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Space Grotesk', system-ui, sans-serif; }
  body { background: #000; color: #fff; }
  .font-mono { font-family: 'Space Mono', monospace !important; }
  @keyframes pulseGreen { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .pulse { animation: pulseGreen 2s infinite; }
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0A0A0A} ::-webkit-scrollbar-thumb{background:#2A2A2A}
  input,select { color: #fff; background: transparent; }
  input::placeholder { color: #666; }
`;

// ── Components ────────────────────────────────────────────────────────────────
const border = { border: `1px solid ${G.border}` };

function Badge({ type, children }: { type: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { critical: G.red, high: G.orange, medium: G.yellow, low: G.green, none: G.muted, reddit: '#FF4500', twitter: G.white, news: G.green, news_coindesk: G.green, news_theblock: G.green };
  const c = colors[type] || G.muted;
  return <span style={{ padding: '2px 8px', border: `1px solid ${c}`, color: c, fontSize: 11, fontFamily: 'Space Mono', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</span>;
}

function StatBlock({ label, value, subtext, accent }: { label: string; value: string | number; subtext?: string; accent?: boolean }) {
  return (
    <div style={{ ...border, padding: 24 }}>
      <div style={{ fontSize: 30, fontFamily: 'Space Mono', fontWeight: 700, color: accent ? G.green : G.white }}>{value}</div>
      <div style={{ color: G.muted, fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      {subtext && <div style={{ color: G.muted, fontSize: 11, marginTop: 8, fontFamily: 'Space Mono' }}>{subtext}</div>}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const colors: Record<string, string> = { critical: G.red, high: G.orange, medium: G.yellow };
  const c = colors[alert.alert_level] || G.muted;
  return (
    <div style={{ borderLeft: `2px solid ${c}`, paddingLeft: 16, paddingTop: 12, paddingBottom: 12, borderBottom: `1px solid ${G.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: G.muted }}>{new Date(alert.created_at).toLocaleString()}</span>
        <Badge type={alert.alert_level}>{alert.alert_level}</Badge>
        {!alert.is_reviewed && <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: G.green, display: 'inline-block' }} />}
      </div>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{alert.alert_reason}</p>
    </div>
  );
}

function MentionCard({ mention }: { mention: Mention }) {
  const srcType = mention.source.startsWith('news') ? 'news' : mention.source;
  const sevColor = mention.severity_score >= 6 ? G.red : mention.severity_score >= 4 ? G.yellow : G.green;
  return (
    <div style={{ ...border, padding: 20, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge type={srcType}>{mention.source.replace('news_', '')}</Badge>
          <Badge type={mention.threat_level}>{mention.threat_level || 'none'}</Badge>
        </div>
        <div style={{ fontSize: 20, fontFamily: 'Space Mono', fontWeight: 700, color: sevColor }}>{mention.severity_score?.toFixed(1)}</div>
      </div>
      {mention.title && <h3 style={{ fontWeight: 500, marginBottom: 8 }}>{mention.title}</h3>}
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{mention.content}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'Space Mono' }}>
        <div style={{ display: 'flex', gap: 16, color: G.muted }}>
          <span>SENT: <span style={{ color: mention.sentiment_score < -0.2 ? G.red : mention.sentiment_score > 0.2 ? G.green : G.white }}>{mention.sentiment_score?.toFixed(2)}</span></span>
          {mention.threat_keywords?.length > 0 && <span style={{ color: G.orange }}>⚠ {mention.threat_keywords.length}</span>}
          {mention.employee_mentions?.length > 0 && <span style={{ color: G.green }}>@ {mention.employee_mentions.join(', ')}</span>}
        </div>
        <span style={{ color: G.muted }}>{new Date(mention.published_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

const CHART_COMMON = { tooltip: { contentStyle: { background: G.gray, border: `1px solid ${G.border}`, borderRadius: 0, fontFamily: 'Space Mono', fontSize: 11 } } };

function SentimentChart({ data }: { data: DailyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={G.gray} strokeDasharray="0" />
        <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fill: G.muted, fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="sent" domain={[-1, 1]} tick={{ fill: G.green, fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="vol" orientation="right" tick={{ fill: G.muted, fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
        <Tooltip {...CHART_COMMON.tooltip} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted }} />
        <Line yAxisId="sent" type="monotone" dataKey="avg_sentiment" name="Sentiment" stroke={G.green} strokeWidth={1.5} dot={false} />
        <Line yAxisId="vol" type="monotone" dataKey="count" name="Mentions" stroke={G.muted} strokeWidth={1} strokeDasharray="4 4" dot={false} />
        <Line yAxisId="vol" type="monotone" dataKey="unique_accounts" name="Unique Accounts" stroke={G.orange} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AlertsTrendChart({ data }: { data: DailyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={G.gray} strokeDasharray="0" />
        <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fill: G.muted, fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: G.muted, fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
        <Tooltip {...CHART_COMMON.tooltip} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted }} />
        <Line type="monotone" dataKey="high_severity_count" name="High Severity" stroke={G.orange} strokeWidth={2} dot={{ r: 2, fill: G.orange }} />
        <Line type="monotone" dataKey="alerts_count" name="Alerts" stroke={G.red} strokeWidth={2} dot={{ r: 2, fill: G.red }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SourceChart({ data }: { data: SourceBreak[] }) {
  const COLORS = ['#FF4500', G.white, G.green, G.muted];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="source" cx="50%" cy="45%" innerRadius="55%" outerRadius="75%" strokeWidth={2} stroke={G.black}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip {...CHART_COMMON.tooltip} formatter={(v, n) => [v, String(n).replace('news_', '').toUpperCase()]} />
        <Legend formatter={v => v.replace('news_', '').toUpperCase()} wrapperStyle={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Home() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('paradigm');

  const fetchData = useCallback(async (t: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/sentiment?target=${t}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(target); }, [fetchData, target]);

  const filteredMentions = useMemo(() => {
    if (!data) return [];
    let items = [...(data.recent_mentions || []), ...(data.high_severity_mentions || [])];
    if (filter === 'high_severity') items = items.filter(m => m.severity_score >= 6);
    else if (filter !== 'all') items = items.filter(m => m.source.includes(filter));
    if (search) { const t = search.toLowerCase(); items = items.filter(m => m.title?.toLowerCase().includes(t) || m.content?.toLowerCase().includes(t)); }
    return items.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()).slice(0, 50);
  }, [data, filter, search]);

  const unreviewedAlerts = data?.alerts?.filter(a => !a.is_reviewed) || [];

  const switchTarget = (t: string) => { setTarget(t); setActiveTab('overview'); };

  return (
    <>
      <style>{globalStyle}</style>
      <div style={{ minHeight: '100vh', background: G.black }}>

        {/* Loading banner */}
        {loading && (
          <div style={{ background: 'rgba(0,211,149,0.08)', borderBottom: `1px solid rgba(0,211,149,0.2)`, color: G.green, padding: '8px 24px', textAlign: 'center', fontSize: 11, fontFamily: 'Space Mono' }}>
            FETCHING LIVE DATA FROM CENTAUR — THIS MAY TAKE 30–60 SECONDS
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ background: 'rgba(255,77,77,0.08)', borderBottom: `1px solid rgba(255,77,77,0.2)`, color: G.red, padding: '8px 24px', textAlign: 'center', fontSize: 11, fontFamily: 'Space Mono' }}>
            ERROR: {error} — <button onClick={() => fetchData(target)} style={{ color: G.green, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Mono', fontSize: 11 }}>RETRY</button>
          </div>
        )}

        {/* Header */}
        <header style={{ borderBottom: `1px solid ${G.border}` }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Diamond logo */}
                <div style={{ width: 32, height: 32, border: `1px solid ${G.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 16, height: 16, border: `1px solid ${G.green}`, transform: 'rotate(45deg)' }} />
                </div>
                <div>
                  <h1 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>Paradigm</h1>
                  <p style={{ color: G.muted, fontSize: 10, fontFamily: 'Space Mono', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Sentiment Tracker</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Target switcher */}
                <div style={{ display: 'flex', gap: 0, border: `1px solid ${G.border}` }}>
                  {[['paradigm', '@paradigm'], ['matt_huang', 'Matt Huang']].map(([val, label]) => (
                    <button key={val} onClick={() => switchTarget(val)} style={{
                      padding: '6px 14px', background: target === val ? G.green : 'transparent',
                      color: target === val ? G.black : G.muted, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontFamily: 'Space Mono', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{label}</button>
                  ))}
                </div>

                {unreviewedAlerts.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: G.red, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontFamily: 'Space Mono', color: G.red }}>{unreviewedAlerts.length} ALERTS</span>
                  </div>
                )}

                {data && <span style={{ color: G.muted, fontSize: 11, fontFamily: 'Space Mono' }}>{new Date(data.last_updated).toLocaleString()}</span>}
                <button onClick={() => fetchData(target)} disabled={loading} style={{
                  background: loading ? G.gray : G.green, color: loading ? G.muted : G.black,
                  border: 'none', padding: '6px 16px', fontSize: 11, fontFamily: 'Space Mono',
                  textTransform: 'uppercase', letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                  {loading ? '···' : '↻ REFRESH'}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <nav style={{ display: 'flex', gap: 32 }}>
              {['overview', 'alerts', 'mentions', 'trends'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 10,
                  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: activeTab === tab ? G.white : G.muted,
                  borderBottom: `2px solid ${activeTab === tab ? G.green : 'transparent'}`,
                }}>{tab}</button>
              ))}
            </nav>
          </div>
        </header>

        <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>
          {loading && !data && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
              <div style={{ width: 40, height: 40, border: `2px solid ${G.border}`, borderTop: `2px solid ${G.green}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: G.muted, fontSize: 12, fontFamily: 'Space Mono', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Querying Centaur AI…</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {data && activeTab === 'overview' && (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: G.border, marginBottom: 40 }}>
                <StatBlock label="Total Mentions" value={data.stats.total_mentions} />
                <StatBlock label="Unique Accounts" value={data.stats.unique_accounts} subtext={`${Math.round((data.stats.unique_accounts / data.stats.total_mentions) * 100)}% of mentions`} />
                <StatBlock label="Avg Sentiment" value={data.stats.avg_sentiment.toFixed(2)} accent={data.stats.avg_sentiment > 0} />
                <StatBlock label="Critical" value={data.stats.threat_counts.critical} />
                <StatBlock label="High" value={data.stats.threat_counts.high} />
                <StatBlock label="Medium" value={data.stats.threat_counts.medium} />
              </div>

              {/* Charts row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 40 }}>
                <div style={{ ...border, padding: 24 }}>
                  <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>30-Day Trend — Sentiment, Mentions & Unique Accounts</h2>
                  <SentimentChart data={data.stats.daily_data} />
                </div>
                <div style={{ ...border, padding: 24 }}>
                  <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Source Distribution</h2>
                  <SourceChart data={data.stats.source_breakdown} />
                </div>
              </div>

              {/* Alerts & High Severity Trend */}
              <div style={{ ...border, padding: 24, marginBottom: 40 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>30-Day Trend — Alerts & High Severity Mentions</h2>
                  <div style={{ display: 'flex', gap: 20, fontSize: 10, fontFamily: 'Space Mono' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 12, height: 2, background: G.orange, display: 'inline-block' }} /><span style={{ color: G.muted }}>High Severity</span></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 12, height: 2, background: G.red, display: 'inline-block' }} /><span style={{ color: G.muted }}>Alerts</span></span>
                  </div>
                </div>
                <AlertsTrendChart data={data.stats.daily_data} />
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${G.border}`, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', textAlign: 'center', gap: 16 }}>
                  {[
                    { val: data.stats.daily_data.reduce((s, d) => s + (d.high_severity_count || 0), 0), label: 'Total High Severity', color: G.orange },
                    { val: data.stats.daily_data.reduce((s, d) => s + (d.alerts_count || 0), 0), label: 'Total Alerts', color: G.red },
                    { val: (data.stats.daily_data.reduce((s, d) => s + (d.high_severity_count || 0), 0) / 30).toFixed(1), label: 'Avg/Day (High Sev)', color: G.white },
                    { val: (data.stats.daily_data.reduce((s, d) => s + (d.alerts_count || 0), 0) / 30).toFixed(1), label: 'Avg/Day (Alerts)', color: G.white },
                  ].map((s, i) => (
                    <div key={i}><div style={{ fontSize: 24, fontFamily: 'Space Mono', fontWeight: 700, color: s.color }}>{s.val}</div><div style={{ fontSize: 10, color: G.muted, textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div></div>
                  ))}
                </div>
              </div>

              {/* High severity + alerts two-column */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={border}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${G.border}` }}>
                    <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>High Severity Mentions</h2>
                  </div>
                  <div style={{ padding: 16, maxHeight: 380, overflowY: 'auto' }}>
                    {data.high_severity_mentions.map(m => <MentionCard key={m.id} mention={m} />)}
                  </div>
                </div>
                <div style={border}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${G.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Alerts</h2>
                    {unreviewedAlerts.length > 0 && <span style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.green }}>{unreviewedAlerts.length} NEW</span>}
                  </div>
                  <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                    {data.alerts.map(a => <AlertRow key={a.id} alert={a} />)}
                  </div>
                </div>
              </div>
            </>
          )}

          {data && activeTab === 'alerts' && (
            <div style={border}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${G.border}` }}>
                <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>All Alerts</h2>
              </div>
              {data.alerts.map(a => <AlertRow key={a.id} alert={a} />)}
            </div>
          )}

          {data && activeTab === 'mentions' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <input type="text" placeholder="Search mentions..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: `1px solid ${G.border}`, padding: '8px 16px', fontSize: 13, fontFamily: 'Space Mono', color: G.white, outline: 'none' }} />
                <select value={filter} onChange={e => setFilter(e.target.value)}
                  style={{ background: G.black, border: `1px solid ${G.border}`, padding: '8px 16px', fontSize: 13, fontFamily: 'Space Mono', color: G.white, outline: 'none' }}>
                  <option value="all">All Sources</option>
                  <option value="high_severity">High Severity</option>
                  <option value="reddit">Reddit</option>
                  <option value="twitter">Twitter</option>
                  <option value="news">News</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {filteredMentions.map(m => <MentionCard key={m.id} mention={m} />)}
              </div>
            </div>
          )}

          {data && activeTab === 'trends' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ ...border, padding: 24 }}>
                <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Sentiment & Mentions Over Time</h2>
                <SentimentChart data={data.stats.daily_data} />
              </div>

              <div style={{ ...border, padding: 24 }}>
                <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Alerts & High Severity Over Time</h2>
                <AlertsTrendChart data={data.stats.daily_data} />
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${G.border}`, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', textAlign: 'center', gap: 16 }}>
                  {(() => {
                    const r = data.stats.daily_data.slice(-7), p = data.stats.daily_data.slice(-14, -7);
                    const rHS = r.reduce((s, d) => s + (d.high_severity_count || 0), 0);
                    const pHS = p.reduce((s, d) => s + (d.high_severity_count || 0), 0);
                    const rA = r.reduce((s, d) => s + (d.alerts_count || 0), 0);
                    const pA = p.reduce((s, d) => s + (d.alerts_count || 0), 0);
                    const hsChg = pHS > 0 ? Math.round((rHS - pHS) / pHS * 100) : 0;
                    const aChg = pA > 0 ? Math.round((rA - pA) / pA * 100) : 0;
                    return [
                      { val: rHS, label: 'High Severity (7d)', color: G.orange },
                      { val: `${hsChg > 0 ? '+' : ''}${hsChg}%`, label: 'vs Previous Week', color: hsChg > 0 ? G.red : hsChg < 0 ? G.green : G.white },
                      { val: rA, label: 'Alerts (7d)', color: G.red },
                      { val: `${aChg > 0 ? '+' : ''}${aChg}%`, label: 'vs Previous Week', color: aChg > 0 ? G.red : aChg < 0 ? G.green : G.white },
                    ].map((s, i) => (
                      <div key={i}><div style={{ fontSize: 24, fontFamily: 'Space Mono', fontWeight: 700, color: s.color }}>{s.val}</div><div style={{ fontSize: 10, color: G.muted, textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div></div>
                    ));
                  })()}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={{ ...border, padding: 24 }}>
                  <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Top Threat Keywords</h2>
                  {(data.threat_keywords || []).map((kw, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontFamily: 'Space Mono', fontSize: 13 }}>{kw.keyword}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 96, height: 2, background: G.border }}>
                          <div style={{ height: '100%', background: G.green, width: `${((kw.count / (data.threat_keywords[0]?.count || 1)) * 100)}%` }} />
                        </div>
                        <span style={{ fontFamily: 'Space Mono', fontSize: 11, color: G.muted, width: 20 }}>{kw.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ ...border, padding: 24 }}>
                  <h2 style={{ fontSize: 10, fontFamily: 'Space Mono', color: G.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Employee Mentions</h2>
                  {(data.employee_mentions || []).map((em, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${G.border}` }}>
                      <span style={{ fontSize: 13 }}>{em.name}</span>
                      <div style={{ display: 'flex', gap: 20, fontFamily: 'Space Mono', fontSize: 11 }}>
                        <span style={{ color: em.sentiment < 0 ? G.red : G.green }}>{em.sentiment > 0 ? '+' : ''}{em.sentiment?.toFixed(2)}</span>
                        <span style={{ color: G.muted }}>{em.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        <footer style={{ borderTop: `1px solid ${G.border}`, padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ color: G.muted, fontSize: 10, fontFamily: 'Space Mono', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Paradigm Sentiment Tracker — Internal Security Tool — Powered by Centaur AI</p>
        </footer>
      </div>
    </>
  );
}

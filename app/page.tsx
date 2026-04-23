'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface Theme {
  theme: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  count: number;
}

interface Highlight {
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  source: string;
  date: string;
}

interface SentimentData {
  target: string;
  period: string;
  total_mentions: number;
  unique_accounts: number;
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  severity_counts: { high: number; medium: number; low: number; alerts: number };
  top_themes: Theme[];
  recent_highlights: Highlight[];
  trend_summary: string;
}

interface ApiResponse {
  ok: boolean;
  last_updated: string;
  data: SentimentData[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const GREEN = '#00ff85';
const GRAY = '#444444';
const RED = '#ff4444';
const ORANGE = '#ff8800';
const YELLOW = '#ffcc00';

const SENTIMENT_COLORS = { positive: GREEN, neutral: GRAY, negative: RED };
const PIE_COLORS = [GREEN, GRAY, RED];

// ── Helpers ──────────────────────────────────────────────────────────────────

function sentimentScore(b: SentimentData['sentiment_breakdown']) {
  return Math.round(b.positive - b.negative);
}

function scoreLabel(score: number) {
  if (score > 20) return { label: 'Positive', color: GREEN };
  if (score < -10) return { label: 'Negative', color: RED };
  return { label: 'Neutral', color: GRAY };
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SentimentBadge({ s }: { s: 'positive' | 'neutral' | 'negative' }) {
  const colors: Record<string, string> = {
    positive: '#00ff85',
    neutral: '#888888',
    negative: '#ff4444',
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      color: '#000',
      background: colors[s],
      textTransform: 'capitalize',
    }}>{s}</span>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: color || '#fff', letterSpacing: '-0.02em' }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: '#555' }}>{sub}</span>}
    </div>
  );
}

function SeverityBar({ counts }: { counts: SentimentData['severity_counts'] }) {
  const items = [
    { label: 'Alerts', value: counts.alerts, color: RED },
    { label: 'High', value: counts.high, color: ORANGE },
    { label: 'Medium', value: counts.medium, color: YELLOW },
    { label: 'Low', value: counts.low, color: GRAY },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 56, fontSize: 12, color: '#666' }}>{label}</span>
          <div style={{ flex: 1, height: 6, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, value * 5)}%`,
              background: color,
              borderRadius: 3,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <span style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600, color }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function SubjectPanel({ data }: { data: SentimentData }) {
  const score = sentimentScore(data.sentiment_breakdown);
  const { label, color } = scoreLabel(score);
  const pieData = [
    { name: 'Positive', value: data.sentiment_breakdown.positive },
    { name: 'Neutral', value: data.sentiment_breakdown.neutral },
    { name: 'Negative', value: data.sentiment_breakdown.negative },
  ];
  const barData = data.top_themes.map(t => ({
    name: t.theme.length > 18 ? t.theme.slice(0, 16) + '…' : t.theme,
    count: t.count,
    fill: SENTIMENT_COLORS[t.sentiment],
  }));

  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid #1e1e1e',
      borderRadius: 16,
      padding: 28,
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{data.target}</h2>
          <span style={{ fontSize: 12, color: '#555' }}>{data.period}</span>
        </div>
        <div style={{
          background: '#111',
          border: `1px solid ${color}33`,
          borderRadius: 8,
          padding: '6px 14px',
          color,
          fontWeight: 700,
          fontSize: 13,
        }}>
          {score > 0 ? '+' : ''}{score} · {label}
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <StatCard label="Total Mentions" value={fmt(data.total_mentions)} />
        <StatCard label="Unique Accounts" value={fmt(data.unique_accounts)} />
      </div>

      {/* Sentiment pie */}
      <div>
        <h3 style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Sentiment Breakdown</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" strokeWidth={0}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }}
                formatter={(v: number) => [`${v}%`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pieData.map((item, i) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i] }} />
                <span style={{ fontSize: 13, color: '#aaa' }}>{item.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: PIE_COLORS[i] }}>{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Severity */}
      <div>
        <h3 style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Severity Breakdown</h3>
        <SeverityBar counts={data.severity_counts} />
      </div>

      {/* Top themes bar chart */}
      {barData.length > 0 && (
        <div>
          <h3 style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Top Themes</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }}
                cursor={{ fill: '#ffffff08' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trend summary */}
      <div style={{
        background: '#111',
        border: '1px solid #1e1e1e',
        borderRadius: 10,
        padding: '14px 16px',
      }}>
        <h3 style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Trend Summary</h3>
        <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>{data.trend_summary}</p>
      </div>

      {/* Highlights */}
      {data.recent_highlights.length > 0 && (
        <div>
          <h3 style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recent Highlights</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recent_highlights.map((h, i) => (
              <div key={i} style={{
                background: '#111',
                border: '1px solid #1e1e1e',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <SentimentBadge s={h.sentiment} />
                    <span style={{ fontSize: 11, color: '#555' }}>{h.source}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#444' }}>{h.date}</span>
                </div>
                <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>&ldquo;{h.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sentiment');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setApiData(json);
      setLastUpdated(new Date(json.last_updated).toLocaleString());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch sentiment data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ minHeight: '100vh', background: '#060606' }}>
      {/* Nav */}
      <header style={{
        borderBottom: '1px solid #161616',
        padding: '0 32px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        background: '#060606',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Paradigm wordmark */}
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>PARADIGM</span>
          <span style={{ color: '#333', fontSize: 16 }}>|</span>
          <span style={{ fontSize: 13, color: '#555', letterSpacing: '0.04em' }}>SENTIMENT TRACKER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#444' }}>Updated {lastUpdated}</span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: loading ? '#111' : '#00ff85',
              color: loading ? '#555' : '#000',
              border: 'none',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.02em',
            }}
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 8 }}>
            Sentiment Dashboard
          </h1>
          <p style={{ fontSize: 14, color: '#555' }}>
            Live sentiment monitoring for Paradigm and Matt Huang · Powered by Centaur AI
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
            gap: 20,
          }}>
            <div style={{
              width: 48, height: 48,
              border: '3px solid #1e1e1e',
              borderTop: '3px solid #00ff85',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: '#555', fontSize: 14 }}>Fetching live sentiment data from Centaur…</p>
            <p style={{ color: '#333', fontSize: 12 }}>This may take 30–60 seconds while the AI analyzes mentions</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{
            background: '#110000',
            border: '1px solid #330000',
            borderRadius: 12,
            padding: 24,
            color: '#ff6666',
            textAlign: 'center',
          }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Failed to load sentiment data</p>
            <p style={{ fontSize: 13, color: '#884444' }}>{error}</p>
            <button onClick={fetchData} style={{
              marginTop: 16, background: '#ff4444', color: '#fff',
              border: 'none', borderRadius: 8, padding: '8px 20px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>Retry</button>
          </div>
        )}

        {/* Data panels */}
        {!loading && apiData && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: 24 }}>
            {apiData.data.map((d, i) => (
              <SubjectPanel key={i} data={d} />
            ))}
          </div>
        )}
      </main>

      <footer style={{
        borderTop: '1px solid #111',
        padding: '20px 32px',
        textAlign: 'center',
        color: '#333',
        fontSize: 11,
        letterSpacing: '0.04em',
      }}>
        PARADIGM · INTERNAL USE ONLY · POWERED BY CENTAUR AI
      </footer>
    </div>
  );
}

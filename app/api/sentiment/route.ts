import { NextResponse } from 'next/server';

const API = process.env.CENTAUR_API_URL || 'https://svc-ai.dayno.xyz';
const KEY = process.env.CENTAUR_API_KEY || '';

async function centaurFetch(path: string, body?: object) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) headers['X-Api-Key'] = KEY;
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

async function runAgent(prompt: string): Promise<string> {
  const threadKey = `sentiment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const spawn = await centaurFetch('/agent/spawn', { thread_key: threadKey, harness: 'amp' });
  const ag = spawn.assignment_generation;
  await centaurFetch('/agent/message', {
    thread_key: threadKey, assignment_generation: ag,
    role: 'user', parts: [{ type: 'text', text: prompt }],
  });
  const execute = await centaurFetch('/agent/execute', {
    thread_key: threadKey, assignment_generation: ag,
    harness: 'amp', delivery: { platform: 'dev' },
  });
  const executionId = execute.execution_id;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await centaurFetch(`/agent/executions/${executionId}`);
    if (status.status === 'completed') return status.result_text || '';
    if (['failed', 'cancelled'].includes(status.status)) throw new Error(`Agent ${status.status}`);
  }
  throw new Error('Agent timed out');
}

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\n?([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function buildPrompt(target: string, isExec: boolean) {
  const label = isExec ? 'Matt Huang (co-founder and managing partner of Paradigm crypto VC firm)' : '@paradigm (Paradigm the crypto VC firm)';
  const sources = 'Twitter/X, Reddit (r/cryptocurrency, r/ethfinance, r/defi), CoinDesk, The Block, and general web search';
  return `Search ${sources} for mentions of ${label} from the last 30 days.

Analyze sentiment and return ONLY a JSON object with this exact structure (no other text):
{
  "target": "${target}",
  "stats": {
    "total_mentions": <number>,
    "unique_accounts": <number>,
    "avg_sentiment": <number between -1 and 1>,
    "threat_counts": { "critical": <n>, "high": <n>, "medium": <n>, "low": <n> },
    "daily_data": [
      { "date": "YYYY-MM-DD", "count": <n>, "unique_accounts": <n>, "high_severity_count": <n>, "alerts_count": <n>, "avg_sentiment": <-1 to 1> }
      ... 30 entries, one per day for the past 30 days
    ],
    "source_breakdown": [
      { "source": "reddit", "count": <n>, "avg_sentiment": <-1 to 1> },
      { "source": "twitter", "count": <n>, "avg_sentiment": <-1 to 1> },
      { "source": "news_coindesk", "count": <n>, "avg_sentiment": <-1 to 1> },
      { "source": "news_theblock", "count": <n>, "avg_sentiment": <-1 to 1> }
    ]
  },
  "high_severity_mentions": [
    {
      "id": <n>, "source": "reddit|twitter|news_coindesk|news_theblock",
      "title": "<title or null>", "content": "<excerpt>",
      "url": "<url>", "published_at": "<ISO date>",
      "severity_score": <1-10>, "sentiment_score": <-1 to 1>,
      "threat_level": "critical|high|medium|low|none",
      "threat_keywords": ["<word>"], "employee_mentions": ["<name>"]
    }
    ... up to 5 high severity mentions
  ],
  "alerts": [
    {
      "id": <n>, "mention_id": <n>, "alert_level": "critical|high|medium",
      "alert_reason": "<reason>", "is_reviewed": false,
      "created_at": "<ISO date>"
    }
    ... up to 5 alerts
  ],
  "recent_mentions": [
    {
      "id": <n>, "source": "reddit|twitter|news_coindesk|news_theblock",
      "title": "<title or null>", "content": "<excerpt>",
      "url": "<url>", "published_at": "<ISO date>",
      "severity_score": <1-10>, "sentiment_score": <-1 to 1>,
      "threat_level": "none|low|medium|high",
      "threat_keywords": [], "employee_mentions": []
    }
    ... up to 20 recent mentions
  ],
  "threat_keywords": [
    { "keyword": "<word>", "count": <n> }
    ... top 5 threat keywords found
  ],
  "employee_mentions": [
    { "name": "<person>", "count": <n>, "sentiment": <-1 to 1> }
    ... up to 5 people mentioned
  ]
}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target') || 'paradigm';
  const isExec = target === 'matt_huang';

  try {
    const text = await runAgent(buildPrompt(target, isExec));
    const data = parseJson(text);
    if (!data) throw new Error('Could not parse agent response');
    return NextResponse.json({ ok: true, last_updated: new Date().toISOString(), ...data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

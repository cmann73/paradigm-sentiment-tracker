import { NextResponse } from 'next/server';

const API = process.env.CENTAUR_API_URL || 'https://svc-ai.dayno.xyz';
const KEY = process.env.CENTAUR_API_KEY || '';

async function centaurFetch(path: string, body?: object) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
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

  const spawn = await centaurFetch('/agent/spawn', {
    thread_key: threadKey,
    harness: 'amp',
  });
  const ag = spawn.assignment_generation;

  await centaurFetch('/agent/message', {
    thread_key: threadKey,
    assignment_generation: ag,
    role: 'user',
    parts: [{ type: 'text', text: prompt }],
  });

  const execute = await centaurFetch('/agent/execute', {
    thread_key: threadKey,
    assignment_generation: ag,
    harness: 'amp',
    delivery: { platform: 'dev' },
  });
  const executionId = execute.execution_id;

  // Poll for completion
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await centaurFetch(`/agent/executions/${executionId}`);
    if (status.status === 'completed') {
      return status.result_text || '';
    }
    if (['failed', 'cancelled'].includes(status.status)) {
      throw new Error(`Agent ${status.status}`);
    }
  }
  throw new Error('Agent timed out');
}

function parseJsonFromText(text: string): object | null {
  const match = text.match(/```json\n?([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const PARADIGM_PROMPT = `Search Twitter/X and the web for recent mentions of @paradigm (Paradigm the crypto VC firm) from the last 30 days.

Analyze the sentiment and return a JSON object with this exact structure:
{
  "target": "Paradigm (@paradigm)",
  "period": "Last 30 days",
  "total_mentions": <number>,
  "unique_accounts": <number>,
  "sentiment_breakdown": {
    "positive": <percentage 0-100>,
    "neutral": <percentage 0-100>,
    "negative": <percentage 0-100>
  },
  "severity_counts": {
    "high": <number of high-severity negative mentions>,
    "medium": <number>,
    "low": <number>,
    "alerts": <number of urgent/threatening mentions>
  },
  "top_themes": [
    {"theme": "<theme name>", "sentiment": "positive|neutral|negative", "count": <number>},
    ...up to 6 themes
  ],
  "recent_highlights": [
    {"text": "<short quote or summary>", "sentiment": "positive|neutral|negative", "source": "Twitter|Reddit|News", "date": "<date>"},
    ...up to 5 highlights
  ],
  "trend_summary": "<2-3 sentence summary of how sentiment has trended this month>"
}

Return ONLY the JSON object, no other text.`;

    const MATT_PROMPT = `Search Twitter/X and the web for recent mentions of Matt Huang (co-founder and managing partner of Paradigm crypto VC) from the last 30 days.

Analyze the sentiment and return a JSON object with this exact structure:
{
  "target": "Matt Huang",
  "period": "Last 30 days",
  "total_mentions": <number>,
  "unique_accounts": <number>,
  "sentiment_breakdown": {
    "positive": <percentage 0-100>,
    "neutral": <percentage 0-100>,
    "negative": <percentage 0-100>
  },
  "severity_counts": {
    "high": <number of high-severity negative mentions>,
    "medium": <number>,
    "low": <number>,
    "alerts": <number of urgent/threatening mentions>
  },
  "top_themes": [
    {"theme": "<theme name>", "sentiment": "positive|neutral|negative", "count": <number>},
    ...up to 6 themes
  ],
  "recent_highlights": [
    {"text": "<short quote or summary>", "sentiment": "positive|neutral|negative", "source": "Twitter|Reddit|News", "date": "<date>"},
    ...up to 5 highlights
  ],
  "trend_summary": "<2-3 sentence summary of how sentiment has trended this month>"
}

Return ONLY the JSON object, no other text.`;

    // Run both agents in parallel
    const [paradigmText, mattText] = await Promise.all([
      runAgent(PARADIGM_PROMPT),
      runAgent(MATT_PROMPT),
    ]);

    const paradigmData = parseJsonFromText(paradigmText) || getFallback('Paradigm (@paradigm)');
    const mattData = parseJsonFromText(mattText) || getFallback('Matt Huang');

    return NextResponse.json({
      ok: true,
      last_updated: new Date().toISOString(),
      data: [paradigmData, mattData],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function getFallback(target: string) {
  return {
    target,
    period: 'Last 30 days',
    total_mentions: 0,
    unique_accounts: 0,
    sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
    severity_counts: { high: 0, medium: 0, low: 0, alerts: 0 },
    top_themes: [],
    recent_highlights: [],
    trend_summary: 'Data unavailable.',
  };
}

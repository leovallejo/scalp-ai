import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
  SCALP.AI - Mobile Binance Futures dashboard
  Educational analysis only. No order execution. No financial advice.
*/

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const TFS = ["1m", "5m", "15m"];
const MODELS = [
  // ── FREE MODELS ──────────────────────────────────────────────────
  { id: "meta-llama/llama-3.1-8b-instruct:free",       label: "🆓 Llama 3.1 8B (Free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free",      label: "🆓 Llama 3.3 70B (Free)" },
  { id: "mistralai/mistral-7b-instruct:free",           label: "🆓 Mistral 7B (Free)" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "🆓 Mistral Small 24B (Free)" },
  { id: "google/gemma-3-12b-it:free",                  label: "🆓 Google Gemma 3 12B (Free)" },
  { id: "google/gemma-3-27b-it:free",                  label: "🆓 Google Gemma 3 27B (Free)" },
  { id: "deepseek/deepseek-chat-v3-0324:free",         label: "🆓 DeepSeek V3 (Free)" },
  { id: "deepseek/deepseek-r1:free",                   label: "🆓 DeepSeek R1 Reasoning (Free)" },
  { id: "qwen/qwen3-8b:free",                          label: "🆓 Qwen3 8B (Free)" },
  { id: "qwen/qwen3-30b-a3b:free",                     label: "🆓 Qwen3 30B (Free)" },
  // ── CLAUDE (Anthropic) ───────────────────────────────────────────
  { id: "anthropic/claude-haiku-4-5",                  label: "⚡ Claude Haiku 4.5 (Fast)" },
  { id: "anthropic/claude-sonnet-4-5",                 label: "🧠 Claude Sonnet 4.5" },
  { id: "anthropic/claude-sonnet-4-6",                 label: "🧠 Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4-6",                   label: "🔮 Claude Opus 4.6 (Best)" },
  // ── GOOGLE ───────────────────────────────────────────────────────
  { id: "google/gemini-flash-1.5",                     label: "⚡ Gemini Flash 1.5" },
  { id: "google/gemini-flash-2.0",                     label: "⚡ Gemini Flash 2.0" },
  { id: "google/gemini-pro-1.5",                       label: "🧠 Gemini Pro 1.5" },
  { id: "google/gemini-2.0-flash-thinking-exp:free",   label: "🆓 Gemini 2.0 Flash Thinking (Free)" },
  // ── OPENAI ───────────────────────────────────────────────────────
  { id: "openai/gpt-4o-mini",                          label: "⚡ GPT-4o Mini (Cheap)" },
  { id: "openai/gpt-4o",                               label: "🧠 GPT-4o" },
  { id: "openai/o1-mini",                              label: "🔮 o1 Mini Reasoning" },
  // ── MISTRAL ──────────────────────────────────────────────────────
  { id: "mistralai/mixtral-8x7b-instruct",             label: "🧠 Mixtral 8x7B" },
  { id: "mistralai/mistral-large",                     label: "🔮 Mistral Large" },
  // ── DEEPSEEK ─────────────────────────────────────────────────────
  { id: "deepseek/deepseek-chat",                      label: "🧠 DeepSeek V3 Chat" },
  { id: "deepseek/deepseek-r1",                        label: "🔮 DeepSeek R1 Reasoning" },
  // ── PERPLEXITY ───────────────────────────────────────────────────
  { id: "perplexity/llama-3.1-sonar-large-128k-online", label: "🌐 Perplexity Sonar (Web)" },
];

function fmt(v, d = 2) {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return "--";
  return Number(v).toFixed(d);
}

function calcEMA(closes, period) {
  if (!closes || closes.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calcVWAP(candles) {
  let cumTV = 0;
  let cumV = 0;
  return candles.map((c) => {
    const tp = (c.high + c.low + c.close) / 3;
    cumTV += tp * c.volume;
    cumV += c.volume;
    return cumV === 0 ? c.close : cumTV / cumV;
  });
}

function calcRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return [];
  const out = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return out;
}

function calcStochRSI(closes) {
  const rsi = calcRSI(closes, 14);
  if (rsi.length < 14) return { k: [], d: [] };
  const raw = [];
  for (let i = 13; i < rsi.length; i++) {
    const slice = rsi.slice(i - 13, i + 1);
    const lo = Math.min(...slice);
    const hi = Math.max(...slice);
    raw.push(hi === lo ? 50 : ((rsi[i] - lo) / (hi - lo)) * 100);
  }
  const sma = (arr, p) =>
    arr
      .map((_, i) => (i < p - 1 ? null : arr.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p))
      .filter((v) => v !== null);
  const k = sma(raw, 3);
  const d = sma(k, 3);
  return { k, d };
}

function calcATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return [];
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  if (trs.length < period) return [];
  const out = [];
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out.push(atr);
  }
  return out;
}

function calcVolRatio(volumes) {
  if (!volumes || volumes.length < 21) return 1;
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  return avg === 0 ? 1 : volumes[volumes.length - 1] / avg;
}

function detectPattern(candles) {
  const [c1, c2, c3] = candles.slice(-3);
  if (!c1 || !c2 || !c3) return "No data";
  const body = (c) => Math.abs(c.close - c.open);
  const isBull = (c) => c.close > c.open;
  const isBear = (c) => c.close < c.open;
  const lw = (c) => Math.min(c.open, c.close) - c.low;
  const uw = (c) => c.high - Math.max(c.open, c.close);
  if (isBear(c2) && isBull(c3) && c3.open < c2.close && c3.close > c2.open) return "Bullish Engulfing";
  if (isBull(c2) && isBear(c3) && c3.open > c2.close && c3.close < c2.open) return "Bearish Engulfing";
  if (lw(c3) > body(c3) * 2 && uw(c3) < body(c3)) return "Hammer";
  if (uw(c3) > body(c3) * 2 && lw(c3) < body(c3)) return "Shooting Star";
  if (body(c3) < (c3.high - c3.low) * 0.1) return "Doji";
  if ([c1, c2, c3].every(isBull)) return "3 Green Candles";
  if ([c1, c2, c3].every(isBear)) return "3 Red Candles";
  return "No pattern";
}

function buildSnap(candles, livePrice) {
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const price = Number(livePrice || closes[closes.length - 1] || 0);
  const e7a = calcEMA(closes, 7);
  const e25a = calcEMA(closes, 25);
  const e99a = calcEMA(closes, 99);
  const ema7 = e7a[e7a.length - 1] ?? price;
  const ema25 = e25a[e25a.length - 1] ?? price;
  const ema99 = e99a[e99a.length - 1] ?? price;
  const vwapA = calcVWAP(candles);
  const vwap = vwapA[vwapA.length - 1] ?? price;
  const st = calcStochRSI(closes);
  const stK = st.k[st.k.length - 1] ?? 50;
  const stD = st.d[st.d.length - 1] ?? 50;
  const prevK = st.k[st.k.length - 2] ?? stK;
  const prevD = st.d[st.d.length - 2] ?? stD;
  const atrA = calcATR(candles, 14);
  const atr = atrA[atrA.length - 1] ?? price * 0.002;
  const volR = calcVolRatio(vols);
  const pat = detectPattern(candles);
  const lookback = candles.slice(-30);
  const hiR = lookback.length ? Math.max(...lookback.map((c) => c.high)) : price;
  const loR = lookback.length ? Math.min(...lookback.map((c) => c.low)) : price;
  const bull = ema7 > ema25 && ema25 > ema99;
  const bear = ema7 < ema25 && ema25 < ema99;
  const emaS = bull ? "BULLISH" : bear ? "BEARISH" : "MIXED";
  let stCross = "NEUTRAL";
  if (prevK < prevD && stK > stD && stK < 30) stCross = "BULL CROSS oversold";
  else if (prevK > prevD && stK < stD && stK > 70) stCross = "BEAR CROSS overbought";
  else if (stK > stD) stCross = "K above D";
  else stCross = "K below D";
  const volS = volR > 1.8 ? "HIGH" : volR > 1.2 ? "ABOVE AVG" : volR < 0.7 ? "LOW" : "NORMAL";
  const vsV = price > vwap * 1.001 ? "ABOVE" : price < vwap * 0.999 ? "BELOW" : "AT";
  let score = 0;
  if (bull) score += 3;
  else if (bear) score -= 3;
  if (price > vwap) score += 2;
  else score -= 2;
  if (stK < 20 && stK > stD) score += 3;
  else if (stK > 80 && stK < stD) score -= 3;
  else if (stK > stD) score += 1;
  else score -= 1;
  if (volR > 1.5) score += Math.sign(score || 1);
  if (pat.includes("Bull") || pat.includes("Hammer") || pat.includes("Green")) score += 1;
  if (pat.includes("Bear") || pat.includes("Shoot") || pat.includes("Red")) score -= 1;
  return {
    price, ema7, ema25, ema99, vwap, stK, stD, atr, volR, emaS, stCross, volS, vsV, pat, hiR, loR, score,
    e7a, e25a, e99a, vwapA,
    slL: price - atr * 1.5, tp1L: price + atr * 1.5, tp2L: price + atr * 3,
    slS: price + atr * 1.5, tp1S: price - atr * 1.5, tp2S: price - atr * 3,
  };
}

function buildLowErrorDecision(snaps, market) {
  const s1 = snaps["1m"];
  const s5 = snaps["5m"];
  const s15 = snaps["15m"];
  if (!s1 || !s5 || !s15 || !market) {
    return { direction: "WAIT", confidence: 0, risk: "HIGH", reason: "Missing data.", blockers: ["Missing data"] };
  }
  const cfg = { maxSpreadPct: 0.025, minVolRatio: 0.9, maxAtrPct: 0.9, minAtrPct: 0.05, minScoreAbs: 3, maxFundingAbs: 0.0005 };
  const blockers = [];
  const spreadPct = market.book.spreadPct;
  const fundingAbs = Math.abs(market.funding.lastFundingRate || 0);
  const atrPct = s15.price === 0 ? 999 : (s15.atr / s15.price) * 100;
  const signs = [s1.score, s5.score, s15.score].map((x) => Math.sign(x));
  const allBull = signs.every((x) => x > 0);
  const allBear = signs.every((x) => x < 0);
  const avgScore = (s1.score + s5.score + s15.score) / 3;
  if (!(allBull || allBear)) blockers.push("1m, 5m, and 15m are not aligned");
  if (Math.abs(avgScore) < cfg.minScoreAbs) blockers.push("Average score is too weak");
  if (spreadPct > cfg.maxSpreadPct) blockers.push("Spread too wide");
  if (s15.volR < cfg.minVolRatio) blockers.push("Volume too low");
  if (atrPct > cfg.maxAtrPct) blockers.push("ATR too high, wick risk elevated");
  if (atrPct < cfg.minAtrPct) blockers.push("ATR too low, not enough movement after fees");
  if (fundingAbs > cfg.maxFundingAbs) blockers.push("Funding too aggressive");
  const trendLong = s15.emaS === "BULLISH" && s5.emaS !== "BEARISH" && s15.price > s15.vwap && s5.price > s5.vwap;
  const trendShort = s15.emaS === "BEARISH" && s5.emaS !== "BULLISH" && s15.price < s15.vwap && s5.price < s5.vwap;
  if (allBull && !trendLong) blockers.push("Long bias lacks EMA/VWAP confirmation");
  if (allBear && !trendShort) blockers.push("Short bias lacks EMA/VWAP confirmation");
  let direction = "WAIT";
  if (blockers.length === 0) {
    if (allBull && trendLong) direction = "LONG";
    if (allBear && trendShort) direction = "SHORT";
  }
  const confidence = direction === "WAIT"
    ? Math.max(5, Math.min(45, Math.round(50 - blockers.length * 8)))
    : Math.max(55, Math.min(90, Math.round(60 + Math.abs(avgScore) * 4 + Math.min(s15.volR, 2) * 5 - spreadPct * 500)));
  const risk = direction === "WAIT" || blockers.length >= 2 ? "HIGH" : spreadPct < cfg.maxSpreadPct * 0.6 && s15.volR > 1.2 && atrPct < 0.5 ? "LOW" : "MEDIUM";
  return {
    direction, confidence, risk,
    reason: direction === "WAIT" ? "No trade. " + blockers.join("; ") : direction + " allowed. MTF aligned, spread valid, volume valid, ATR valid, VWAP/EMA confirmed.",
    blockers, spreadPct, atrPct, fundingRate: market.funding.lastFundingRate, bid: market.book.bid, ask: market.book.ask,
  };
}

function ruleToFinal(lowError) {
  if (!lowError) return null;
  return lowError.direction === "WAIT"
    ? { direction: "NEUTRAL", confidence: lowError.confidence, risk: lowError.risk, reasoning: lowError.reason, source: "LIVE_RULE" }
    : { ...lowError, reasoning: lowError.reason, source: "LIVE_RULE" };
}

function fuseAgentDecision(lowError, agentDecision) {
  const ruleFinal = ruleToFinal(lowError);
  if (!ruleFinal || !agentDecision) return ruleFinal;
  const agentDir = String(agentDecision.direction || "").toUpperCase();
  const agentRisk = String(agentDecision.risk || ruleFinal.risk || "HIGH").toUpperCase();
  const agentConfidence = Number(agentDecision.confidence || 0);
  const agentReason = agentDecision.reasoning || agentDecision.reason || "Agent supplied no rationale.";

  if (lowError.direction === "WAIT") {
    return {
      direction: "NEUTRAL",
      confidence: Math.min(agentConfidence || lowError.confidence, 45),
      risk: "HIGH",
      reasoning: `${lowError.reason} Agent note: ${agentReason}`,
      source: "LIVE_RULE_BLOCKED",
    };
  }

  if (agentDir === lowError.direction) {
    return {
      ...lowError,
      direction: lowError.direction,
      confidence: Math.max(55, Math.min(92, Math.round((lowError.confidence * 0.65) + ((agentConfidence || lowError.confidence) * 0.35)))),
      risk: agentRisk === "HIGH" || lowError.risk === "HIGH" ? "HIGH" : agentRisk === "LOW" && lowError.risk === "LOW" ? "LOW" : "MEDIUM",
      reasoning: `Live gate and agent agree on ${lowError.direction}. ${agentReason}`,
      source: "LIVE_RULE_PLUS_AGENT",
    };
  }

  return {
    direction: "NEUTRAL",
    confidence: Math.min(55, Math.max(25, lowError.confidence - 15)),
    risk: "HIGH",
    reasoning: `No final trade: live gate says ${lowError.direction}, but agent says ${agentDir || "NEUTRAL"}. ${lowError.reason}`,
    source: "AGENT_DISAGREES",
  };
}

function tfToMs(tf) {
  const n = parseInt(tf, 10);
  if (tf.endsWith("m")) return n * 60 * 1000;
  if (tf.endsWith("h")) return n * 60 * 60 * 1000;
  return 60 * 1000;
}

function updateLiveCandleSet(candles, tf, trade) {
  if (!Array.isArray(candles) || candles.length === 0 || !trade?.price) return candles;
  const ms = tfToMs(tf);
  const bucket = Math.floor((trade.time || Date.now()) / ms) * ms;
  const next = candles.slice();
  const last = { ...next[next.length - 1] };
  const price = Number(trade.price);
  const qty = Number(trade.qty || 0);
  if (bucket > last.time) {
    next.push({ time: bucket, open: last.close, high: price, low: price, close: price, volume: qty });
    return next.slice(-200);
  }
  if (bucket === last.time) {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    last.volume = Math.max(0, last.volume + qty);
    next[next.length - 1] = last;
  }
  return next;
}

function calcPositionSize(accountUsd, riskPct, entry, stop, leverage) {
  const riskUsd = accountUsd * (riskPct / 100);
  const stopDistance = Math.abs(entry - stop);
  if (!entry || !stop || stopDistance === 0 || !isFinite(stopDistance)) return { riskUsd: 0, qty: 0, notional: 0, marginNeeded: 0 };
  const qty = riskUsd / stopDistance;
  const notional = qty * entry;
  const marginNeeded = leverage > 0 ? notional / leverage : notional;
  return { riskUsd, qty, notional, marginNeeded };
}

async function fetchKlines(symbol, tf) {
  const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=200`);
  if (!r.ok) throw new Error("Binance Futures error " + r.status);
  const d = await r.json();
  return d.map((k) => ({ time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }));
}

async function fetchBookTicker(symbol) {
  const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=${symbol}`);
  if (!r.ok) throw new Error("Book ticker error " + r.status);
  const d = await r.json();
  const bid = parseFloat(d.bidPrice);
  const ask = parseFloat(d.askPrice);
  const mid = (bid + ask) / 2;
  return { bid, ask, mid, spreadPct: mid === 0 ? 999 : ((ask - bid) / mid) * 100 };
}

async function fetchFunding(symbol) {
  const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
  if (!r.ok) throw new Error("Funding error " + r.status);
  const d = await r.json();
  return { markPrice: parseFloat(d.markPrice), indexPrice: parseFloat(d.indexPrice), lastFundingRate: parseFloat(d.lastFundingRate), nextFundingTime: d.nextFundingTime };
}

async function askAI(apiKey, model, prompt, imageDataUrl) {
  const content = imageDataUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : prompt;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey, "HTTP-Referer": window.location.origin, "X-Title": "ScalpAI" },
    body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error("API error " + res.status + ": " + (await res.text()));
  const j = await res.json();
  return j?.choices?.[0]?.message?.content || "No AI output.";
}

function extractJsonBlock(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];
  const loose = text.match(/\{[\s\S]*\}/);
  return loose ? loose[0] : null;
}

function useSystemDark() {
  const [isDark, setIsDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e) => setIsDark(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return isDark;
}

function useLivePrice(symbol) {
  const [price, setPrice] = useState(null);
  const [trade, setTrade] = useState(null);
  const [status, setStatus] = useState("connecting");
  const lastRef = useRef(null);
  useEffect(() => {
    let ws;
    let closed = false;
    setPrice(null);
    setStatus("connecting");
    try {
      ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@trade`);
      ws.onopen = () => !closed && setStatus("live");
      ws.onmessage = (event) => {
        try {
          const j = JSON.parse(event.data);
          const p = Number(j.p);
          if (Number.isFinite(p)) {
            lastRef.current = p;
            setPrice(p);
            setTrade({ price: p, qty: Number(j.q || 0), time: Number(j.T || Date.now()) });
          }
        } catch {}
      };
      ws.onerror = () => !closed && setStatus("socket error");
      ws.onclose = () => !closed && setStatus(lastRef.current ? "last live" : "closed");
    } catch {
      setStatus("unsupported");
    }
    return () => {
      closed = true;
      try { ws?.close(); } catch {}
    };
  }, [symbol]);
  return { livePrice: price, liveTrade: trade, liveStatus: status };
}

function makeTheme(mode, systemDark) {
  const dark = mode === "system" ? systemDark : mode === "dark";
  return dark
    ? { dark: true, bg: "#05050a", panel: "#08080f", card: "#0d0d16", card2: "#10101a", border: "#1a1a28", text: "#e2e8f0", muted: "#7a8499", faint: "#384052", faint2: "#202636", green: "#22c55e", red: "#ef4444", yellow: "#f59e0b", blue: "#3b82f6", purple: "#a855f7" }
    : { dark: false, bg: "#f5f7fb", panel: "#ffffff", card: "#eef2f7", card2: "#ffffff", border: "#d7deea", text: "#101827", muted: "#475569", faint: "#64748b", faint2: "#d7deea", green: "#15803d", red: "#dc2626", yellow: "#b45309", blue: "#2563eb", purple: "#7c3aed" };
}

function InfoTip({ t, text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Show details"
        style={{ marginLeft: 5, width: 18, height: 18, borderRadius: 999, border: `1px solid ${t.border}`, background: t.card, color: t.muted, fontSize: 11, cursor: "pointer", padding: 0 }}
      >
        i
      </button>
      {open && (
        <span style={{ position: "absolute", zIndex: 50, top: 22, left: -10, width: 220, background: t.dark ? "#111827" : "#ffffff", color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 1.45, boxShadow: "0 10px 25px rgba(0,0,0,.25)" }}>
          {text}
        </span>
      )}
    </span>
  );
}

function Cell({ t, label, value, color, sub, tip }) {
  return (
    <div style={{ background: t.card, borderRadius: 9, padding: "9px 10px", border: `1px solid ${t.border}` }}>
      <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4, display: "flex", alignItems: "center" }}>
        {label}{tip && <InfoTip t={t} text={tip} />}
      </div>
      <div style={{ color: color || t.text, fontWeight: 800, fontSize: 12, fontFamily: "monospace", wordBreak: "break-word" }}>{value}</div>
      {sub && <div style={{ color: t.muted, fontSize: 9, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniChart({ t, candles, e7, e25, vw }) {
  if (!candles || candles.length < 2) return null;
  const last = candles.slice(-50);
  const W = 600;
  const H = 110;
  const hi = Math.max(...last.map((c) => c.high));
  const lo = Math.min(...last.map((c) => c.low));
  const range = hi - lo || 1;
  const xS = (W - 8) / last.length;
  const yP = (v) => H - 5 - ((v - lo) / range) * (H - 14);
  const xP = (i) => 4 + i * xS + xS / 2;
  const lp = (arr) => arr.slice(-50).map((v, i) => `${xP(i)},${yP(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 95, display: "block" }}>
      {last.map((c, i) => {
        const x = xP(i);
        const cw = Math.max(xS * 0.6, 1);
        const bull = c.close >= c.open;
        const col = bull ? t.green : t.red;
        const bTop = yP(Math.max(c.open, c.close));
        const bH = Math.max(Math.abs(yP(c.open) - yP(c.close)), 1);
        return <g key={i}><line x1={x} y1={yP(c.high)} x2={x} y2={yP(c.low)} stroke={col} strokeWidth="0.8" opacity="0.55" /><rect x={x - cw / 2} y={bTop} width={cw} height={bH} fill={col} opacity="0.9" /></g>;
      })}
      {e7?.length > 1 && <polyline points={lp(e7)} fill="none" stroke={t.blue} strokeWidth="1.25" />}
      {e25?.length > 1 && <polyline points={lp(e25)} fill="none" stroke={t.yellow} strokeWidth="1.25" />}
      {vw?.length > 1 && <polyline points={lp(vw)} fill="none" stroke={t.purple} strokeWidth="1" strokeDasharray="3,2" />}
    </svg>
  );
}

function TFCard({ t, tf, snap }) {
  if (!snap) return null;
  const dir = snap.score >= 3 ? "LONG" : snap.score <= -3 ? "SHORT" : "WAIT";
  const col = dir === "LONG" ? t.green : dir === "SHORT" ? t.red : t.yellow;
  return <div style={{ flex: 1, minWidth: 88, background: t.panel, border: `1px solid ${col}55`, borderRadius: 10, padding: 10 }}>
    <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace" }}>{tf}</div>
    <div style={{ color: col, fontWeight: 900, fontSize: 15, fontFamily: "monospace" }}>{dir}</div>
    <div style={{ color: t.muted, fontSize: 10 }}>Score {snap.score > 0 ? "+" : ""}{snap.score}</div>
    <div style={{ color: t.muted, fontSize: 10 }}>{snap.emaS}</div>
    <div style={{ color: t.muted, fontSize: 10 }}>K {fmt(snap.stK, 1)}</div>
  </div>;
}

function AgentBox({ t, id, status, output }) {
  const cfg = { technical: [t.blue, "AGENT 01 TECHNICAL"], fundamental: [t.green, "AGENT 02 FUNDAMENTAL"], synthesis: [t.purple, "AGENT 03 SYNTHESIS"] };
  const [color, label] = cfg[id];
  return <div style={{ background: t.panel, border: `1px solid ${status === "done" ? color + "66" : t.border}`, borderRadius: 12, padding: 13, minHeight: 72 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: status === "idle" ? t.faint2 : color, boxShadow: status === "loading" ? `0 0 8px ${color}` : "none" }} />
      <span style={{ color, fontSize: 10, fontFamily: "monospace", letterSpacing: 1.5, fontWeight: 800 }}>{label}</span>
      <span style={{ marginLeft: "auto", color: t.faint, fontSize: 10 }}>{status}</span>
    </div>
    <div style={{ color: t.muted, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{output || "// standby"}</div>
  </div>;
}

function SignalBox({ t, pred, snap, accountUsd, riskPct, leverage }) {
  if (!pred || !snap) return null;
  const isL = pred.direction === "LONG";
  const isS = pred.direction === "SHORT";
  const col = isL ? t.green : isS ? t.red : t.yellow;
  const sl = isL ? snap.slL : isS ? snap.slS : null;
  const tp1 = isL ? snap.tp1L : isS ? snap.tp1S : null;
  const tp2 = isL ? snap.tp2L : isS ? snap.tp2S : null;
  const rr = tp1 && sl ? (Math.abs(tp1 - snap.price) / Math.abs(sl - snap.price)).toFixed(1) : null;
  const pos = sl ? calcPositionSize(accountUsd, riskPct, snap.price, sl, leverage) : null;
  const cells = [
    ["ENTRY", "$" + fmt(snap.price), t.muted], ["STOP LOSS", sl ? "$" + fmt(sl) : "--", t.red], ["TP 1", tp1 ? "$" + fmt(tp1) : "--", t.green],
    ["TP 2", tp2 ? "$" + fmt(tp2) : "--", t.green], ["ATR", "$" + fmt(snap.atr, 3), t.muted], ["SUPPORT", "$" + fmt(snap.loR), t.blue],
    ["QTY", pos ? pos.qty.toFixed(4) : "--", t.muted], ["MARGIN", pos ? "$" + fmt(pos.marginNeeded, 2) : "--", t.yellow], ["RISK USD", pos ? "$" + fmt(pos.riskUsd, 2) : "--", t.red],
  ];
  return <div style={{ background: t.panel, border: `2px solid ${col}`, borderRadius: 16, padding: 16, boxShadow: `0 0 30px ${col}20` }}>
    <div style={{ textAlign: "center", marginBottom: 14 }}>
      <div style={{ color: t.faint, fontFamily: "monospace", fontSize: 9, letterSpacing: 3, marginBottom: 7 }}>FINAL SIGNAL</div>
      <div style={{ color: col, fontSize: 30, fontWeight: 900, fontFamily: "monospace", letterSpacing: 3 }}>{isL ? "LONG" : isS ? "SHORT" : "WAIT"}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", color: t.muted, fontSize: 11 }}>Confidence <b style={{ color: col }}>{pred.confidence ?? 0}%</b> Risk <b style={{ color: pred.risk === "HIGH" ? t.red : pred.risk === "LOW" ? t.green : t.yellow }}>{pred.risk || "HIGH"}</b>{rr && <> R:R <b style={{ color: t.text }}>1:{rr}</b></>}</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>{cells.map(([l, v, c]) => <Cell key={l} t={t} label={l} value={v} color={c} />)}</div>
    <div style={{ background: t.card, borderRadius: 9, padding: 10, color: t.muted, fontSize: 12, lineHeight: 1.6, border: `1px solid ${t.border}` }}><b style={{ color: t.faint }}>RATIONALE</b><br />{pred.reasoning || pred.reason || "No rationale."}</div>
  </div>;
}

export default function App() {
  const REFRESH_INTERVAL = 30000; // candle data refresh every 30s

  const systemDark = useSystemDark();
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("scalp_theme") || "dark");
  const t = useMemo(() => makeTheme(themeMode, systemDark), [themeMode, systemDark]);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("scalp_or_key") || "");
  const [model, setModel] = useState(() => localStorage.getItem("scalp_or_model") || "meta-llama/llama-3.1-8b-instruct:free");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const { livePrice, liveTrade, liveStatus } = useLivePrice(symbol);
  const [snaps, setSnaps] = useState({});
  const [candles, setCandles] = useState([]);
  const [market, setMarket] = useState(null);
  const [rulePred, setRulePred] = useState(null);
  const [pred, setPred] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [agSt, setAgSt] = useState({ technical: "idle", fundamental: "idle", synthesis: "idle" });
  const [agOut, setAgOut] = useState({ technical: "", fundamental: "", synthesis: "" });
  const [accountUsd, setAccountUsd] = useState(100);
  const [riskPct, setRiskPct] = useState(0.5);
  const [leverage, setLeverage] = useState(3);
  const [screenshot, setScreenshot] = useState(null);
  const [nextRefresh, setNextRefresh] = useState(REFRESH_INTERVAL / 1000);
  const autoRef = useRef(null);
  const countdownRef = useRef(null);
  const loadingRef = useRef(false);
  const snapsRef = useRef({});
  const candleSetsRef = useRef({});
  const rulePredRef = useRef(null);
  const marketRef = useRef(null);
  const livePriceRef = useRef(null);
  const agentDecisionRef = useRef(null);

  useEffect(() => { localStorage.setItem("scalp_theme", themeMode); }, [themeMode]);
  useEffect(() => { localStorage.setItem("scalp_or_key", apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem("scalp_or_model", model); }, [model]);
  useEffect(() => { livePriceRef.current = livePrice; }, [livePrice]);

  // ── LOAD CANDLE + MARKET DATA (no AI) ───────────────────────────
  const loadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErr("");
    try {
      const results = await Promise.all(TFS.map((tf) => fetchKlines(symbol, tf)));
      const ns = {};
      const candleSets = {};
      TFS.forEach((tf, i) => {
        candleSets[tf] = results[i];
        ns[tf] = buildSnap(results[i], tf === "15m" ? livePriceRef.current : null);
      });
      const [book, funding] = await Promise.all([fetchBookTicker(symbol), fetchFunding(symbol)]);
      const mkt = { book, funding };
      const lowError = buildLowErrorDecision(ns, mkt);
      snapsRef.current = ns;
      candleSetsRef.current = candleSets;
      rulePredRef.current = lowError;
      marketRef.current = mkt;
      setSnaps(ns);
      setCandles(results[2]);
      setMarket(mkt);
      setRulePred(lowError);
      setPred(fuseAgentDecision(lowError, agentDecisionRef.current));
    } catch (e) {
      setErr(e.message || "Unknown error");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [symbol]);

  // ── RUN AI AGENTS (uses latest snaps from ref) ──────────────────
  const runAgents = useCallback(async () => {
    const ns = snapsRef.current;
    const lowError = rulePredRef.current;
    const s15 = ns["15m"];
    if (!s15 || !lowError || running) return;
    setRunning(true);
    setAgSt({ technical: "loading", fundamental: "idle", synthesis: "idle" });
    setAgOut({ technical: "", fundamental: "", synthesis: "" });
    const screenshotLine = screenshot ? `\nScreenshot attached: ${screenshot.name}. Use it only as visual confirmation; live Binance candles and the live gate are the source of truth.` : "";
    const baseText = `Symbol ${symbol}\nRule signal: ${lowError.direction}\nConfidence: ${lowError.confidence}%\nRisk: ${lowError.risk}\nReason: ${lowError.reason}\nScores: ${TFS.map((tf) => `${tf}=${ns[tf]?.score ?? 0}`).join(" ")}\nPrice: ${fmt(s15.price)} EMA=${s15.emaS} VWAP=${s15.vsV} ATR=${fmt(s15.atr, 3)} Spread=${fmt(lowError.spreadPct, 4)}%${screenshotLine}`;
    try {
      if (!apiKey.trim()) {
        setAgOut({
          technical: "No OpenRouter API key. Open ⚙ AI Settings below and paste your key from openrouter.ai/keys",
          fundamental: "Rule-based engine is active. All indicators above are live from Binance.",
          synthesis: lowError.reason,
        });
        setAgSt({ technical: "done", fundamental: "done", synthesis: "done" });
        agentDecisionRef.current = null;
        setPred(fuseAgentDecision(lowError, null));
        return;
      }
      const tech = await askAI(apiKey, model, "Educational scalp technical analysis only. Be cautious. Max 120 words.\n" + baseText, screenshot?.dataUrl);
      setAgOut((a) => ({ ...a, technical: tech }));
      setAgSt((a) => ({ ...a, technical: "done", fundamental: "loading" }));
      const fund = await askAI(apiKey, model, "Educational crypto macro context only. Max 100 words.\n" + baseText);
      setAgOut((a) => ({ ...a, fundamental: fund }));
      setAgSt((a) => ({ ...a, fundamental: "done", synthesis: "loading" }));
      const synth = await askAI(apiKey, model, `Return final educational signal. Follow the live rule gate. If rule signal WAIT, direction must be NEUTRAL. If screenshot disagrees with live data, trust live data. End with JSON block exactly: {"direction":"LONG","confidence":70,"risk":"MEDIUM","reasoning":"one sentence"}\n${baseText}\nTechnical:${tech}\nMacro:${fund}`, screenshot?.dataUrl);
      setAgOut((a) => ({ ...a, synthesis: synth }));
      const json = extractJsonBlock(synth);
      let parsed = json ? JSON.parse(json) : null;
      if (!parsed) parsed = ruleToFinal(lowError);
      agentDecisionRef.current = parsed;
      setPred(fuseAgentDecision(lowError, parsed));
      setAgSt({ technical: "done", fundamental: "done", synthesis: "done" });
    } catch (e) {
      const msg = String(e.message || e);
      setAgOut((a) => ({ ...a, synthesis: "AI error: " + msg + "\nRule-based signal used instead." }));
      setAgSt({ technical: "done", fundamental: "done", synthesis: "done" });
      const lowErr = rulePredRef.current;
      agentDecisionRef.current = null;
      if (lowErr) setPred(fuseAgentDecision(lowErr, null));
    } finally {
      setRunning(false);
    }
  }, [symbol, apiKey, model, running, screenshot]);

  // ── LIVE PRICE → update 15m snap in real time ───────────────────
  useEffect(() => {
    if (!liveTrade || !candleSetsRef.current["15m"]) return;
    const updatedSets = {};
    TFS.forEach((tf) => {
      updatedSets[tf] = updateLiveCandleSet(candleSetsRef.current[tf], tf, liveTrade);
    });
    const ns = {};
    TFS.forEach((tf) => {
      ns[tf] = buildSnap(updatedSets[tf], liveTrade.price);
    });
    const mkt = marketRef.current;
    const lowError = mkt ? buildLowErrorDecision(ns, mkt) : rulePredRef.current;
    candleSetsRef.current = updatedSets;
    snapsRef.current = ns;
    if (lowError) rulePredRef.current = lowError;
    setSnaps({ ...ns });
    setCandles(updatedSets["15m"] || []);
    if (lowError) {
      setRulePred(lowError);
      setPred(fuseAgentDecision(lowError, agentDecisionRef.current));
    }
  }, [liveTrade]);

  // ── INIT: load on mount and symbol change ───────────────────────
  useEffect(() => {
    agentDecisionRef.current = null;
    setAgSt({ technical: "idle", fundamental: "idle", synthesis: "idle" });
    setAgOut({ technical: "", fundamental: "", synthesis: "" });
    loadData();
  }, [symbol]);

  // ── AUTO-REFRESH candle data every 30s ─────────────────────────
  useEffect(() => {
    setNextRefresh(REFRESH_INTERVAL / 1000);
    autoRef.current = setInterval(() => {
      loadData();
      setNextRefresh(REFRESH_INTERVAL / 1000);
    }, REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => {
      setNextRefresh((n) => (n > 1 ? n - 1 : REFRESH_INTERVAL / 1000));
    }, 1000);
    return () => {
      clearInterval(autoRef.current);
      clearInterval(countdownRef.current);
    };
  }, [loadData]);

  const s15 = snaps["15m"];
  const scores = TFS.map((tf) => snaps[tf]?.score ?? 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const aligned = s15 && TFS.every((tf) => snaps[tf] && Math.sign(snaps[tf].score) === Math.sign(s15.score));
  const directionColor = (d) => d === "LONG" ? t.green : d === "SHORT" ? t.red : t.yellow;
  const btn = { background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, padding: "8px 12px", fontSize: 12, fontFamily: "monospace", cursor: "pointer" };
  const handleScreenshot = (file) => {
    if (!file) {
      setScreenshot(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot({ name: file.name, dataUrl: String(reader.result || "") });
    reader.onerror = () => setErr("Could not read screenshot.");
    reader.readAsDataURL(file);
  };

  return <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "system-ui, sans-serif", padding: "14px 12px", transition: "background .2s,color .2s" }}>
    <style>{`*{box-sizing:border-box} input,select,button{outline:none} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    <div style={{ maxWidth: 760, margin: "0 auto" }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 900, fontFamily: "monospace" }}>
            <span style={{ color: t.blue }}>SCALP</span><span style={{ color: t.faint }}>.</span><span style={{ color: t.purple }}>AI</span>
            <span style={{ color: t.faint, fontSize: 10, marginLeft: 7 }}>LIVE MTF</span>
          </div>
          <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace" }}>
            {loading ? "⟳ fetching data..." : running ? "⟳ AI analyzing..." : `live candles • REST sync in ${nextRefresh}s`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {["dark", "light", "system"].map((m) => <button key={m} onClick={() => setThemeMode(m)} style={{ ...btn, padding: "6px 8px", fontSize: 10, color: themeMode === m ? t.blue : t.muted }}>{m}</button>)}
        </div>
      </div>

      {/* TOP PANEL: LIVE PRICE + RULE SIGNAL + CONTROLS */}
      <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <Cell t={t} label="LIVE PRICE" value={`$${fmt(livePrice || s15?.price, 2)}`} color={liveStatus === "live" ? t.green : t.yellow} sub={liveStatus} tip="Live price and active candles update via Binance Futures WebSocket on every trade tick." />
          <Cell t={t} label="RULE SIGNAL" value={rulePred?.direction || "WAIT"} color={directionColor(rulePred?.direction)} sub={rulePred ? `${rulePred.confidence}% conf • ${rulePred.risk} risk` : "loading..."} tip="Deterministic gate: checks spread, ATR, volume, EMA alignment, VWAP, and funding before allowing a trade." />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", marginBottom: 3 }}>PAIR</div>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...btn, minWidth: 115 }}>
              {PAIRS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <LabeledInput t={t} label="Account USD" value={accountUsd} onChange={setAccountUsd} width={110} tip="Your total account balance in USD. Used only for position size math." />
          <LabeledInput t={t} label="Risk %" value={riskPct} onChange={setRiskPct} width={80} step="0.1" tip="Max % of account to lose if stop is hit. Example: 0.5 = risk $0.50 per $100." />
          <LabeledInput t={t} label="Leverage" value={leverage} onChange={setLeverage} width={75} step="1" tip="Leverage multiplier. Used to estimate required margin only." />
          <button
            onClick={runAgents}
            disabled={running || !s15}
            style={{ ...btn, background: running ? t.card : `linear-gradient(135deg, ${t.blue}, ${t.purple})`, color: running ? t.muted : "#fff", border: "none", fontWeight: 700, padding: "8px 16px", marginLeft: "auto" }}
          >
            {running ? "⟳ ANALYZING..." : apiKey ? "⚡ ANALYZE AI" : "⚡ ANALYZE"}
          </button>
        </div>
      </div>

      {err && <div style={{ background: t.dark ? "#1a0808" : "#fff1f2", border: `1px solid ${t.red}55`, borderRadius: 9, padding: 9, color: t.red, fontSize: 11, fontFamily: "monospace", marginBottom: 10 }}>⚠ {err}</div>}

      {/* TIMEFRAME CONFLUENCE */}
      {Object.keys(snaps).length > 0 && <div style={{ marginBottom: 12 }}>
        <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", letterSpacing: 2, marginBottom: 6 }}>TIMEFRAME CONFLUENCE • {aligned ? "✓ ALL ALIGNED" : "⚡ MIXED SIGNALS"}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TFS.map((tf) => <TFCard key={tf} t={t} tf={tf} snap={snaps[tf]} />)}
          <div style={{ flex: 2, minWidth: 120, background: t.panel, border: `1px solid ${aligned ? t.green + "55" : t.yellow + "55"}`, borderRadius: 10, padding: 10 }}>
            <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace" }}>CONFLUENCE</div>
            <div style={{ color: aligned ? t.green : t.yellow, fontWeight: 800, fontSize: 13 }}>{aligned ? "ALL ALIGNED" : "WAIT"}</div>
            <div style={{ color: t.muted, fontSize: 10 }}>Avg {avgScore > 0 ? "+" : ""}{avgScore.toFixed(1)}/10</div>
          </div>
        </div>
      </div>}

      {/* SCALPING GATE */}
      {rulePred && market && s15 && <div style={{ background: t.panel, border: `1px solid ${directionColor(rulePred.direction)}55`, borderRadius: 13, padding: 12, marginBottom: 12 }}>
        <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", letterSpacing: 2, marginBottom: 8 }}>LOW-ERROR SCALPING GATE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6, marginBottom: 8 }}>
          <Cell t={t} label="SPREAD" value={rulePred.spreadPct.toFixed(4) + "%"} color={rulePred.spreadPct <= 0.025 ? t.green : t.red} tip="Bid/ask spread as % of mid price. Must be ≤0.025% for a valid scalp — wider spread eats profit." />
          <Cell t={t} label="ATR %" value={rulePred.atrPct.toFixed(3) + "%"} color={rulePred.atrPct < 0.9 ? t.green : t.red} tip="ATR as % of price. Too high = wick risk. Too low = move won't cover fees." />
          <Cell t={t} label="FUNDING" value={(rulePred.fundingRate * 100).toFixed(4) + "%"} color={Math.abs(rulePred.fundingRate) < 0.0005 ? t.green : t.yellow} tip="Futures funding rate. High absolute funding biases the market and adds hidden cost." />
          <Cell t={t} label="BID" value={"$" + fmt(rulePred.bid)} color={t.muted} tip="Best bid on Binance Futures order book — price buyers are willing to pay." />
          <Cell t={t} label="ASK" value={"$" + fmt(rulePred.ask)} color={t.muted} tip="Best ask on Binance Futures order book — price sellers are asking." />
        </div>
        <div style={{ background: t.card, borderRadius: 9, padding: 10, color: t.muted, fontSize: 12, lineHeight: 1.6 }}>{rulePred.reason}</div>
      </div>}

      {/* MINI CHART */}
      {candles.length > 0 && s15 && <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 13, padding: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ color: t.faint, fontSize: 9, fontFamily: "monospace" }}>{symbol} 15m • live last 50 candles</span>
          <span style={{ color: t.blue, fontSize: 8, fontFamily: "monospace" }}>■ EMA7</span>
          <span style={{ color: t.yellow, fontSize: 8, fontFamily: "monospace" }}>■ EMA25</span>
          <span style={{ color: t.purple, fontSize: 8, fontFamily: "monospace" }}>-- VWAP</span>
        </div>
        <MiniChart t={t} candles={candles} e7={s15.e7a} e25={s15.e25a} vw={s15.vwapA} />
      </div>}

      {/* 15m INDICATORS */}
      {s15 && <div style={{ marginBottom: 12 }}>
        <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", letterSpacing: 2, marginBottom: 6 }}>15m INDICATORS • candles update live</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 6 }}>
          <Cell t={t} label="LIVE PRICE" value={"$" + fmt(livePrice || s15.price)} color={liveStatus === "live" ? t.green : t.text} tip="Live WebSocket price and candle close tick on every Binance trade." />
          <Cell t={t} label="EMA 7" value={"$" + fmt(s15.ema7)} color={s15.price > s15.ema7 ? t.green : t.red} tip="7-period EMA. Green = price above = short-term bullish." />
          <Cell t={t} label="EMA 25" value={"$" + fmt(s15.ema25)} color={s15.price > s15.ema25 ? t.green : t.red} tip="25-period EMA. Green = price above = medium-term bullish." />
          <Cell t={t} label="EMA 99" value={"$" + fmt(s15.ema99)} color={s15.price > s15.ema99 ? t.green : t.red} tip="99-period EMA. Green = price above = long-term trend is up." />
          <Cell t={t} label="VWAP" value={"$" + fmt(s15.vwap)} color={s15.price > s15.vwap ? t.green : t.red} sub={s15.vsV + " VWAP"} tip="Volume-weighted avg price. Price above = institutional buy bias." />
          <Cell t={t} label="STOCH K" value={fmt(s15.stK, 1)} color={s15.stK < 20 ? t.green : s15.stK > 80 ? t.red : t.muted} sub={"D: " + fmt(s15.stD, 1)} tip="Stochastic RSI K line. Below 20 = oversold. Above 80 = overbought." />
          <Cell t={t} label="ATR(14)" value={"$" + fmt(s15.atr, 3)} color={t.muted} tip="Average True Range (14 bars). Used to set stop loss and take profit distances." />
          <Cell t={t} label="VOL RATIO" value={s15.volR.toFixed(2) + "x"} color={s15.volR > 1.5 ? t.green : s15.volR < 0.7 ? t.red : t.muted} sub={s15.volS} tip="Current bar volume vs 20-bar avg. >1.5x = strong confirmation. <0.7x = weak move." />
          <Cell t={t} label="SCORE" value={(s15.score > 0 ? "+" : "") + s15.score + "/10"} color={s15.score >= 4 ? t.green : s15.score <= -4 ? t.red : t.yellow} tip="Composite signal score from EMA ribbon, VWAP, StochRSI, volume, and candle pattern." />
          <Cell t={t} label="PATTERN" value={s15.pat} color={t.muted} tip="Candlestick pattern detected on last 3 candles. Examples: Hammer, Doji, Engulfing." />
          <Cell t={t} label="SUPPORT" value={"$" + fmt(s15.loR)} color={t.blue} tip="Lowest low of last 30 candles = nearest support zone." />
          <Cell t={t} label="RESIST" value={"$" + fmt(s15.hiR)} color={t.red} tip="Highest high of last 30 candles = nearest resistance zone." />
        </div>
      </div>}

      {/* AI SETTINGS PANEL */}
      <details style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 10, marginBottom: 10 }}>
        <summary style={{ cursor: "pointer", color: t.muted, fontSize: 11, fontFamily: "monospace", userSelect: "none" }}>
          ⚙ AI Settings — OpenRouter key &amp; model
        </summary>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", marginBottom: 4 }}>OPENROUTER API KEY</div>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              type="password"
              style={{ width: "100%", background: t.card, border: `1px solid ${apiKey ? t.green + "88" : t.border}`, borderRadius: 8, color: t.text, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
            />
            <div style={{ color: t.faint, fontSize: 9, marginTop: 4 }}>
              Free key at <span style={{ color: t.blue }}>openrouter.ai/keys</span> — saved to browser automatically
            </div>
          </div>
          <div>
            <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", marginBottom: 4 }}>AI MODEL</div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ width: "100%", background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
            >
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div style={{ color: t.faint, fontSize: 9, marginTop: 4 }}>
              🆓 free &nbsp;⚡ fast &nbsp;🧠 balanced &nbsp;🔮 most powerful &nbsp;🌐 web-connected
            </div>
          </div>
          <div>
            <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", marginBottom: 4 }}>CHART SCREENSHOT FOR AGENT</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleScreenshot(e.target.files?.[0])}
              style={{ width: "100%", background: t.card, border: `1px solid ${screenshot ? t.blue + "88" : t.border}`, borderRadius: 8, color: t.text, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
            />
            {screenshot && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <span style={{ color: t.blue, fontSize: 10, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screenshot.name}</span>
              <button
                onClick={() => setScreenshot(null)}
                style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${t.border}`, borderRadius: 7, color: t.muted, padding: "4px 8px", fontSize: 10, fontFamily: "monospace", cursor: "pointer" }}
              >
                Remove
              </button>
            </div>}
            <div style={{ color: t.faint, fontSize: 9, marginTop: 4 }}>
              Sent to the technical and synthesis agents when the selected model supports vision.
            </div>
          </div>
          <button
            onClick={() => { localStorage.removeItem("scalp_or_key"); setApiKey(""); }}
            style={{ background: "transparent", border: `1px solid ${t.red}44`, borderRadius: 8, color: t.red, padding: "6px 12px", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}
          >
            🗑 Clear saved API key
          </button>
        </div>
      </details>

      {/* AI AGENT OUTPUT */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 6px" }}>
        <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", letterSpacing: 2 }}>
          AI AGENT OUTPUT
        </div>
        <div style={{ color: t.muted, fontSize: 9, fontFamily: "monospace" }}>
          {MODELS.find(m => m.id === model)?.label || model}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <AgentBox t={t} id="technical" status={agSt.technical} output={agOut.technical} />
        <AgentBox t={t} id="fundamental" status={agSt.fundamental} output={agOut.fundamental} />
        <AgentBox t={t} id="synthesis" status={agSt.synthesis} output={agOut.synthesis} />
      </div>

      <SignalBox t={t} pred={pred} snap={s15} accountUsd={accountUsd} riskPct={riskPct} leverage={leverage} />
      <div style={{ textAlign: "center", marginTop: 16, color: t.faint, fontSize: 9, fontFamily: "monospace" }}>
        EDUCATIONAL ANALYSIS ONLY • NO AUTO-TRADING • PAPER TEST FIRST
      </div>
    </div>
  </div>;
}

function LabeledInput({ t, label, value, onChange, width, step = "1", tip }) {
  return <div>
    <div style={{ color: t.faint, fontSize: 9, fontFamily: "monospace", marginBottom: 3, display: "flex", alignItems: "center" }}>{label}<InfoTip t={t} text={tip} /></div>
    <input type="number" value={value} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} style={{ width, background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }} />
  </div>;
}

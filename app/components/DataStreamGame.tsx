"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type EventType = "session_start" | "collect_item" | "game_over";
type TelemetryEvent = {
  session_id: string;
  event_id: string;
  event_type: EventType;
  timestamp: string;
  cohort: "A" | "B";
  score?: number;
  duration_sec?: number;
  death_x?: number;
  death_y?: number;
  efficiency_pct?: number;
  canvas_width?: number;
  canvas_height?: number;
};
type GameObject = { x: number; y: number; size: number; speed?: number };
type Difficulty = "Chill" | "Standard" | "Expert";
type LeaderboardEntry = { score: number; date: string; difficulty: Difficulty; duration: number };

const STORAGE_KEY = "portfolio_game_telemetry";
const SCORES_KEY = "data_stream_leaderboard";
const DIFFICULTIES: Record<Difficulty, { enemySpeed: number; spawnRate: number; label: string }> = {
  Chill: { enemySpeed: 0.8, spawnRate: 0.018, label: "Relaxed pace" },
  Standard: { enemySpeed: 1, spawnRate: 0.03, label: "Balanced challenge" },
  Expert: { enemySpeed: 1.35, spawnRate: 0.045, label: "Fast & unforgiving" },
};


function drawBug(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, glow = 10) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = glow;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.25, size * 0.22);
  ctx.lineCap = "round";
  // Six little legs make each target read as a bug, not a colored dot.
  for (const side of [-1, 1]) {
    for (const offset of [-0.48, 0, 0.48]) {
      ctx.beginPath();
      ctx.moveTo(side * size * 0.24, offset * size);
      ctx.lineTo(side * size * 0.78, offset * size * 1.45);
      ctx.stroke();
    }
  }
  // Shell and head.
  ctx.beginPath();
  ctx.ellipse(0, size * 0.12, size * 0.48, size * 0.64, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -size * 0.48, size * 0.29, 0, Math.PI * 2);
  ctx.fill();
  // Antennae and shell seam.
  ctx.beginPath();
  ctx.moveTo(-size * 0.13, -size * 0.68); ctx.lineTo(-size * 0.38, -size * 0.98);
  ctx.moveTo(size * 0.13, -size * 0.68); ctx.lineTo(size * 0.38, -size * 0.98);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(3, 7, 15, 0.7)";
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.beginPath(); ctx.moveTo(0, -size * 0.22); ctx.lineTo(0, size * 0.68); ctx.stroke();
  ctx.restore();
}

function drawHunter(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 5);
  ctx.shadowBlur = 15;
  ctx.shadowColor = "#a5f3fc";
  ctx.strokeStyle = "#a5f3fc";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, -size * 0.12, size * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(size * 0.48, size * 0.42); ctx.lineTo(size * 1.15, size * 1.1); ctx.stroke();
  ctx.fillStyle = "rgba(103, 232, 249, 0.22)";
  ctx.beginPath(); ctx.arc(0, -size * 0.12, size * 0.52, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export default function DataStreamGame() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("Standard");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lastRun, setLastRun] = useState<{ score: number; duration: number } | null>(null);
  const visitorCohort = useRef<"A" | "B">("A");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<GameObject>({ x: 233, y: 190, size: 8 });
  const itemsRef = useRef<GameObject[]>([]);
  const enemiesRef = useRef<GameObject[]>([]);
  const isPlayingRef = useRef(false);
  const soundRef = useRef(false);
  const difficultyRef = useRef<Difficulty>("Standard");
  const audioRef = useRef<AudioContext | null>(null);
  const runState = useRef({ id: "", startTime: 0, itemsSpawned: 0, itemsCollected: 0, score: 0 });

  useEffect(() => {
    visitorCohort.current = Math.random() < 0.5 ? "A" : "B";
    setIsMounted(true);
    try {
      const storedEvents = localStorage.getItem(STORAGE_KEY);
      if (storedEvents) {
        const parsed: unknown = JSON.parse(storedEvents);
        if (Array.isArray(parsed)) setEvents(parsed.slice(0, 500) as TelemetryEvent[]);
      }
      const storedScores = localStorage.getItem(SCORES_KEY);
      if (storedScores) {
        const parsed: unknown = JSON.parse(storedScores);
        if (Array.isArray(parsed)) setLeaderboard(parsed.slice(0, 5) as LeaderboardEntry[]);
      }
    } catch {
      // Storage can be disabled or contain malformed data; the game remains playable.
    }
    return () => {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      void audioRef.current?.close();
    };
  }, []);

  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  const playTone = useCallback((frequency: number, duration = 0.07) => {
    if (!soundRef.current) return;
    try {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      const audio = audioRef.current ?? new AudioContextClass();
      audioRef.current = audio;
      if (audio.state === "suspended") void audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch { /* Audio is an optional enhancement. */ }
  }, []);

  const logEvent = useCallback((type: EventType, payload: Partial<TelemetryEvent> = {}) => {
    const record: TelemetryEvent = {
      session_id: runState.current.id,
      event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      event_type: type,
      timestamp: new Date().toISOString(),
      cohort: visitorCohort.current,
      ...payload,
    };
    setEvents((previous) => {
      const updated = [record, ...previous].slice(0, 500);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* Keep in-memory session working. */ }
      return updated;
    });
  }, []);

  const spawnPacket = useCallback((cw: number, ch: number) => {
    runState.current.itemsSpawned++;
    itemsRef.current.push({ x: Math.random() * (cw - 28) + 14, y: Math.random() * (ch - 28) + 14, size: 5 });
  }, []);

  const spawnEnemy = useCallback((cw: number, ch: number) => {
    const edge = Math.floor(Math.random() * 4);
    let x = Math.random() * cw;
    let y = Math.random() * ch;
    if (edge === 0) x = 0;
    if (edge === 1) x = cw;
    if (edge === 2) y = 0;
    if (edge === 3) y = ch;
    const config = DIFFICULTIES[difficultyRef.current];
    const speed = (1.05 + Math.random() * 1.1) * config.enemySpeed * (visitorCohort.current === "B" ? 1.12 : 1);
    enemiesRef.current.push({ x, y, size: 6, speed });
  }, []);

  const clearLoop = useCallback(() => {
    if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    requestRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const gameOver = useCallback((ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    if (!isPlayingRef.current) return;
    isPlayingRef.current = false;
    setIsPlaying(false);
    clearLoop();
    const state = runState.current;
    const duration = Number(((Date.now() - state.startTime) / 1000).toFixed(1));
    const efficiency = state.itemsSpawned > 0 ? Number(((state.itemsCollected / state.itemsSpawned) * 100).toFixed(1)) : 0;
    setLastRun({ score: state.score, duration });
    logEvent("game_over", { score: state.score, duration_sec: duration, death_x: Math.round(playerRef.current.x), death_y: Math.round(playerRef.current.y), efficiency_pct: efficiency });
    setLeaderboard((previous) => {
      const next = [...previous, { score: state.score, date: new Date().toISOString(), difficulty: difficultyRef.current, duration }]
        .sort((a, b) => b.score - a.score || b.duration - a.duration).slice(0, 5);
      try { localStorage.setItem(SCORES_KEY, JSON.stringify(next)); } catch { /* Leaderboard remains available for this session. */ }
      return next;
    });
    playTone(150, 0.25);
    ctx.fillStyle = "rgba(3, 7, 15, 0.88)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fb7185";
    ctx.font = "bold 18px monospace";
    ctx.fillText("SIGNAL LOST", cw / 2, ch / 2 - 12);
    ctx.fillStyle = "#a5f3fc";
    ctx.font = "12px monospace";
    ctx.fillText(`SCORE ${state.score}  /  ${duration.toFixed(1)}s SURVIVED`, cw / 2, ch / 2 + 15);
  }, [clearLoop, logEvent, playTone]);

  const gameLoop = useCallback(function loop() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !isPlayingRef.current) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const player = playerRef.current;
    ctx.fillStyle = "rgba(3, 7, 15, 0.32)";
    ctx.fillRect(0, 0, cw, ch);
    drawHunter(ctx, player.x, player.y, player.size);

    const config = DIFFICULTIES[difficultyRef.current];
    if (Math.random() < 0.018) spawnPacket(cw, ch);
    if (Math.random() < config.spawnRate + Math.min(runState.current.score * 0.00035, 0.025)) spawnEnemy(cw, ch);

    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      drawBug(ctx, item.x, item.y, item.size + 1, "#86efac", 12);
      if (Math.hypot(player.x - item.x, player.y - item.y) < player.size + item.size) {
        itemsRef.current.splice(i, 1);
        runState.current.score += 10;
        runState.current.itemsCollected++;
        setScore(runState.current.score);
        logEvent("collect_item");
        playTone(620 + Math.min(runState.current.score * 2, 400), 0.05);
      }
    }

    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const enemy = enemiesRef.current[i];
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      enemy.x += Math.cos(angle) * (enemy.speed || 1);
      enemy.y += Math.sin(angle) * (enemy.speed || 1);
      drawBug(ctx, enemy.x, enemy.y, enemy.size + 2, "#fb7185", 14);
      if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < player.size + enemy.size) {
        gameOver(ctx, cw, ch); return;
      }
    }
    if (isPlayingRef.current) requestRef.current = requestAnimationFrame(loop);
  }, [gameOver, logEvent, playTone, spawnEnemy, spawnPacket]);

  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (isPlayingRef.current || !canvas) return;
    clearLoop();
    setLastRun(null);
    setScore(0);
    setElapsed(0);
    setHasPlayed(true);
    isPlayingRef.current = true;
    setIsPlaying(true);
    runState.current = { id: `sess-${Date.now().toString(36)}`, startTime: Date.now(), itemsSpawned: 0, itemsCollected: 0, score: 0 };
    itemsRef.current = [];
    enemiesRef.current = [];
    playerRef.current = { x: canvas.width / 2, y: canvas.height / 2, size: 8 };
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#03070f"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    logEvent("session_start", { canvas_width: canvas.width, canvas_height: canvas.height });
    for (let i = 0; i < 4; i++) spawnPacket(canvas.width, canvas.height);
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - runState.current.startTime) / 1000)), 250);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [clearLoop, gameLoop, logEvent, spawnPacket]);

  const movePlayer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlayingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    playerRef.current.x = Math.max(10, Math.min(canvas.width - 10, (clientX - rect.left) * (canvas.width / rect.width)));
    playerRef.current.y = Math.max(10, Math.min(canvas.height - 10, (clientY - rect.top) * (canvas.height / rect.height)));
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!isPlayingRef.current) return;
      const keys: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
      const vector = keys[event.key];
      if (!vector) return;
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      playerRef.current.x = Math.max(10, Math.min(canvas.width - 10, playerRef.current.x + vector[0] * 12));
      playerRef.current.y = Math.max(10, Math.min(canvas.height - 10, playerRef.current.y + vector[1] * 12));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const canvas = heatmapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#03070f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const event of events) {
      if (event.event_type !== "game_over" || event.death_x === undefined || event.death_y === undefined) continue;
      const x = event.death_x * canvas.width / 466;
      const y = event.death_y * canvas.height / 380;
      const gradient = ctx.createRadialGradient(x, y, 1, x, y, 18);
      gradient.addColorStop(0, "rgba(251, 113, 133, 0.75)"); gradient.addColorStop(1, "rgba(251, 113, 133, 0)");
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
    }
  }, [events]);

  const clearData = useCallback(() => {
    if (!window.confirm("Clear saved session telemetry and leaderboard scores?")) return;
    setEvents([]); setLeaderboard([]);
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SCORES_KEY); } catch { /* In-memory state is still cleared. */ }
  }, []);

  const gameOvers = events.filter((event) => event.event_type === "game_over");
  const avgDuration = gameOvers.length ? gameOvers.reduce((sum, event) => sum + (event.duration_sec || 0), 0) / gameOvers.length : 0;
  const highScore = Math.max(0, ...gameOvers.map((event) => event.score || 0), ...leaderboard.map((entry) => entry.score));
  const avgEfficiency = gameOvers.length ? gameOvers.reduce((sum, event) => sum + (event.efficiency_pct || 0), 0) / gameOvers.length : 0;
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200"><span className="status-dot" /> Interactive arcade / 001</div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Bug Hunt <span className="text-cyan-300">Protocol</span></h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Hunt down rogue bugs, dodge infected crawlers, and keep your codebase clean.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">WASD / arrows</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">Mouse / touch</span>
          <button onClick={() => setSoundEnabled((enabled) => !enabled)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10" aria-pressed={soundEnabled}>{soundEnabled ? "♫ Sound on" : "♪ Sound off"}</button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
        <section className="panel min-w-0 p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow">Live session</p><h2 className="mt-1 text-lg font-semibold text-white">The arena</h2></div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${isPlaying ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}><span className={isPlaying ? "status-dot" : "status-dot status-dot-muted"} />{isPlaying ? "Signal active" : "Standby"}</span>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="metric-card"><span className="eyebrow">Current score</span><strong className="mt-1 block text-2xl font-semibold tabular-nums text-cyan-200">{String(score).padStart(4, "0")}</strong></div>
            <div className="metric-card"><span className="eyebrow">Survival time</span><strong className="mt-1 block text-2xl font-semibold tabular-nums text-white">{formatTime(elapsed)}</strong></div>
            <div className="metric-card"><span className="eyebrow">Best score</span><strong className="mt-1 block text-2xl font-semibold tabular-nums text-emerald-300">{highScore}</strong></div>
          </div>

          <div className="arena-wrap">
            <canvas ref={canvasRef} width={700} height={440} onPointerMove={(event) => movePlayer(event.clientX, event.clientY)} onPointerDown={(event) => movePlayer(event.clientX, event.clientY)} className="arena-canvas" aria-label="Bug-hunting arena. Move the magnifying-glass hunter with your pointer, touch, WASD, or arrow keys. Catch green bugs and avoid red infected bugs." />
            {!isPlaying && <div className="arena-overlay"><div className="arena-overlay-card"><div className="mb-3 text-3xl">{lastRun ? "◈" : "✳"}</div><h3 className="text-xl font-semibold text-white">{lastRun ? "Run terminated" : hasPlayed ? "Ready for another run?" : "Enter the stream"}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-400">{lastRun ? `You collected ${lastRun.score} points and survived for ${lastRun.duration.toFixed(1)} seconds.` : "Take control of the magnifying-glass hunter. Catch green bugs for points and dodge the red infected bugs."}</p><button onClick={startGame} className="primary-button mt-5">{lastRun || hasPlayed ? "↻  Play again" : "▶  Start game"}</button></div></div>}
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-slate-950/70 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">SYS / ARENA_01</div>
            <div className="pointer-events-none absolute bottom-3 right-3 text-[9px] uppercase tracking-widest text-slate-500">700 × 440</div>
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><label htmlFor="difficulty" className="eyebrow block">Difficulty protocol</label><select id="difficulty" value={difficulty} disabled={isPlaying} onChange={(event) => setDifficulty(event.target.value as Difficulty)} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-cyan-300/60 disabled:opacity-50 sm:w-52">{(Object.keys(DIFFICULTIES) as Difficulty[]).map((level) => <option key={level} value={level}>{level} — {DIFFICULTIES[level].label}</option>)}</select></div>
            <p className="max-w-sm text-xs leading-5 text-slate-500">Green bugs are collectible (+10). Red infected bugs chase you. Move the magnifying-glass hunter with pointer, touch, or keyboard.</p>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="panel p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Performance overview</p><h2 className="mt-1 text-lg font-semibold text-white">Session analytics</h2></div><span className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.06] px-2 py-1 text-[10px] text-cyan-200">LOCAL</span></div>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "Completed runs", value: gameOvers.length, tone: "text-white" }, { label: "Avg. survival", value: `${avgDuration.toFixed(1)}s`, tone: "text-cyan-200" }, { label: "Bugs scored", value: highScore, tone: "text-emerald-300" }, { label: "Bug catch rate", value: `${avgEfficiency.toFixed(1)}%`, tone: "text-violet-300" }].map((metric) => <div key={metric.label} className="metric-card"><span className="eyebrow">{metric.label}</span><strong className={`mt-2 block text-2xl font-semibold tabular-nums ${metric.tone}`}>{metric.value}</strong></div>)}
            </div>
            <div className="mt-5"><div className="mb-2 flex items-center justify-between"><span className="eyebrow">Failure distribution</span><span className="text-[10px] text-slate-500">Impact coordinates</span></div><canvas ref={heatmapRef} width={386} height={112} className="h-28 w-full rounded-lg border border-white/[0.07] bg-[#03070f]" /></div>
          </section>

          <section className="panel p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">Personal records</p><h2 className="mt-1 text-lg font-semibold text-white">Top runs</h2></div><span className="text-xs text-slate-500">Top 5</span></div>
            {leaderboard.length ? <ol className="flex flex-col gap-2">{leaderboard.map((entry, index) => <li key={`${entry.date}-${index}`} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${index === 0 ? "bg-amber-300/10 text-amber-200" : "bg-white/[0.05] text-slate-400"}`}>{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-200">{entry.difficulty} run</p><p className="text-[10px] text-slate-500">{new Date(entry.date).toLocaleDateString()} · {entry.duration.toFixed(1)}s</p></div><strong className="text-lg tabular-nums text-cyan-200">{entry.score}</strong></li>)}</ol> : <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center"><p className="text-sm text-slate-300">No records yet</p><p className="mt-1 text-xs text-slate-500">Finish a run to start your leaderboard.</p></div>}
            <p className="mt-3 text-[10px] leading-5 text-slate-500">Scores are saved in this browser only. They are not shared across devices.</p>
          </section>

          <section className="panel p-5 sm:p-6"><div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">Event pipeline</p><h2 className="mt-1 text-lg font-semibold text-white">Telemetry stream</h2></div><span className="text-xs tabular-nums text-slate-400">{events.length} events</span></div><div className="mb-3 flex items-center gap-2 text-[10px] text-slate-500"><span className="status-dot" /> Session cohort {isMounted ? visitorCohort.current : "…"} <span className="ml-auto">Newest first</span></div>
            <div className="terminal-log" aria-label="Recent telemetry events">{events.length ? events.slice(0, 12).map((event) => <div key={event.event_id} className="flex gap-2 border-b border-white/[0.04] py-2 last:border-0"><span className="shrink-0 text-slate-600">{event.timestamp.includes("T") ? event.timestamp.split("T")[1].slice(0, 8) : "--:--:--"}</span><span className={event.event_type === "game_over" ? "text-rose-300" : event.event_type === "collect_item" ? "text-emerald-300" : "text-cyan-200"}>{event.event_type}</span>{event.score !== undefined && <span className="ml-auto text-slate-400">score:{event.score}</span>}</div>) : <p className="py-5 text-center text-xs text-slate-500">Waiting for incoming events…</p>}</div>
            <button onClick={clearData} className="mt-4 w-full rounded-lg border border-rose-400/20 px-3 py-2.5 text-xs font-medium text-rose-300 transition hover:border-rose-300/50 hover:bg-rose-400/[0.06]">Clear local records</button>
          </section>
        </aside>
      </div>
      <footer className="flex flex-col gap-2 border-t border-white/[0.08] pt-5 text-[10px] uppercase tracking-[0.15em] text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>Bug Hunt Protocol <span className="text-slate-500">·</span> Track down every bug</span><span>Client-side telemetry · No account required</span></footer>
    </main>
  );
}

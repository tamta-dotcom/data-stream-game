"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

// --- Types ---
type TelemetryEvent = {
  session_id: string;
  event_id: string;
  event_type: "session_start" | "collect_item" | "game_over";
  timestamp: string;
  cohort: "A" | "B"; // A/B testing cohort
  score?: number;
  duration_sec?: number;
  death_x?: number;
  death_y?: number;
  efficiency_pct?: number;
  canvas_width?: number;
  canvas_height?: number;
};

type GameObject = { x: number; y: number; size: number; speed?: number };

export default function DataStreamGame() {
  // UI State
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);

  // Default to "A" for stable server rendering
  const visitorCohort = useRef<"A" | "B">("A");
  
  // Track when the client has safely mounted
  const [isMounted, setIsMounted] = useState(false);

  // Canvas & Mutable Game State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const playerRef = useRef<GameObject>({ x: 233, y: 190, size: 8 });
  const itemsRef = useRef<GameObject[]>([]);
  const enemiesRef = useRef<GameObject[]>([]);
  
  // We use a ref for isPlaying to avoid stale closures in the game loop
  const isPlayingRef = useRef(false);
  
  const runState = useRef({
    id: "",
    startTime: 0,
    itemsSpawned: 0,
    itemsCollected: 0,
    score: 0,
  });

  // --- Initialization & LocalStorage ---
  useEffect(() => {
    // 1. Assign the random cohort ONLY on the client
    visitorCohort.current = Math.random() < 0.5 ? "A" : "B";
    setIsMounted(true);

    // 2. Load the local storage data
    const timeoutId = setTimeout(() => {
      try {
        const stored = localStorage.getItem("portfolio_game_telemetry");
        if (stored) {
          setEvents(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("LocalStorage access failed");
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  // Update Heatmap
  useEffect(() => {
    const canvas = heatmapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gameOvers = events.filter((e) => e.event_type === "game_over");
    const scaleX = canvas.width / 466;
    const scaleY = canvas.height / 380;

    gameOvers.forEach((pt) => {
      if (pt.death_x !== undefined && pt.death_y !== undefined) {
        const x = pt.death_x * scaleX;
        const y = pt.death_y * scaleY;
        const grad = ctx.createRadialGradient(x, y, 1, x, y, 16);
        grad.addColorStop(0, "rgba(255, 0, 60, 0.9)");
        grad.addColorStop(1, "rgba(255, 0, 60, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [events]);

  // --- Telemetry Engine (Wrapped in useCallback) ---
  const logEvent = useCallback((type: TelemetryEvent["event_type"], payload: Partial<TelemetryEvent> = {}) => {
    const record: TelemetryEvent = {
      session_id: runState.current.id,
      event_id: "evt-" + Math.random().toString(36).substring(2, 9),
      event_type: type,
      timestamp: new Date().toISOString(),
      cohort: visitorCohort.current, // Automatically tag all events with the cohort
      ...payload,
    };

    setEvents((prev) => {
      const updated = [record, ...prev];
      localStorage.setItem("portfolio_game_telemetry", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearData = useCallback(() => {
    if (confirm("Execute purge of local telemetry buffer?")) {
      setEvents([]);
      localStorage.removeItem("portfolio_game_telemetry");
    }
  }, []);

  // --- Game Engine (Wrapped in useCallback) ---
  const spawnPacket = useCallback((cw: number, ch: number) => {
    runState.current.itemsSpawned++;
    itemsRef.current.push({
      x: Math.random() * (cw - 20) + 10,
      y: Math.random() * (ch - 20) + 10,
      size: 5,
    });
  }, []);

  const spawnEnemy = useCallback((cw: number, ch: number) => {
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (edge === 0) y = Math.random() * ch;
    else if (edge === 1) { x = cw; y = Math.random() * ch; }
    else if (edge === 2) x = Math.random() * cw;
    else { x = Math.random() * cw; y = ch; }

    let speed = 1.4 + Math.random() * 1.5;
    
    // A/B Test Mechanic: Cohort B enemies move 30% faster
    if (visitorCohort.current === "B") {
      speed = speed * 1.3; 
    }

    enemiesRef.current.push({ x, y, size: 6, speed });
  }, []);

  const gameOver = useCallback((ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    const state = runState.current;
    const durationSec = parseFloat(((Date.now() - state.startTime) / 1000).toFixed(2));
    const efficiency = state.itemsSpawned > 0 ? parseFloat(((state.itemsCollected / state.itemsSpawned) * 100).toFixed(1)) : 0;

    logEvent("game_over", {
      score: state.score,
      duration_sec: durationSec,
      death_x: Math.round(playerRef.current.x),
      death_y: Math.round(playerRef.current.y),
      efficiency_pct: efficiency,
    });

    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#ff003c";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillText("CRITICAL FAILURE // STREAM SEVERED", cw / 2, ch / 2 - 10);
    ctx.fillStyle = "#00f0ff";
    ctx.font = "12px monospace";
    ctx.fillText(`PACKETS: ${state.score} | UPTIME: ${durationSec}s`, cw / 2, ch / 2 + 15);
  }, [logEvent]);

  const gameLoop = useCallback(function loop() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !runState.current.startTime) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const p = playerRef.current;

    ctx.fillStyle = "rgba(5, 5, 8, 0.3)";
    ctx.fillRect(0, 0, cw, ch);

    // Draw Player (Neon Cyan)
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00f0ff";
    ctx.fillStyle = "#00f0ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Spawning logic
    if (Math.random() < 0.02) spawnPacket(cw, ch);
    if (Math.random() < 0.03 + runState.current.score * 0.001) spawnEnemy(cw, ch);

    // Update Items (Neon Green)
    ctx.shadowColor = "#39ff14";
    ctx.fillStyle = "#39ff14";
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const it = itemsRef.current[i];
      ctx.fillRect(it.x - it.size / 2, it.y - it.size / 2, it.size * 2, it.size * 2);

      const dist = Math.hypot(p.x - it.x, p.y - it.y);
      if (dist < p.size + it.size) {
        itemsRef.current.splice(i, 1);
        runState.current.score += 10;
        runState.current.itemsCollected++;
        
        setScore(runState.current.score);
        logEvent("collect_item");
      }
    }

    // Update Enemies (Neon Pink/Red)
    ctx.shadowColor = "#ff003c";
    ctx.fillStyle = "#ff003c";
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const en = enemiesRef.current[i];
      const angle = Math.atan2(p.y - en.y, p.x - en.x);
      en.x += Math.cos(angle) * (en.speed || 1);
      en.y += Math.sin(angle) * (en.speed || 1);

      ctx.beginPath();
      ctx.arc(en.x, en.y, en.size, 0, Math.PI * 2);
      ctx.fill();

      if (Math.hypot(p.x - en.x, p.y - en.y) < p.size + en.size) {
        ctx.shadowBlur = 0;
        gameOver(ctx, cw, ch);
        return;
      }
    }

    ctx.shadowBlur = 0;
    if (isPlayingRef.current) requestRef.current = requestAnimationFrame(loop);
  }, [spawnPacket, spawnEnemy, gameOver, logEvent]);

  const startGame = useCallback(() => {
    if (isPlayingRef.current || !canvasRef.current) return;

    setIsPlaying(true);
    isPlayingRef.current = true;
    setScore(0);
    
    runState.current = {
      id: "sess-" + Math.random().toString(36).substring(2, 9),
      startTime: Date.now(),
      itemsSpawned: 0,
      itemsCollected: 0,
      score: 0,
    };

    itemsRef.current = [];
    enemiesRef.current = [];
    playerRef.current = { x: canvasRef.current.width / 2, y: canvasRef.current.height / 2, size: 8 };

    logEvent("session_start", {
      canvas_width: canvasRef.current.width,
      canvas_height: canvasRef.current.height,
    });

    for (let i = 0; i < 3; i++) spawnPacket(canvasRef.current.width, canvasRef.current.height);
    
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, logEvent, spawnPacket]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    playerRef.current.x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    playerRef.current.y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
  }, []);

  // --- KPI Calculations ---
  const gameOvers = events.filter((e) => e.event_type === "game_over");
  const totalRuns = gameOvers.length;
  const avgDuration = totalRuns ? gameOvers.reduce((acc, e) => acc + (e.duration_sec || 0), 0) / totalRuns : 0;
  const highScore = totalRuns ? Math.max(...gameOvers.map((e) => e.score || 0)) : 0;
  const avgEff = totalRuns ? gameOvers.reduce((acc, e) => acc + (e.efficiency_pct || 0), 0) / totalRuns : 0;

  return (
    <div className="min-h- bg-transparent text-slate-300 font-mono p-2 flex flex-col items-center gap-8 relative overflow-hidden">
      {/* High-Tech Grid Background */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] background-size:[24px_24px] opacity-30 pointer-events-none" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(0,240,255,0.05),transparent)] pointer-events-none" />

      <header className="text-center max-w-3xl z-10 mt-4 border-b border-cyan-900/50 pb-4">
        <h1 className="text-cyan-400 text-3xl font-bold tracking-wider uppercase">
          Sys_Telemetry_Engine
        </h1>
        <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest">
          ---Client-Side Event Ingestion & Real-Time Analytics---
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[500px_420px] gap-8 w-full max-w-5xl z-10">
        
        {/* === LEFT PANEL: GAMEPLAY === */}
        <div className="bg-black/40 backdrop-blur-md border border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.05)] rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/50 rounded-tl-xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/50 rounded-br-xl" />

          <div className="flex justify-between items-end font-semibold">
            <span className="text-slate-400 text-xs tracking-widest uppercase">Target Vector</span>
            <span className="text-cyan-400 text-xl tracking-wider">
              {String(score).padStart(4, '0')}
            </span>
          </div>
          
          <div className="relative p-1 bg-gradient-to-b from-cyan-900/20 to-transparent rounded-lg">
            <canvas
              ref={canvasRef}
              width={466}
              height={380}
              onMouseMove={handleMouseMove}
              className="w-full h-[380px] bg-[#050505] border border-cyan-900/50 rounded cursor-crosshair block shadow-inner"
            />
          </div>
          
          <div className="flex justify-between items-center text-xs text-slate-500 mt-1">
            <span className="animate-pulse">[ INPUT: MOUSE_TRACKING ]</span>
            <button
              onClick={startGame}
              disabled={isPlaying}
              className="bg-cyan-950/50 border border-cyan-500/50 hover:bg-cyan-900 hover:text-white text-cyan-400 px-6 py-2 rounded-md font-bold tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(0,240,255,0.1)]"
            >
              {isPlaying ? "EXECUTING..." : "INITIATE RUN"}
            </button>
          </div>
        </div>

        {/* === RIGHT PANEL: DASHBOARD === */}
        <div className="bg-black/40 backdrop-blur-md border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-xs tracking-widest uppercase">Live Metrics</span>
              <span className={`text-[9px] px-2 py-0.5 rounded border ${
                !isMounted ? "bg-gray-900/50 border-gray-700 text-gray-500" :
                visitorCohort.current === "A" ? "bg-cyan-900/30 border-cyan-700 text-cyan-400" : "bg-fuchsia-900/30 border-fuchsia-700 text-fuchsia-400"
              }`}>
                COHORT: {isMounted ? visitorCohort.current : "..."}
              </span>
            </div>
            <span className="text-emerald-500 text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {events.length} LOGS
            </span>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Sessions", val: totalRuns, color: "text-white" },
              { label: "Avg Uptime", val: `${avgDuration.toFixed(1)}s`, color: "text-emerald-400" },
              { label: "Peak Score", val: highScore, color: "text-cyan-400" },
              { label: "Efficiency", val: `${avgEff.toFixed(1)}%`, color: "text-fuchsia-400" },
            ].map((kpi, i) => (
              <div key={i} className="bg-[#0a0a0f] border-l-2 border-slate-700 hover:border-cyan-500 transition-colors rounded-r p-3">
                <span className="block text-[9px] text-slate-500 uppercase tracking-wider">{kpi.label}</span>
                <strong className={`block text-xl font-normal mt-1 ${kpi.color}`}>{kpi.val}</strong>
              </div>
            ))}
          </div>

          {/* Heatmap */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-widest mb-2">
              <span>Failure Distribution</span>
              <span>(X, Y) Mapping</span>
            </div>
            <canvas 
              ref={heatmapRef} 
              width={386} 
              height={120} 
              className="w-full h-[120px] bg-[#050505] border border-slate-800 rounded opacity-90" 
            />
          </div>

          {/* Terminal Log */}
          <div className="flex flex-col flex-grow">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Raw Data Stream</div>
            <div className="bg-[#030303] border border-slate-800 rounded p-3 h-[130px] overflow-y-auto text-[9px] flex flex-col gap-1 shadow-inner relative">
              <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-[#030303] to-transparent pointer-events-none" />
              {events.slice(0, 30).map((e) => (
                <div key={e.event_id} className={`break-all ${e.event_type === "game_over" ? "text-rose-500" : "text-slate-400"}`}>
                  <span className="text-slate-600">[{e.timestamp.split("T")[1].substring(0, 8)}]</span> <span className={e.event_type === 'collect_item' ? 'text-emerald-500' : ''}>{e.event_type}</span>: {JSON.stringify(e)}
                </div>
              ))}
            </div>
          </div>

          <button onClick={clearData} className="w-full text-xs tracking-widest uppercase bg-transparent border border-rose-900/50 hover:bg-rose-900/20 text-rose-500 py-2.5 rounded transition-all">
            Purge Buffer
          </button>
        </div>
      </div>
    </div>
  );
}
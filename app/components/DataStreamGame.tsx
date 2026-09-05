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

    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gameOvers = events.filter((e) => e.event_type === "game_over");
    const scaleX = canvas.width / 466;
    const scaleY = canvas.height / 380;

    gameOvers.forEach((pt) => {
      if (pt.death_x !== undefined && pt.death_y !== undefined) {
        const x = pt.death_x * scaleX;
        const y = pt.death_y * scaleY;
        const grad = ctx.createRadialGradient(x, y, 1, x, y, 14);
        grad.addColorStop(0, "rgba(248, 81, 73, 0.9)");
        grad.addColorStop(1, "rgba(248, 81, 73, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
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
    if (confirm("Erase all local telemetry metrics?")) {
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

    let speed = 1.2 + Math.random() * 1.5;
    
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

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#f85149";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText("TERMINATED // DATA STREAM INTERRUPTED", cw / 2, ch / 2 - 10);
    ctx.fillStyle = "#c9d1d9";
    ctx.font = "12px monospace";
    ctx.fillText(`Telemetry logged: ${state.score} pts in ${durationSec}s`, cw / 2, ch / 2 + 15);
  }, [logEvent]);

  const gameLoop = useCallback(function loop() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !runState.current.startTime) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const p = playerRef.current;

    ctx.fillStyle = "rgba(5, 7, 10, 0.2)";
    ctx.fillRect(0, 0, cw, ch);

    // Draw Player
    ctx.fillStyle = "#58a6ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Spawning logic
    if (Math.random() < 0.02) spawnPacket(cw, ch);
    if (Math.random() < 0.03 + runState.current.score * 0.001) spawnEnemy(cw, ch);

    // Update Items
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const it = itemsRef.current[i];
      ctx.fillStyle = "#2ea043";
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

    // Update Enemies
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const en = enemiesRef.current[i];
      const angle = Math.atan2(p.y - en.y, p.x - en.x);
      en.x += Math.cos(angle) * (en.speed || 1);
      en.y += Math.sin(angle) * (en.speed || 1);

      ctx.fillStyle = "#f85149";
      ctx.beginPath();
      ctx.arc(en.x, en.y, en.size, 0, Math.PI * 2);
      ctx.fill();

      if (Math.hypot(p.x - en.x, p.y - en.y) < p.size + en.size) {
        gameOver(ctx, cw, ch);
        return;
      }
    }

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
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] font-sans p-6 flex flex-col items-center gap-6">
      <header className="text-center max-w-3xl">
        <h1 className="text-white text-2xl font-bold mb-2">DATA STREAM // Telemetry Pipeline</h1>
        <p className="text-[#8b949e] text-sm">An interactive arcade mini-game collecting client-side events.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[500px_420px] gap-6 w-full max-w-5xl">
        {/* Game Panel */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center font-semibold text-white">
            <span>Play Session</span>
            <span className="font-mono text-[#58a6ff]">SCORE: {score}</span>
          </div>
          
          <canvas
            ref={canvasRef}
            width={466}
            height={380}
            onMouseMove={handleMouseMove}
            className="w-full h-[380px] bg-[#05070a] border border-[#30363d] rounded cursor-crosshair block"
          />
          
          <div className="flex justify-between items-center text-sm font-mono mt-2">
            <span>Move: Mouse / Touch</span>
            <button
              onClick={startGame}
              disabled={isPlaying}
              className="bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-md font-semibold transition disabled:opacity-50"
            >
              {isPlaying ? "Running..." : "Start Run"}
            </button>
          </div>
        </div>

        {/* Dashboard Panel */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center font-semibold text-white">
            <div className="flex items-center gap-2">
              <span>Live Telemetry Engine</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                !isMounted ? "bg-gray-900/50 text-gray-500" :
                visitorCohort.current === "A" ? "bg-blue-900/50 text-blue-400" : "bg-purple-900/50 text-purple-400"
              }`}>
                TEST_GROUP: {isMounted ? visitorCohort.current : "..."}
              </span>
            </div>
            <span className="text-[#8b949e] text-xs">Buffer: {events.length} events</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Runs Logged", val: totalRuns },
              { label: "Avg Run Duration", val: `${avgDuration.toFixed(1)}s` },
              { label: "High Score", val: highScore },
              { label: "Collection Efficiency", val: `${avgEff.toFixed(1)}%` },
            ].map((kpi, i) => (
              <div key={i} className="bg-[#0d1117] border border-[#30363d] rounded p-2">
                <span className="block text-[10px] text-[#8b949e] uppercase">{kpi.label}</span>
                <strong className="block text-lg text-[#58a6ff] mt-1">{kpi.val}</strong>
              </div>
            ))}
          </div>

          <div>
            <div className="text-xs text-[#8b949e] mb-1">Player Termination Heatmap (X, Y)</div>
            <canvas ref={heatmapRef} width={386} height={160} className="w-full bg-[#05070a] border border-[#30363d] rounded" />
          </div>

          <div className="flex flex-col flex-grow">
            <div className="text-xs text-[#8b949e] mb-1">Raw Event Ingestion Log</div>
            <div className="bg-[#05070a] border border-[#30363d] rounded p-2 h-[120px] overflow-y-auto font-mono text-[10px] text-[#7ee787] flex flex-col gap-1">
              {events.slice(0, 20).map((e) => (
                <div key={e.event_id} className={e.event_type === "game_over" ? "text-[#f85149]" : ""}>
                  [{e.timestamp.split("T")[1].substring(0, 8)}] [{e.event_type}] {JSON.stringify(e)}
                </div>
              ))}
            </div>
          </div>

          <button onClick={clearData} className="w-full bg-transparent border border-[#30363d] hover:bg-[#30363d] text-[#f85149] px-4 py-2 rounded-md font-semibold text-sm transition mt-2">
            Clear Local Data
          </button>
        </div>
      </div>
    </div>
  );
}
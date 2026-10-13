"use client";

import React, { useState } from "react";
import DataStreamGame from "./components/DataStreamGame";

export default function Home() {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMousePos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <main onMouseMove={handleMouseMove} className="site-shell relative min-h-screen overflow-hidden text-slate-200">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-glow" aria-hidden="true" />
      <div className="pointer-glow" aria-hidden="true" style={{ background: `radial-gradient(420px circle at ${mousePos.x}px ${mousePos.y}px, rgba(34,211,238,0.075), transparent 72%)` }} />
      <div className="scanner-line" aria-hidden="true" />
      <DataStreamGame />
    </main>
  );
}

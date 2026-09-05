"use client";

import React, { useState } from "react";
import DataStreamGame from "./components/DataStreamGame";

export default function Home() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <main 
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-[#050505] text-slate-300 font-mono flex flex-col items-center justify-center py-12 relative overflow-hidden"
    >
      {/* Animated Moving Dot-Matrix Grid Background */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(#334155_1.5px,transparent_1.5px)] [background-size:28px_28px] opacity-30 animate-grid-move pointer-events-none" />
      
      {/* Dynamic Mouse-Following Glow Effect on Hover */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(0, 240, 255, 0.15), transparent 80%)`,
        }}
      />

      {/* Subtle Cyan Ambient Glow Overlay */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,240,255,0.06),transparent)] pointer-events-none" />

      {/* CSS Keyframes for Infinite Smooth Grid Motion */}
      <style jsx>{`
        @keyframes gridMove {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 28px 28px;
          }
        }
        .animate-grid-move {
          animation: gridMove 20s linear infinite;
        }
      `}</style>

      {/* Render the Game Component */}
      <div className="z-10 w-full flex justify-center">
        <DataStreamGame />
      </div>
    </main>
  );
}
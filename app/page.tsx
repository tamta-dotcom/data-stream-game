"use client";

import React, { useState } from "react";
import DataStreamGame from "./components/DataStreamGame";

export default function Home() {
  const [mousePos, setMousePos] = useState({
    x: 0,
    y: 0,
  });

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
      className="
        min-h-screen
        bg-[#050505]
        text-slate-300
        font-mono
        flex
        flex-col
        items-center
        justify-center
        py-12
        relative
        overflow-hidden
      "
    >
      {/* =====================================================
          NORMAL DOT GRID
      ====================================================== */}

      <div
        className="
          absolute
          inset-0
          z-0
          pointer-events-none
        "
        style={{
          backgroundImage: `
            radial-gradient(
              circle,
              rgba(51,65,85,0.85) 1.5px,
              transparent 1.5px
            )
          `,
          backgroundSize: "28px 28px",
        }}
      />

      {/* =====================================================
          SCANNED DOT GRID
          
          This is the animated layer.
      ====================================================== */}

      <div
        className="
          absolute
          inset-0
          z-[1]
          pointer-events-none
          scan-dots
        "
      />

      {/* =====================================================
          SCANNED DOT GLOW
      ====================================================== */}

      <div
        className="
          absolute
          inset-0
          z-[1]
          pointer-events-none
          scan-dot-glow
        "
      />

      {/* =====================================================
          SOFT BLUR AFTER SCANNER
      ====================================================== */}

      <div
        className="
          absolute
          top-0
          bottom-0
          z-[1]
          pointer-events-none
          scan-blur
        "
      />

      {/* =====================================================
          SHARP SCANNER LINE
      ====================================================== */}

      <div
        className="
          absolute
          top-0
          bottom-0
          w-[2px]
          z-[4]
          pointer-events-none
          scanner-line
        "
      />

      {/* =====================================================
          WHITE HOT SCANNER CORE
      ====================================================== */}

      <div
        className="
          absolute
          top-[8%]
          bottom-[8%]
          w-[3px]
          z-[5]
          pointer-events-none
          scanner-core
        "
      />

      {/* =====================================================
          SCANNER HALO
      ====================================================== */}

      <div
        className="
          absolute
          top-0
          bottom-0
          w-[30px]
          z-[2]
          pointer-events-none
          scanner-halo
        "
      />

      {/* =====================================================
          MOUSE GLOW
      ====================================================== */}

      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(
              350px circle at ${mousePos.x}px ${mousePos.y}px,
              rgba(0,240,255,0.08),
              transparent 75%
            )
          `,
        }}
      />

      {/* =====================================================
          AMBIENT TOP GLOW
      ====================================================== */}

      <div
        className="
          absolute
          inset-0
          z-0
          pointer-events-none
        "
        style={{
          background: `
            radial-gradient(
              ellipse 65% 45% at 50% 0%,
              rgba(0,240,255,0.06),
              transparent 70%
            )
          `,
        }}
      />

      {/* =====================================================
          VIGNETTE
      ====================================================== */}

      <div
        className="
          absolute
          inset-0
          z-0
          pointer-events-none
        "
        style={{
          background: `
            radial-gradient(
              ellipse at center,
              transparent 35%,
              rgba(0,0,0,0.5) 100%
            )
          `,
        }}
      />

      {/* =====================================================
          GAME
      ====================================================== */}

      <div className="relative z-10 w-full flex justify-center">
        <DataStreamGame />
      </div>

      {/* =====================================================
          ANIMATIONS
      ====================================================== */}

      <style>{`

        /* ===================================================
           SCANNER
        =================================================== */

        @keyframes scannerMove {
          0% {
            transform: translateX(0);
          }

          100% {
            transform: translateX(100vw);
          }
        }

        .scanner-line {
          left: -2px;

          animation:
            scannerMove
            7s
            linear
            infinite;

          background: linear-gradient(
            to bottom,
            transparent,
            rgba(0,240,255,0.85) 15%,
            #00f0ff 50%,
            rgba(0,240,255,0.85) 85%,
            transparent
          );

          box-shadow:
            0 0 4px #00f0ff,
            0 0 12px rgba(0,240,255,0.9),
            0 0 30px rgba(0,240,255,0.55);
        }


        /* ===================================================
           WHITE CORE
        =================================================== */

        .scanner-core {
          left: -1px;

          animation:
            scannerMove
            7s
            linear
            infinite;

          background: linear-gradient(
            to bottom,
            transparent,
            rgba(255,255,255,0.9) 25%,
            white 50%,
            rgba(255,255,255,0.9) 75%,
            transparent
          );

          filter: blur(0.8px);

          box-shadow:
            0 0 7px white,
            0 0 18px #00f0ff;
        }


        /* ===================================================
           HALO
        =================================================== */

        .scanner-halo {
          left: -15px;

          animation:
            scannerMove
            7s
            linear
            infinite;

          background: linear-gradient(
            to right,
            transparent,
            rgba(0,240,255,0.08),
            rgba(0,240,255,0.22),
            rgba(0,240,255,0.08),
            transparent
          );

          filter: blur(7px);
        }


        /* ===================================================
           ANIMATED SCANNED DOTS
           
           The important part.
        =================================================== */

        .scan-dots {
  left: -50px;
  width: calc(100vw + 100px);

  background-image:
    radial-gradient(
      circle,
      rgba(0, 240, 255, 0.95) 1.5px,
      transparent 2px
    );

  background-size: 28px 28px;

  /*
    MUCH tighter to the scanner.

    The bright dots now sit almost directly
    on the scanner's right edge.
  */
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    transparent 48.5%,
    rgba(0,0,0,0.4) 49%,
    black 49.5%,
    black 51.5%,
    rgba(0,0,0,0.5) 52.5%,
    transparent 54%
  );

  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    transparent 48.5%,
    rgba(0,0,0,0.4) 49%,
    black 49.5%,
    black 51.5%,
    rgba(0,0,0,0.5) 52.5%,
    transparent 54%
  );

  animation:
    scannerMove 7s linear infinite,
    dotFlash 900ms ease-in-out infinite;

  filter:
    drop-shadow(0 0 3px rgba(0,240,255,0.95))
    drop-shadow(0 0 7px rgba(0,240,255,0.55));
}


.scan-dot-glow {
  left: -50px;
  width: calc(100vw + 100px);

  background-image:
    radial-gradient(
      circle,
      rgba(0,240,255,0.55) 2px,
      transparent 7px
    );

  background-size: 28px 28px;

  /*
    Glow is also much closer.
  */
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    transparent 48%,
    rgba(0,0,0,0.7) 49%,
    black 50%,
    rgba(0,0,0,0.7) 52%,
    transparent 55%
  );

  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    transparent 48%,
    rgba(0,0,0,0.7) 49%,
    black 50%,
    rgba(0,0,0,0.7) 52%,
    transparent 55%
  );

  animation:
    scannerMove 7s linear infinite,
    glowPulse 1.2s ease-in-out infinite;

  filter: blur(4px);
}


        @keyframes glowPulse {

          0% {
            opacity: 0.2;
          }

          50% {
            opacity: 0.9;
          }

          100% {
            opacity: 0.2;
          }

        }


        /* ===================================================
           RIGHT SIDE BLUR
           
           The area AFTER the scanner is soft.
        =================================================== */

        .scan-blur {

          left: -2px;

          width: 460px;

          animation:
            scannerMove 7s linear infinite;

          transform: translateX(2px);

          background: linear-gradient(
            to right,
            rgba(0,240,255,0.17),
            rgba(0,240,255,0.10) 15%,
            rgba(0,240,255,0.055) 40%,
            rgba(0,240,255,0.02) 70%,
            transparent
          );

          filter: blur(18px);

          opacity: 0.8;

        }


        /* ===================================================
           REDUCE MOTION
        =================================================== */

        @media (prefers-reduced-motion: reduce) {

          .scanner-line,
          .scanner-core,
          .scanner-halo,
          .scan-dots,
          .scan-dot-glow,
          .scan-blur {
            animation: none;
          }

        }

      `}</style>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

export type TigerAction = "walk" | "read" | "wave";

interface TigerCharacterProps {
  action: TigerAction;
  className?: string;
}

const ANIMATION_CONFIGS: Record<TigerAction, {
  image: string;
  frames: number; // total frames
  cols: number; // Number of columns in sheet
  rows: number; // Number of rows in sheet
  durationMs: number; // milliseconds for full loop
  once?: boolean; // play once then trigger callback
  width?: number; // Base width of character
  height?: number; // Base height of character
}> = {
  walk: { image: "user_tiger_walk.png", frames: 8, cols: 4, rows: 2, durationMs: 3200, width: 64, height: 70 },
  read: { image: "user_tiger_read.png", frames: 8, cols: 4, rows: 2, durationMs: 4800, width: 64, height: 70 },
  wave: { image: "user_tiger_wave.png", frames: 8, cols: 4, rows: 2, durationMs: 3200, width: 64, height: 70 },
};

export function TigerCharacter({ action, className }: TigerCharacterProps) {
  const config = ANIMATION_CONFIGS[action];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0); // Reset frame on action change
    const interval = config.durationMs / config.frames;

    let isMounted = true;
    const timer = setInterval(() => {
      if (!isMounted) return;
      setFrame((prev) => {
        if (config.once && prev === config.frames - 1) {
          clearInterval(timer);
          return prev; // Stop on last frame
        }
        return (prev + 1) % config.frames;
      });
    }, interval);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [action, config]);

  const col = frame % config.cols;
  const row = Math.floor(frame / config.cols);

  // Percentages are (current_index / max_index) * 100
  const bgPosX = config.cols > 1 ? (col / (config.cols - 1)) * 100 : 0;
  const bgPosY = config.rows > 1 ? (row / (config.rows - 1)) * 100 : 0;

  return (
    <div
      className={`relative pointer-events-none transition-transform ${className || ""}`}
      style={{ width: `${config.width}px`, height: `${config.height}px` }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundImage: `url('/assets/tiger/${config.image}')`,
          backgroundSize: `${config.cols * 100}% ${config.rows * 100}%`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `${bgPosX}% ${bgPosY}%`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

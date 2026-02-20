import { useEffect, useRef, useState } from "react";

interface WordData {
  word: string;
  count: number;
}

export default function TagCloudViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState<WordData[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    fetch("/api/viz/tagcloud")
      .then((r) => r.json())
      .then((data: WordData[]) => setWords(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!words.length || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const maxCount = Math.max(...words.map((w) => w.count));
    const minCount = Math.min(...words.map((w) => w.count));

    interface PlacedWord {
      word: string;
      x: number;
      baseY: number;
      fontSize: number;
      opacity: number;
      speed: number;
      phase: number;
      weight: number;
    }

    const placedWords: PlacedWord[] = [];

    const verticalBands = 12;
    const bandHeight = canvas.height / verticalBands;

    for (let i = 0; i < words.length && i < 150; i++) {
      const w = words[i];
      const norm = maxCount > minCount ? (w.count - minCount) / (maxCount - minCount) : 0.5;

      const fontSize = 10 + norm * 28;
      const opacity = 0.3 + norm * 0.7;

      const band = i % verticalBands;
      const baseY = band * bandHeight + bandHeight * 0.5;

      const x = Math.random() * canvas.width;

      placedWords.push({
        word: w.word,
        x,
        baseY,
        fontSize,
        opacity,
        speed: 0.2 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        weight: norm,
      });
    }

    let time = 0;

    const draw = () => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      for (const pw of placedWords) {
        const waveAmplitude = 30 + pw.weight * 50;
        const waveFreq = 0.003 + pw.weight * 0.002;
        const timeOffset = time * pw.speed;

        const yOffset =
          Math.sin(pw.x * waveFreq + timeOffset + pw.phase) * waveAmplitude +
          Math.sin(pw.x * waveFreq * 0.5 + timeOffset * 0.7 + pw.phase * 1.3) * waveAmplitude * 0.4;

        const distFromCenter = Math.sqrt(
          Math.pow((pw.x - centerX) / centerX, 2) +
          Math.pow((pw.baseY - centerY) / centerY, 2)
        );
        const fadeEdge = Math.max(0, 1 - distFromCenter * 0.6);

        const y = pw.baseY + yOffset;

        ctx.save();
        ctx.font = `${pw.fontSize}px "JetBrains Mono", "Courier New", monospace`;
        ctx.fillStyle = `rgba(255, 255, 255, ${pw.opacity * fadeEdge})`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const verticalSqueeze = Math.cos(pw.x * waveFreq + timeOffset + pw.phase) * 0.15;
        ctx.translate(pw.x, y);
        ctx.transform(1, verticalSqueeze, 0, 1, 0, 0);
        ctx.fillText(pw.word, 0, 0);
        ctx.restore();
      }

      const scanlineY = (time * 30) % canvas.height;
      const gradient = ctx.createLinearGradient(0, scanlineY - 2, 0, scanlineY + 2);
      gradient.addColorStop(0, "rgba(255, 50, 50, 0)");
      gradient.addColorStop(0.5, "rgba(255, 50, 50, 0.15)");
      gradient.addColorStop(1, "rgba(255, 50, 50, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, scanlineY - 2, canvas.width, 4);

      time += 0.02;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [words]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#000",
        overflow: "hidden",
        cursor: "crosshair",
      }}
      data-testid="tagcloud-viz-container"
    >
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="tagcloud-canvas" />
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          color: "rgba(255,255,255,0.3)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: 2,
        }}
        data-testid="tagcloud-watermark"
      >
        CIMC RESEARCH OPS
      </div>
    </div>
  );
}

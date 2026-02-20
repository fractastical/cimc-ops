import { useEffect, useRef, useState } from "react";

interface DayData {
  date: string;
  commits: number;
  slack: number;
  research: number;
  prs: number;
  total: number;
  labels: string[];
}

export default function TagCloudViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<DayData[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const mouseRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    fetch("/api/viz/tagcloud")
      .then((r) => r.json())
      .then((d: DayData[]) => setData(d))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!data.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -1, y: -1 };
    };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    const maxTotal = Math.max(...data.map((d) => d.total), 1);

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const t = timeRef.current;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const margin = { left: 60, right: 40, top: 60, bottom: 80 };
      const plotW = W - margin.left - margin.right;
      const plotH = H - margin.top - margin.bottom;

      const centerY = margin.top + plotH / 2;

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 20; i++) {
        const y = margin.top + (plotH / 20) * i;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(W - margin.right, y);
        ctx.stroke();
      }

      const layers = [
        { key: "commits" as const, color: "rgba(255,255,255,", label: "commits" },
        { key: "prs" as const, color: "rgba(180,180,180,", label: "PRs/issues" },
        { key: "slack" as const, color: "rgba(120,120,120,", label: "slack" },
        { key: "research" as const, color: "rgba(200,200,200,", label: "research" },
      ];

      const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW;

      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        const waveOffset = li * 0.8;
        const baseAmplitude = plotH * 0.35;

        ctx.beginPath();
        let started = false;

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const x = margin.left + i * stepX;
          const val = d[layer.key];
          const norm = val / maxTotal;

          const wave =
            Math.sin(i * 0.15 + t * 0.4 + waveOffset) * 20 +
            Math.sin(i * 0.07 + t * 0.2 + waveOffset * 2) * 10;

          const y = centerY - norm * baseAmplitude + wave + (li - 1.5) * 30;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            const prevX = margin.left + (i - 1) * stepX;
            const cpX = (prevX + x) / 2;
            ctx.quadraticCurveTo(cpX, y + wave * 0.3, x, y);
          }
        }

        ctx.strokeStyle = layer.color + "0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const x = margin.left + i * stepX;
          const val = d[layer.key];
          if (val === 0) continue;

          const norm = val / maxTotal;
          const wave =
            Math.sin(i * 0.15 + t * 0.4 + waveOffset) * 20 +
            Math.sin(i * 0.07 + t * 0.2 + waveOffset * 2) * 10;
          const y = centerY - norm * baseAmplitude + wave + (li - 1.5) * 30;

          const barH = norm * baseAmplitude * 0.6 + 2;

          const grad = ctx.createLinearGradient(x, y, x, y + barH);
          grad.addColorStop(0, layer.color + (0.3 + norm * 0.5) + ")");
          grad.addColorStop(1, layer.color + "0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - 1, y, 2, barH);

          if (norm > 0.05 && d.labels.length > 0) {
            const labelIdx = i % d.labels.length;
            const label = d.labels[labelIdx];
            if (label) {
              const fontSize = 8 + norm * 10;
              ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
              ctx.fillStyle = layer.color + (0.15 + norm * 0.55) + ")";
              ctx.textAlign = "left";
              ctx.save();
              ctx.translate(x + 4, y - 4);
              const angle = Math.sin(i * 0.3 + t * 0.5) * 0.15 - 0.3;
              ctx.rotate(angle);
              const displayLabel = label.length > 20 ? label.substring(0, 20) : label;
              ctx.fillText(displayLabel, 0, 0);
              ctx.restore();
            }
          }
        }
      }

      const scanX = margin.left + ((t * 40) % plotW);
      const scanGrad = ctx.createLinearGradient(scanX - 3, 0, scanX + 3, 0);
      scanGrad.addColorStop(0, "rgba(255,50,50,0)");
      scanGrad.addColorStop(0.5, "rgba(255,50,50,0.2)");
      scanGrad.addColorStop(1, "rgba(255,50,50,0)");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(scanX - 3, margin.top, 6, plotH);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const labelEvery = Math.max(1, Math.floor(data.length / 15));
      for (let i = 0; i < data.length; i += labelEvery) {
        const x = margin.left + i * stepX;
        const d = data[i];
        const parts = d.date.split("-");
        const label = `${parts[1]}/${parts[2]}`;
        ctx.fillText(label, x, H - margin.bottom + 20);

        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();
      }

      if (mouseRef.current.x > margin.left && mouseRef.current.x < W - margin.right) {
        const mx = mouseRef.current.x;
        const idx = Math.round((mx - margin.left) / stepX);
        if (idx >= 0 && idx < data.length) {
          const d = data[idx];
          const x = margin.left + idx * stepX;

          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, margin.top);
          ctx.lineTo(x, margin.top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);

          const tooltipY = margin.top + 10;
          ctx.fillStyle = "rgba(0,0,0,0.85)";
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 1;
          const tw = 180;
          const th = 80;
          const tx = Math.min(x + 10, W - tw - 10);
          ctx.fillRect(tx, tooltipY, tw, th);
          ctx.strokeRect(tx, tooltipY, tw, th);

          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = "left";
          ctx.fillText(d.date, tx + 8, tooltipY + 18);

          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillText(`commits: ${d.commits}`, tx + 8, tooltipY + 34);
          ctx.fillText(`PRs: ${d.prs}`, tx + 8, tooltipY + 48);
          ctx.fillText(`slack: ${d.slack}`, tx + 8, tooltipY + 62);
          ctx.fillText(`research: ${d.research}`, tx + 8, tooltipY + 76);
        }
      }

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText("RESEARCH OPS ACTIVITY", margin.left, margin.top - 20);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      const firstDate = data[0]?.date || "";
      const lastDate = data[data.length - 1]?.date || "";
      ctx.fillText(`${firstDate}  —  ${lastDate}`, margin.left, margin.top - 6);

      const legendX = W - margin.right - 200;
      const legendY = margin.top - 20;
      layers.forEach((layer, i) => {
        const lx = legendX;
        const ly = legendY + i * 14;
        ctx.fillStyle = layer.color + "0.6)";
        ctx.fillRect(lx, ly - 4, 8, 8);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(layer.label, lx + 12, ly + 4);
      });

      timeRef.current += 0.02;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [data]);

  return (
    <div
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
          color: "rgba(255,255,255,0.2)",
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

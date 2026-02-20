import { useEffect, useRef, useState } from "react";

interface DayData {
  date: string;
  commits: number;
  prs: number;
  issues: number;
  total: number;
  labels: string[];
}

const LAYERS = [
  { key: "commits" as const, color: [255, 255, 255], label: "commits" },
  { key: "prs" as const, color: [180, 180, 180], label: "pull requests" },
  { key: "issues" as const, color: [120, 120, 120], label: "issues" },
];

export default function VizGithub() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<DayData[]>([]);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const mouseRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    fetch("/api/viz/github").then(r => r.json()).then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    if (!data.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 }; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const maxTotal = Math.max(...data.map(d => d.total), 1);

    const draw = () => {
      const W = canvas.width, H = canvas.height, t = tRef.current;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const m = { l: 60, r: 40, t: 70, b: 80 };
      const pW = W - m.l - m.r, pH = H - m.t - m.b;
      const centerY = m.t + pH / 2;
      const stepX = data.length > 1 ? pW / (data.length - 1) : pW;

      for (let i = 0; i < 20; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath();
        ctx.moveTo(m.l, m.t + (pH / 20) * i);
        ctx.lineTo(W - m.r, m.t + (pH / 20) * i);
        ctx.stroke();
      }

      LAYERS.forEach((layer, li) => {
        const [cr, cg, cb] = layer.color;
        const wOff = li * 0.9;
        const amp = pH * 0.35;

        ctx.beginPath();
        let started = false;
        for (let i = 0; i < data.length; i++) {
          const x = m.l + i * stepX;
          const val = data[i][layer.key];
          const norm = val / maxTotal;
          const wave = Math.sin(i * 0.15 + t * 0.4 + wOff) * 20 + Math.sin(i * 0.07 + t * 0.2 + wOff * 2) * 10;
          const y = centerY - norm * amp + wave + (li - 1) * 35;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.quadraticCurveTo((m.l + (i - 1) * stepX + x) / 2, y + wave * 0.3, x, y); }
        }
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const x = m.l + i * stepX;
          const val = d[layer.key];
          if (!val) continue;
          const norm = val / maxTotal;
          const wave = Math.sin(i * 0.15 + t * 0.4 + wOff) * 20 + Math.sin(i * 0.07 + t * 0.2 + wOff * 2) * 10;
          const y = centerY - norm * amp + wave + (li - 1) * 35;
          const barH = norm * amp * 0.6 + 2;
          const grad = ctx.createLinearGradient(x, y, x, y + barH);
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.3 + norm * 0.5})`);
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(x - 1, y, 2, barH);

          if (norm > 0.05 && d.labels.length) {
            const label = d.labels[i % d.labels.length];
            if (label) {
              const fs = 8 + norm * 10;
              ctx.font = `${fs}px "JetBrains Mono", monospace`;
              ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.15 + norm * 0.5})`;
              ctx.save();
              ctx.translate(x + 4, y - 4);
              ctx.rotate(Math.sin(i * 0.3 + t * 0.5) * 0.15 - 0.3);
              ctx.fillText(label.substring(0, 18), 0, 0);
              ctx.restore();
            }
          }
        }
      });

      const scanX = m.l + ((t * 40) % pW);
      const sg = ctx.createLinearGradient(scanX - 3, 0, scanX + 3, 0);
      sg.addColorStop(0, "rgba(255,50,50,0)");
      sg.addColorStop(0.5, "rgba(255,50,50,0.2)");
      sg.addColorStop(1, "rgba(255,50,50,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(scanX - 3, m.t, 6, pH);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const every = Math.max(1, Math.floor(data.length / 15));
      for (let i = 0; i < data.length; i += every) {
        const x = m.l + i * stepX;
        const p = data[i].date.split("-");
        ctx.fillText(`${p[1]}/${p[2]}`, x, H - m.b + 20);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + pH); ctx.stroke();
      }

      if (mouseRef.current.x > m.l && mouseRef.current.x < W - m.r) {
        const idx = Math.round((mouseRef.current.x - m.l) / stepX);
        if (idx >= 0 && idx < data.length) {
          const d = data[idx];
          const x = m.l + idx * stepX;
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + pH); ctx.stroke();
          ctx.setLineDash([]);
          const tx = Math.min(x + 10, W - 180);
          ctx.fillStyle = "rgba(0,0,0,0.9)";
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 1;
          ctx.fillRect(tx, m.t + 10, 170, 70);
          ctx.strokeRect(tx, m.t + 10, 170, 70);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = "left";
          ctx.fillText(d.date, tx + 8, m.t + 28);
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillText(`commits: ${d.commits}`, tx + 8, m.t + 44);
          ctx.fillText(`PRs: ${d.prs}  issues: ${d.issues}`, tx + 8, m.t + 58);
          ctx.fillText(`total: ${d.total}`, tx + 8, m.t + 72);
        }
      }

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText("GITHUB ACTIVITY", m.l, m.t - 24);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillText(`${data[0]?.date || ""}  —  ${data[data.length - 1]?.date || ""}`, m.l, m.t - 8);

      LAYERS.forEach((layer, i) => {
        const [cr, cg, cb] = layer.color;
        const lx = W - m.r - 160, ly = m.t - 24 + i * 14;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.6)`;
        ctx.fillRect(lx, ly - 4, 8, 8);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(layer.label, lx + 12, ly + 4);
      });

      tRef.current += 0.02;
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(animRef.current);
    };
  }, [data]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "crosshair" }} data-testid="viz-github-container">
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="viz-github-canvas" />
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2 }}>
        CIMC GITHUB OPS
      </div>
    </div>
  );
}

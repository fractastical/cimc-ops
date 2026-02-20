import { useEffect, useRef, useState } from "react";

interface DayData {
  date: string;
  meetings: number;
  milestones: number;
  submissions: number;
  total: number;
  labels: string[];
}

const LAYERS = [
  { key: "meetings" as const, color: [255, 255, 255], label: "meeting updates" },
  { key: "milestones" as const, color: [180, 180, 180], label: "milestones" },
  { key: "submissions" as const, color: [140, 140, 140], label: "submissions" },
];

export default function VizResearch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<DayData[]>([]);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const mouseRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    fetch("/api/viz/research").then(r => r.json()).then(setData).catch(console.error);
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

      const mg = { l: 60, r: 40, t: 70, b: 80 };
      const pW = W - mg.l - mg.r, pH = H - mg.t - mg.b;
      const centerY = mg.t + pH / 2;
      const stepX = data.length > 1 ? pW / (data.length - 1) : pW;

      for (let i = 0; i < 20; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath();
        ctx.moveTo(mg.l, mg.t + (pH / 20) * i);
        ctx.lineTo(W - mg.r, mg.t + (pH / 20) * i);
        ctx.stroke();
      }

      LAYERS.forEach((layer, li) => {
        const [cr, cg, cb] = layer.color;
        const wOff = li * 1.1;
        const amp = pH * 0.35;

        ctx.beginPath();
        let started = false;
        for (let i = 0; i < data.length; i++) {
          const x = mg.l + i * stepX;
          const val = data[i][layer.key];
          const norm = val / maxTotal;
          const wave = Math.sin(i * 0.2 + t * 0.3 + wOff) * 25 + Math.sin(i * 0.08 + t * 0.15 + wOff * 2) * 12;
          const y = centerY - norm * amp + wave + (li - 1) * 40;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.quadraticCurveTo((mg.l + (i - 1) * stepX + x) / 2, y + wave * 0.3, x, y); }
        }
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const x = mg.l + i * stepX;
          const val = d[layer.key];
          if (!val) continue;
          const norm = val / maxTotal;
          const wave = Math.sin(i * 0.2 + t * 0.3 + wOff) * 25 + Math.sin(i * 0.08 + t * 0.15 + wOff * 2) * 12;
          const y = centerY - norm * amp + wave + (li - 1) * 40;

          ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.4 + norm * 0.4})`;
          ctx.beginPath();
          ctx.arc(x, y, 2 + norm * 5, 0, Math.PI * 2);
          ctx.fill();

          if (norm > 0.03 && d.labels.length) {
            const label = d.labels[i % d.labels.length];
            if (label) {
              const fs = 9 + norm * 9;
              ctx.font = `${fs}px "JetBrains Mono", monospace`;
              ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.12 + norm * 0.5})`;
              ctx.save();
              ctx.translate(x + 6, y - 6);
              ctx.rotate(Math.sin(i * 0.4 + t * 0.3) * 0.12 - 0.25);
              ctx.fillText(label.substring(0, 22), 0, 0);
              ctx.restore();
            }
          }
        }
      });

      const scanX = mg.l + ((t * 30) % pW);
      const sg = ctx.createLinearGradient(scanX - 3, 0, scanX + 3, 0);
      sg.addColorStop(0, "rgba(255,50,50,0)");
      sg.addColorStop(0.5, "rgba(255,50,50,0.2)");
      sg.addColorStop(1, "rgba(255,50,50,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(scanX - 3, mg.t, 6, pH);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const every = Math.max(1, Math.floor(data.length / 12));
      for (let i = 0; i < data.length; i += every) {
        const x = mg.l + i * stepX;
        const p = data[i].date.split("-");
        ctx.fillText(`${p[1]}/${p[2]}`, x, H - mg.b + 20);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath(); ctx.moveTo(x, mg.t); ctx.lineTo(x, mg.t + pH); ctx.stroke();
      }

      if (mouseRef.current.x > mg.l && mouseRef.current.x < W - mg.r) {
        const idx = Math.round((mouseRef.current.x - mg.l) / stepX);
        if (idx >= 0 && idx < data.length) {
          const d = data[idx];
          const x = mg.l + idx * stepX;
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(x, mg.t); ctx.lineTo(x, mg.t + pH); ctx.stroke();
          ctx.setLineDash([]);
          const tx = Math.min(x + 10, W - 180);
          ctx.fillStyle = "rgba(0,0,0,0.9)";
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 1;
          ctx.fillRect(tx, mg.t + 10, 170, 70);
          ctx.strokeRect(tx, mg.t + 10, 170, 70);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = "left";
          ctx.fillText(d.date, tx + 8, mg.t + 28);
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillText(`meetings: ${d.meetings}`, tx + 8, mg.t + 44);
          ctx.fillText(`milestones: ${d.milestones}`, tx + 8, mg.t + 58);
          ctx.fillText(`submissions: ${d.submissions}`, tx + 8, mg.t + 72);
        }
      }

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText("RESEARCH ACTIVITY", mg.l, mg.t - 24);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillText(`${data[0]?.date || ""}  —  ${data[data.length - 1]?.date || ""}`, mg.l, mg.t - 8);

      LAYERS.forEach((layer, i) => {
        const [cr, cg, cb] = layer.color;
        const lx = W - mg.r - 180, ly = mg.t - 24 + i * 14;
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
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "crosshair" }} data-testid="viz-research-container">
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="viz-research-canvas" />
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2 }}>
        CIMC RESEARCH
      </div>
    </div>
  );
}

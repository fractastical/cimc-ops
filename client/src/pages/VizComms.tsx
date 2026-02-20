import { useEffect, useRef, useState } from "react";

interface DayData {
  date: string;
  human: number;
  bot: number;
  alerts: number;
  total: number;
  labels: string[];
}

const LAYERS = [
  { key: "human" as const, color: [255, 255, 255], label: "human messages" },
  { key: "bot" as const, color: [160, 160, 160], label: "bot messages" },
  { key: "alerts" as const, color: [130, 130, 130], label: "summaries/alerts" },
];

export default function VizComms() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<DayData[]>([]);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const mouseRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    fetch("/api/viz/comms").then(r => r.json()).then(setData).catch(console.error);
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
        const wOff = li * 0.7;
        const amp = pH * 0.35;

        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const x = mg.l + i * stepX;
          const val = d[layer.key];
          if (!val) continue;
          const norm = val / maxTotal;
          const wave = Math.sin(i * 0.12 + t * 0.5 + wOff) * 18 + Math.sin(i * 0.06 + t * 0.25 + wOff * 2) * 8;
          const y = centerY - norm * amp + wave + (li - 1) * 35;

          const barW = Math.max(2, stepX * 0.6);
          const barH = norm * amp * 0.8 + 3;
          const grad = ctx.createLinearGradient(x, y - barH / 2, x, y + barH / 2);
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
          grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.2 + norm * 0.5})`);
          grad.addColorStop(0.7, `rgba(${cr},${cg},${cb},${0.2 + norm * 0.5})`);
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH);

          if (norm > 0.04 && d.labels.length) {
            const label = d.labels[i % d.labels.length];
            if (label) {
              const fs = 7 + norm * 10;
              ctx.font = `${fs}px "JetBrains Mono", monospace`;
              ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.1 + norm * 0.45})`;
              ctx.save();
              ctx.translate(x, y - barH / 2 - 6);
              ctx.rotate(Math.sin(i * 0.25 + t * 0.4) * 0.2 - 0.15);
              ctx.textAlign = "center";
              ctx.fillText(label.substring(0, 20), 0, 0);
              ctx.restore();
            }
          }
        }
      });

      const scanX = mg.l + ((t * 35) % pW);
      const sg = ctx.createLinearGradient(scanX - 3, 0, scanX + 3, 0);
      sg.addColorStop(0, "rgba(255,50,50,0)");
      sg.addColorStop(0.5, "rgba(255,50,50,0.2)");
      sg.addColorStop(1, "rgba(255,50,50,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(scanX - 3, mg.t, 6, pH);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const every = Math.max(1, Math.floor(data.length / 15));
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
          ctx.fillText(`human: ${d.human}`, tx + 8, mg.t + 44);
          ctx.fillText(`bot: ${d.bot}`, tx + 8, mg.t + 58);
          ctx.fillText(`alerts: ${d.alerts}`, tx + 8, mg.t + 72);
        }
      }

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText("COMMUNICATIONS", mg.l, mg.t - 24);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillText(`${data[0]?.date || ""}  —  ${data[data.length - 1]?.date || ""}`, mg.l, mg.t - 8);

      LAYERS.forEach((layer, i) => {
        const [cr, cg, cb] = layer.color;
        const lx = W - mg.r - 190, ly = mg.t - 24 + i * 14;
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
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "crosshair" }} data-testid="viz-comms-container">
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="viz-comms-canvas" />
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2 }}>
        CIMC COMMUNICATIONS
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

interface Tag {
  word: string;
  count: number;
  category: string;
}

interface VizData {
  title: string;
  subtitle: string;
  tags: Tag[];
}

interface FloatingTag {
  word: string;
  count: number;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  angle: number;
  angleSpeed: number;
  phase: number;
}

export default function VizComms() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<VizData | null>(null);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const tagsRef = useRef<FloatingTag[]>([]);
  const mouseRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    fetch("/api/viz/comms").then(r => r.json()).then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    if (!data?.tags?.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 }; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const maxCount = Math.max(...data.tags.map(t => t.count), 1);
    const W = canvas.width, H = canvas.height;

    tagsRef.current = data.tags.map((tag, i) => {
      const norm = tag.count / maxCount;
      return {
        ...tag,
        x: Math.random() * W * 0.8 + W * 0.1,
        y: Math.random() * H * 0.7 + H * 0.15,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.2,
        size: 10 + norm * 44,
        opacity: 0.12 + norm * 0.75,
        angle: (Math.random() - 0.5) * 0.2,
        angleSpeed: (Math.random() - 0.5) * 0.001,
        phase: i * 0.6,
      };
    });

    const draw = () => {
      const W = canvas.width, H = canvas.height, t = tRef.current;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const gridSpacing = 80;
      ctx.strokeStyle = "rgba(255,255,255,0.012)";
      for (let x = gridSpacing; x < W; x += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = gridSpacing; y < H; y += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const mx = mouseRef.current.x, my = mouseRef.current.y;
      let hovered: FloatingTag | null = null;

      for (const tag of tagsRef.current) {
        tag.x += tag.vx + Math.sin(t * 0.35 + tag.phase) * 0.18;
        tag.y += tag.vy + Math.cos(t * 0.28 + tag.phase * 1.2) * 0.12;
        tag.angle += tag.angleSpeed;

        if (tag.x < 30) tag.vx = Math.abs(tag.vx) * 0.8 + 0.05;
        if (tag.x > W - 30) tag.vx = -Math.abs(tag.vx) * 0.8 - 0.05;
        if (tag.y < 50) tag.vy = Math.abs(tag.vy) * 0.8 + 0.05;
        if (tag.y > H - 40) tag.vy = -Math.abs(tag.vy) * 0.8 - 0.05;

        if (mx > 0 && my > 0) {
          const dx = tag.x - mx, dy = tag.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            tag.vx += dx / dist * 0.35;
            tag.vy += dy / dist * 0.35;
          }
        }

        tag.vx *= 0.994;
        tag.vy *= 0.994;

        const pulse = Math.sin(t * 0.9 + tag.phase) * 0.07;
        const alpha = Math.min(1, tag.opacity + pulse);
        ctx.save();
        ctx.translate(tag.x, tag.y);
        ctx.rotate(tag.angle);
        ctx.font = `${tag.size}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(tag.word, 0, 0);
        ctx.restore();

        if (mx > 0) {
          const tw = ctx.measureText(tag.word).width;
          if (Math.abs(mx - tag.x) < tw / 2 + 5 && Math.abs(my - tag.y) < tag.size / 2 + 5) {
            hovered = tag;
          }
        }
      }

      if (hovered) {
        const tx = Math.min(mx + 14, W - 200);
        const ty = Math.max(my - 40, 40);
        ctx.fillStyle = "rgba(0,0,0,0.9)";
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.fillRect(tx, ty, 180, 48);
        ctx.strokeRect(tx, ty, 180, 48);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(hovered.word, tx + 8, ty + 8);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(`${hovered.category} · ${hovered.count} mentions`, tx + 8, ty + 28);
      }

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(data.title, 24, 24);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText(data.subtitle, 24, 44);

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
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.15)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2 }}>
        CIMC COMMUNICATIONS
      </div>
    </div>
  );
}

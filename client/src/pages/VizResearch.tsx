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

interface PlacedTag {
  word: string;
  count: number;
  category: string;
  x: number;
  baseY: number;
  stemY: number;
  side: number;
  size: number;
  opacity: number;
  phase: number;
  drift: number;
  cluster: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  project: "rgba(220, 40, 40, 0.9)",
  person: "rgba(255, 255, 255, 0.85)",
  milestone: "rgba(255, 255, 255, 0.6)",
  lead: "rgba(220, 40, 40, 0.7)",
  language: "rgba(80, 200, 255, 0.9)",
  commit_keyword: "rgba(180, 255, 120, 0.85)",
};

const SPINE_COLOR = "rgba(220, 40, 40, 0.8)";
const STEM_COLOR = "rgba(255, 255, 255, 0.15)";

export default function VizResearch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<VizData | null>(null);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const tagsRef = useRef<PlacedTag[]>([]);
  const mouseRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    fetch("/api/viz/research").then(r => r.json()).then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    if (!data?.tags?.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      layoutTags();
    };

    const layoutTags = () => {
      const W = canvas.width, H = canvas.height;
      const maxCount = Math.max(...data.tags.map(t => t.count), 1);
      const spineY = H * 0.5;
      const numClusters = 6;
      const clusterWidth = W / numClusters;

      const categoryToCluster: Record<string, number> = {
        project: 0,
        person: 1,
        milestone: 2,
        lead: 3,
        language: 4,
        commit_keyword: 5,
      };

      const clusterBuckets: Tag[][] = Array.from({ length: numClusters }, () => []);
      for (const tag of data.tags) {
        const cluster = categoryToCluster[tag.category] ?? 0;
        clusterBuckets[cluster].push(tag);
      }

      for (const bucket of clusterBuckets) {
        bucket.sort((a, b) => b.count - a.count);
      }

      const placed: PlacedTag[] = [];
      let globalIdx = 0;

      for (let c = 0; c < numClusters; c++) {
        const bucket = clusterBuckets[c];
        const clusterBase = c * clusterWidth;
        let aboveCount = 0;
        let belowCount = 0;

        for (let i = 0; i < bucket.length; i++) {
          const tag = bucket[i];
          const norm = tag.count / maxCount;

          const side = (aboveCount <= belowCount) ? -1 : 1;
          if (side === -1) aboveCount++; else belowCount++;

          const stemLen = 30 + norm * 120 + (i % 5) * 22;
          const xSpread = clusterWidth * 0.82;
          const xOffset = bucket.length > 1 ? (i / (bucket.length - 1)) * xSpread : xSpread * 0.5;
          const jitter = (Math.random() - 0.5) * 15;

          const x = clusterBase + clusterWidth * 0.09 + xOffset + jitter;
          const stemY = spineY + side * stemLen;

          placed.push({
            ...tag,
            x: Math.max(40, Math.min(W - 40, x)),
            baseY: spineY,
            stemY,
            side,
            size: 9 + norm * 9,
            opacity: 0.3 + norm * 0.7,
            phase: globalIdx * 0.7 + Math.random() * 2,
            drift: (Math.random() - 0.5) * 0.3,
            cluster: c,
          });
          globalIdx++;
        }
      }
      tagsRef.current = placed;
    };

    resize();
    window.addEventListener("resize", resize);
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 }; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const draw = () => {
      const W = canvas.width, H = canvas.height, t = tRef.current;
      const tags = tagsRef.current;
      const spineY = H * 0.5;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = SPINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, spineY);
      for (let x = 0; x < W; x += 3) {
        const micro = Math.sin(x * 0.008 + t * 0.4) * 2 + Math.sin(x * 0.003 + t * 0.15) * 4;
        ctx.lineTo(x, spineY + micro);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(220, 40, 40, 0.25)";
      ctx.lineWidth = 0.5;
      for (let offset of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, spineY + offset * 8);
        for (let x = 0; x < W; x += 3) {
          const micro = Math.sin(x * 0.006 + t * 0.3 + offset * 2) * 3;
          ctx.lineTo(x, spineY + offset * 8 + micro);
        }
        ctx.stroke();
      }

      const numSections = 6;
      const sectionW = W / numSections;
      const sectionLabels = ["PROJECTS", "CONTRIBUTORS", "MILESTONES", "LEADS", "LANGUAGES", "COMMIT TERMS"];
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let i = 1; i < numSections; i++) {
        const sx = i * sectionW;
        ctx.beginPath();
        ctx.moveTo(sx, 30);
        ctx.lineTo(sx, H - 30);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.textAlign = "center";
      for (let i = 0; i < numSections; i++) {
        ctx.fillText(sectionLabels[i], i * sectionW + sectionW / 2, H - 16);
      }

      const mx = mouseRef.current.x, my = mouseRef.current.y;
      let hovered: PlacedTag | null = null;

      for (const tag of tags) {
        const pulse = Math.sin(t * 0.5 + tag.phase) * 1.5;
        const yOff = Math.sin(t * 0.3 + tag.phase) * tag.drift * 8;
        const stemEnd = tag.stemY + yOff + pulse * tag.side;
        const spinePoint = tag.baseY + Math.sin(tag.x * 0.008 + t * 0.4) * 2 + Math.sin(tag.x * 0.003 + t * 0.15) * 4;

        ctx.strokeStyle = STEM_COLOR;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(tag.x, spinePoint);
        ctx.lineTo(tag.x, stemEnd);
        ctx.stroke();

        const tickW = 3 + tag.count * 0.5;
        ctx.strokeStyle = CATEGORY_COLORS[tag.category] || "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tag.x - tickW, stemEnd);
        ctx.lineTo(tag.x + tickW, stemEnd);
        ctx.stroke();

        ctx.save();
        ctx.translate(tag.x, stemEnd + tag.side * (tag.size * 0.5 + 4));
        ctx.font = `${tag.size}px "JetBrains Mono", monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = tag.side === -1 ? "bottom" : "top";
        ctx.fillStyle = CATEGORY_COLORS[tag.category] || "rgba(255,255,255,0.6)";
        ctx.globalAlpha = tag.opacity;
        ctx.fillText(tag.word, 0, 0);
        ctx.globalAlpha = 1;
        ctx.restore();

        if (mx > 0) {
          const tw = ctx.measureText(tag.word).width;
          const textY = stemEnd + tag.side * (tag.size * 0.5 + 4);
          const textTop = tag.side === -1 ? textY - tag.size : textY;
          if (mx >= tag.x - 4 && mx <= tag.x + tw + 4 && my >= textTop - 4 && my <= textTop + tag.size + 4) {
            hovered = tag;
          }
        }
      }

      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i], b = tags[j];
          if (a.category !== b.category) continue;
          const dx = a.x - b.x, dy = a.stemY - b.stemY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const alpha = (1 - dist / 120) * 0.06;
            ctx.strokeStyle = `rgba(220, 40, 40, ${alpha})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            const aEnd = a.stemY + Math.sin(t * 0.3 + a.phase) * a.drift * 8;
            const bEnd = b.stemY + Math.sin(t * 0.3 + b.phase) * b.drift * 8;
            ctx.moveTo(a.x, aEnd);
            ctx.lineTo(b.x, bEnd);
            ctx.stroke();
          }
        }
      }

      if (mx > 0 && my > 0) {
        for (const tag of tags) {
          const dx = tag.x - mx, dy = tag.stemY - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.12;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(tag.x, tag.stemY);
            ctx.stroke();
          }
        }
      }

      if (hovered) {
        const tx = Math.min(mx + 16, W - 220);
        const ty = Math.max(my - 50, 40);
        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.strokeStyle = "rgba(220, 40, 40, 0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(tx, ty, 200, 52);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(hovered.word, tx + 10, ty + 10);
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fillText(`${hovered.category} | ${hovered.count} events`, tx + 10, ty + 30);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(data.title, 20, 18);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillText(data.subtitle, 20, 36);

      tRef.current += 0.016;
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
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.12)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3 }}>
        CIMC RESEARCH
      </div>
    </div>
  );
}

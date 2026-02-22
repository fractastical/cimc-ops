import { useEffect, useRef, useState } from "react";

interface Tag {
  word: string;
  count: number;
  category: string;
  minDate: number | null;
  maxDate: number | null;
  meanDate: number | null;
}

interface VizData {
  title: string;
  subtitle: string;
  tags: Tag[];
  dateRange: { min: number; max: number };
}

interface PlacedTag {
  word: string;
  count: number;
  category: string;
  x: number;
  baseY: number;
  stemY: number;
  side: number;
  radius: number;
  opacity: number;
  phase: number;
  drift: number;
  meanDate: number | null;
  minDate: number | null;
  maxDate: number | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  project: "#dc2828",
  person: "#ffffff",
  milestone: "#999999",
  lead: "#dc5050",
  language: "#50c8ff",
  commit_keyword: "#b4ff78",
};

const CATEGORY_COLORS_DIM: Record<string, string> = {
  project: "rgba(220, 40, 40, 0.6)",
  person: "rgba(255, 255, 255, 0.35)",
  milestone: "rgba(153, 153, 153, 0.35)",
  lead: "rgba(220, 80, 80, 0.4)",
  language: "rgba(80, 200, 255, 0.5)",
  commit_keyword: "rgba(180, 255, 120, 0.45)",
};

const SPINE_COLOR = "rgba(220, 40, 40, 0.8)";
const STEM_COLOR = "rgba(255, 255, 255, 0.08)";

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

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
      const margin = 60;
      const plotW = W - margin * 2;

      const { min: globalMin, max: globalMax } = data.dateRange;
      const dateSpan = globalMax - globalMin || 1;

      const categoryOrder = ["project", "person", "milestone", "lead", "language", "commit_keyword"];
      const categoryBuckets: Record<string, Tag[]> = {};
      for (const cat of categoryOrder) categoryBuckets[cat] = [];
      for (const tag of data.tags) {
        const cat = tag.category;
        if (categoryBuckets[cat]) categoryBuckets[cat].push(tag);
      }

      const placed: PlacedTag[] = [];
      const occupiedAbove: { x: number; y: number; r: number }[] = [];
      const occupiedBelow: { x: number; y: number; r: number }[] = [];

      const categoryBands: Record<string, number> = {};
      categoryOrder.forEach((cat, i) => {
        categoryBands[cat] = (i % 2 === 0) ? -1 : 1;
      });

      let globalIdx = 0;

      for (const cat of categoryOrder) {
        const bucket = categoryBuckets[cat];
        bucket.sort((a, b) => b.count - a.count);

        for (const tag of bucket) {
          const norm = tag.count / maxCount;

          let x: number;
          if (tag.meanDate) {
            const dateNorm = (tag.meanDate - globalMin) / dateSpan;
            x = margin + dateNorm * plotW;
          } else {
            x = margin + Math.random() * plotW;
          }

          const preferredSide = categoryBands[cat] || ((globalIdx % 2 === 0) ? -1 : 1);
          const stemLen = 30 + norm * 150;

          let finalX = x;
          let stemY = spineY + preferredSide * stemLen;
          const radius = 2.5 + norm * 4;

          const occupied = preferredSide === -1 ? occupiedAbove : occupiedBelow;
          let attempts = 0;
          while (attempts < 15) {
            let collision = false;
            for (const o of occupied) {
              const dx = finalX - o.x, dy = stemY - o.y;
              const minDist = radius + o.r + 6;
              if (Math.sqrt(dx * dx + dy * dy) < minDist) {
                collision = true;
                break;
              }
            }
            if (!collision) break;
            stemY = spineY + preferredSide * (stemLen + (attempts + 1) * 12);
            finalX = x + (Math.random() - 0.5) * 8;
            attempts++;
          }

          finalX = Math.max(margin, Math.min(W - margin, finalX));

          occupied.push({ x: finalX, y: stemY, r: radius });

          placed.push({
            word: tag.word,
            count: tag.count,
            category: tag.category,
            x: finalX,
            baseY: spineY,
            stemY,
            side: preferredSide,
            radius,
            opacity: 0.4 + norm * 0.6,
            phase: globalIdx * 0.7 + Math.random() * 2,
            drift: (Math.random() - 0.5) * 0.2,
            meanDate: tag.meanDate,
            minDate: tag.minDate,
            maxDate: tag.maxDate,
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
      const margin = 60;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = SPINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(margin, spineY);
      for (let x = margin; x < W - margin; x += 3) {
        const micro = Math.sin(x * 0.008 + t * 0.4) * 1.5 + Math.sin(x * 0.003 + t * 0.15) * 3;
        ctx.lineTo(x, spineY + micro);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(220, 40, 40, 0.2)";
      ctx.lineWidth = 0.5;
      for (const offset of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(margin, spineY + offset * 6);
        for (let x = margin; x < W - margin; x += 3) {
          const micro = Math.sin(x * 0.006 + t * 0.3 + offset * 2) * 2;
          ctx.lineTo(x, spineY + offset * 6 + micro);
        }
        ctx.stroke();
      }

      const { min: globalMin, max: globalMax } = data.dateRange;
      const dateSpan = globalMax - globalMin || 1;
      const plotW = W - margin * 2;
      const numTicks = Math.min(8, Math.max(3, Math.floor(plotW / 120)));
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = 0; i <= numTicks; i++) {
        const frac = i / numTicks;
        const x = margin + frac * plotW;
        const dateTs = globalMin + frac * dateSpan;
        ctx.fillText(formatDateShort(dateTs), x, spineY + 14);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(x, H - 40);
        ctx.stroke();
      }

      const mx = mouseRef.current.x, my = mouseRef.current.y;
      let hovered: PlacedTag | null = null;
      let hoveredDist = Infinity;

      for (const tag of tags) {
        const pulse = Math.sin(t * 0.5 + tag.phase) * 1;
        const yOff = Math.sin(t * 0.3 + tag.phase) * tag.drift * 6;
        const stemEnd = tag.stemY + yOff + pulse * tag.side;
        const spinePoint = tag.baseY + Math.sin(tag.x * 0.008 + t * 0.4) * 1.5 + Math.sin(tag.x * 0.003 + t * 0.15) * 3;

        ctx.strokeStyle = STEM_COLOR;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(tag.x, spinePoint);
        ctx.lineTo(tag.x, stemEnd);
        ctx.stroke();

        const color = CATEGORY_COLORS_DIM[tag.category] || "rgba(255,255,255,0.3)";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(tag.x, stemEnd, tag.radius, 0, Math.PI * 2);
        ctx.fill();

        if (mx > 0) {
          const dx = tag.x - mx, dy = stemEnd - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < Math.max(tag.radius + 20, 30) && dist < hoveredDist) {
            hovered = tag;
            hoveredDist = dist;
          }
        }
      }

      if (hovered) {
        const pulse = Math.sin(t * 0.5 + hovered.phase) * 1;
        const yOff = Math.sin(t * 0.3 + hovered.phase) * hovered.drift * 6;
        const stemEnd = hovered.stemY + yOff + pulse * hovered.side;

        const fullColor = CATEGORY_COLORS[hovered.category] || "#ffffff";
        ctx.fillStyle = fullColor;
        ctx.beginPath();
        ctx.arc(hovered.x, stemEnd, hovered.radius + 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = fullColor;
        ctx.lineWidth = 0.8;
        const spinePoint = hovered.baseY + Math.sin(hovered.x * 0.008 + t * 0.4) * 1.5 + Math.sin(hovered.x * 0.003 + t * 0.15) * 3;
        ctx.beginPath();
        ctx.moveTo(hovered.x, spinePoint);
        ctx.lineTo(hovered.x, stemEnd);
        ctx.stroke();

        ctx.shadowColor = fullColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = fullColor;
        ctx.beginPath();
        ctx.arc(hovered.x, stemEnd, hovered.radius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const labelY = stemEnd + hovered.side * (hovered.radius + 14);
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = hovered.side === -1 ? "bottom" : "top";
        ctx.fillStyle = fullColor;
        ctx.fillText(hovered.word, hovered.x, labelY);

        const tooltipW = 220;
        const tooltipH = 64;
        let tx = hovered.x - tooltipW / 2;
        let ty = hovered.side === -1 ? labelY - 18 - tooltipH : labelY + 18;
        tx = Math.max(10, Math.min(W - tooltipW - 10, tx));
        ty = Math.max(10, Math.min(H - tooltipH - 10, ty));

        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.strokeStyle = `${fullColor}44`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tooltipW, tooltipH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`${hovered.category} · ${hovered.count} events`, tx + 10, ty + 10);

        if (hovered.meanDate) {
          const meanStr = formatDateShort(hovered.meanDate);
          let dateInfo = `mean: ${meanStr}`;
          if (hovered.minDate && hovered.maxDate && hovered.minDate !== hovered.maxDate) {
            dateInfo += `  (${formatDateShort(hovered.minDate)} – ${formatDateShort(hovered.maxDate)})`;
          }
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fillText(dateInfo, tx + 10, ty + 28);
        }

        ctx.fillStyle = `${fullColor}88`;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(`x: date position · y: event count`, tx + 10, ty + 46);
      }

      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i], b = tags[j];
          if (a.category !== b.category) continue;
          const aEnd = a.stemY + Math.sin(t * 0.3 + a.phase) * a.drift * 6;
          const bEnd = b.stemY + Math.sin(t * 0.3 + b.phase) * b.drift * 6;
          const dx = a.x - b.x, dy = aEnd - bEnd;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            const alpha = (1 - dist / 80) * 0.04;
            ctx.strokeStyle = `rgba(220, 40, 40, ${alpha})`;
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(a.x, aEnd);
            ctx.lineTo(b.x, bEnd);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(data.title, 20, 16);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillText(data.subtitle, 20, 34);

      const legendY = 56;
      const legendCats = [
        { label: "projects", color: CATEGORY_COLORS.project },
        { label: "people", color: CATEGORY_COLORS.person },
        { label: "milestones", color: CATEGORY_COLORS.milestone },
        { label: "leads", color: CATEGORY_COLORS.lead },
        { label: "languages", color: CATEGORY_COLORS.language },
        { label: "keywords", color: CATEGORY_COLORS.commit_keyword },
      ];
      let lx = 20;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textBaseline = "middle";
      for (const lc of legendCats) {
        ctx.fillStyle = lc.color;
        ctx.beginPath();
        ctx.arc(lx + 4, legendY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.textAlign = "left";
        ctx.fillText(lc.label, lx + 12, legendY);
        lx += ctx.measureText(lc.label).width + 24;
      }

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

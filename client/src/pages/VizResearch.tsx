import { useEffect, useRef, useState, useCallback } from "react";

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
  y: number;
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
  norm: number;
  catIndex: number;
  angle: number;
  orbitR: number;
  vx: number;
  vy: number;
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

const MODES = ["NETWORK", "CONSTELLATION", "ORBITAL", "SCATTER"] as const;
type VizMode = typeof MODES[number];

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function VizResearch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<VizData | null>(null);
  const [mode, setMode] = useState<VizMode>("NETWORK");
  const animRef = useRef(0);
  const tRef = useRef(0);
  const tagsRef = useRef<PlacedTag[]>([]);
  const mouseRef = useRef({ x: -1, y: -1 });
  const modeRef = useRef<VizMode>("NETWORK");
  const transitionRef = useRef(0);
  const prevModeRef = useRef<VizMode>("NETWORK");

  useEffect(() => {
    fetch("/api/viz/research").then(r => r.json()).then(setData).catch(console.error);
  }, []);

  const cycleMode = useCallback(() => {
    setMode(prev => {
      const idx = MODES.indexOf(prev);
      const next = MODES[(idx + 1) % MODES.length];
      prevModeRef.current = prev;
      modeRef.current = next;
      transitionRef.current = 0;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Tab") {
        e.preventDefault();
        cycleMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleMode]);

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
      const cx = W / 2, cy = H / 2;

      const { min: globalMin, max: globalMax } = data.dateRange;
      const dateSpan = globalMax - globalMin || 1;

      const categoryOrder = ["project", "person", "milestone", "lead", "language", "commit_keyword"];
      const categoryBuckets: Record<string, Tag[]> = {};
      for (const cat of categoryOrder) categoryBuckets[cat] = [];
      for (const tag of data.tags) {
        if (categoryBuckets[tag.category]) categoryBuckets[tag.category].push(tag);
      }

      const placed: PlacedTag[] = [];
      const occupiedAbove: { x: number; y: number; r: number }[] = [];
      const occupiedBelow: { x: number; y: number; r: number }[] = [];
      const categoryBands: Record<string, number> = {};
      categoryOrder.forEach((cat, i) => { categoryBands[cat] = (i % 2 === 0) ? -1 : 1; });

      let globalIdx = 0;
      for (const cat of categoryOrder) {
        const bucket = categoryBuckets[cat];
        bucket.sort((a, b) => b.count - a.count);
        const catIdx = categoryOrder.indexOf(cat);

        for (let bi = 0; bi < bucket.length; bi++) {
          const tag = bucket[bi];
          const norm = tag.count / maxCount;

          let netX: number;
          if (tag.meanDate) {
            netX = margin + ((tag.meanDate - globalMin) / dateSpan) * plotW;
          } else {
            netX = margin + Math.random() * plotW;
          }

          const preferredSide = categoryBands[cat] || ((globalIdx % 2 === 0) ? -1 : 1);
          const stemLen = 30 + norm * 150;
          let finalX = netX;
          let stemY = spineY + preferredSide * stemLen;
          const radius = 2.5 + norm * 4;

          const occupied = preferredSide === -1 ? occupiedAbove : occupiedBelow;
          let attempts = 0;
          while (attempts < 15) {
            let collision = false;
            for (const o of occupied) {
              const ddx = finalX - o.x, ddy = stemY - o.y;
              if (Math.sqrt(ddx * ddx + ddy * ddy) < radius + o.r + 6) { collision = true; break; }
            }
            if (!collision) break;
            stemY = spineY + preferredSide * (stemLen + (attempts + 1) * 12);
            finalX = netX + (Math.random() - 0.5) * 8;
            attempts++;
          }
          finalX = Math.max(margin, Math.min(W - margin, finalX));
          occupied.push({ x: finalX, y: stemY, r: radius });

          const sectorAngle = (catIdx / categoryOrder.length) * Math.PI * 2 + (bi / Math.max(bucket.length, 1)) * (Math.PI * 2 / categoryOrder.length);
          const orbitR = 60 + (1 - norm) * Math.min(cx, cy) * 0.6 + bi * 8;

          placed.push({
            word: tag.word, count: tag.count, category: tag.category,
            x: finalX, y: stemY, baseY: spineY, stemY, side: preferredSide,
            radius, opacity: 0.4 + norm * 0.6,
            phase: globalIdx * 0.7 + Math.random() * 2,
            drift: (Math.random() - 0.5) * 0.2,
            meanDate: tag.meanDate, minDate: tag.minDate, maxDate: tag.maxDate,
            norm, catIndex: catIdx,
            angle: sectorAngle, orbitR,
            vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
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

    const getTagPos = (tag: PlacedTag, m: VizMode, t: number, W: number, H: number): { x: number; y: number } => {
      const cx = W / 2, cy = H / 2;
      const margin = 60;
      const { min: globalMin, max: globalMax } = data.dateRange;
      const dateSpan = globalMax - globalMin || 1;
      const plotW = W - margin * 2;

      switch (m) {
        case "NETWORK": {
          const pulse = Math.sin(t * 0.5 + tag.phase) * 1;
          const yOff = Math.sin(t * 0.3 + tag.phase) * tag.drift * 6;
          return { x: tag.x, y: tag.stemY + yOff + pulse * tag.side };
        }
        case "CONSTELLATION": {
          const dateNorm = tag.meanDate ? (tag.meanDate - globalMin) / dateSpan : 0.5;
          const bx = margin + dateNorm * plotW;
          const countY = cy + (tag.side) * (20 + tag.norm * (H * 0.3));
          const wobX = Math.sin(t * 0.2 + tag.phase) * 3;
          const wobY = Math.cos(t * 0.15 + tag.phase * 1.3) * 3;
          return { x: bx + wobX, y: countY + wobY };
        }
        case "ORBITAL": {
          const speed = 0.08 + (1 - tag.norm) * 0.15;
          const a = tag.angle + t * speed;
          const wobble = Math.sin(t * 0.3 + tag.phase) * 4;
          return {
            x: cx + Math.cos(a) * (tag.orbitR + wobble),
            y: cy + Math.sin(a) * (tag.orbitR + wobble) * 0.6,
          };
        }
        case "SCATTER": {
          const baseX = tag.x;
          const baseY = tag.stemY;
          const gravX = Math.sin(t * 0.1 + tag.phase) * 30;
          const gravY = Math.cos(t * 0.08 + tag.phase * 0.7) * 20;
          const repelX = Math.sin(t * 0.4 + tag.catIndex * 2) * 15 * tag.norm;
          const repelY = Math.cos(t * 0.35 + tag.catIndex * 1.5) * 10 * tag.norm;
          return { x: baseX + gravX + repelX, y: baseY + gravY + repelY };
        }
      }
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height, t = tRef.current;
      const tags = tagsRef.current;
      const spineY = H * 0.5;
      const margin = 60;
      const cx = W / 2, cy = H / 2;
      const curMode = modeRef.current;

      transitionRef.current = Math.min(transitionRef.current + 0.025, 1);
      const tween = transitionRef.current;
      const eased = tween < 1 ? 1 - Math.pow(1 - tween, 3) : 1;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const { min: globalMin, max: globalMax } = data.dateRange;
      const dateSpan = globalMax - globalMin || 1;
      const plotW = W - margin * 2;

      if (curMode === "NETWORK" || (tween < 1 && prevModeRef.current === "NETWORK")) {
        const netAlpha = curMode === "NETWORK" ? eased : 1 - eased;
        ctx.globalAlpha = netAlpha;
        ctx.strokeStyle = SPINE_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(margin, spineY);
        for (let xx = margin; xx < W - margin; xx += 3) {
          const micro = Math.sin(xx * 0.008 + t * 0.4) * 1.5 + Math.sin(xx * 0.003 + t * 0.15) * 3;
          ctx.lineTo(xx, spineY + micro);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(220, 40, 40, 0.2)";
        ctx.lineWidth = 0.5;
        for (const offset of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(margin, spineY + offset * 6);
          for (let xx = margin; xx < W - margin; xx += 3) {
            ctx.lineTo(xx, spineY + offset * 6 + Math.sin(xx * 0.006 + t * 0.3 + offset * 2) * 2);
          }
          ctx.stroke();
        }

        const numTicks = Math.min(8, Math.max(3, Math.floor(plotW / 120)));
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (let i = 0; i <= numTicks; i++) {
          const frac = i / numTicks;
          const xx = margin + frac * plotW;
          ctx.fillText(formatDateShort(globalMin + frac * dateSpan), xx, spineY + 14);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(xx, 40);
          ctx.lineTo(xx, H - 40);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (curMode === "ORBITAL" || (tween < 1 && prevModeRef.current === "ORBITAL")) {
        const orbAlpha = curMode === "ORBITAL" ? eased : 1 - eased;
        ctx.globalAlpha = orbAlpha * 0.08;
        ctx.strokeStyle = "rgba(220, 40, 40, 1)";
        ctx.lineWidth = 0.5;
        for (let r = 60; r < Math.min(cx, cy) * 0.8; r += 40) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = hexToRgba(CATEGORY_COLORS.project, orbAlpha * 0.7);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = CATEGORY_COLORS.project;
        ctx.shadowBlur = orbAlpha * 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (curMode === "CONSTELLATION" || (tween < 1 && prevModeRef.current === "CONSTELLATION")) {
        const conAlpha = curMode === "CONSTELLATION" ? eased : 1 - eased;
        ctx.globalAlpha = conAlpha;
        const numTicks = Math.min(8, Math.max(3, Math.floor(plotW / 120)));
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        for (let i = 0; i <= numTicks; i++) {
          const frac = i / numTicks;
          const xx = margin + frac * plotW;
          ctx.fillText(formatDateShort(globalMin + frac * dateSpan), xx, H - 16);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(xx, 40);
          ctx.lineTo(xx, H - 30);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      const mx = mouseRef.current.x, my = mouseRef.current.y;
      let hovered: PlacedTag | null = null;
      let hoveredDist = Infinity;
      const positions: { tag: PlacedTag; px: number; py: number }[] = [];

      for (const tag of tags) {
        let pos: { x: number; y: number };
        if (tween < 1) {
          const from = getTagPos(tag, prevModeRef.current, t, W, H);
          const to = getTagPos(tag, curMode, t, W, H);
          pos = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
        } else {
          pos = getTagPos(tag, curMode, t, W, H);
        }
        positions.push({ tag, px: pos.x, py: pos.y });
      }

      if (curMode === "NETWORK" || (tween < 1 && prevModeRef.current === "NETWORK")) {
        const netAlpha = curMode === "NETWORK" ? eased : 1 - eased;
        ctx.globalAlpha = netAlpha;
        for (const { tag, px, py } of positions) {
          const spinePoint = tag.baseY + Math.sin(tag.x * 0.008 + t * 0.4) * 1.5 + Math.sin(tag.x * 0.003 + t * 0.15) * 3;
          ctx.strokeStyle = STEM_COLOR;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(px, spinePoint);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (curMode === "CONSTELLATION" || curMode === "SCATTER") {
        const alpha = tween < 1 ? (curMode === "CONSTELLATION" || curMode === "SCATTER" ? eased : 1 - eased) : 1;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < positions.length; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            const a = positions[i], b = positions[j];
            if (a.tag.category !== b.tag.category) continue;
            const dx = a.px - b.px, dy = a.py - b.py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const threshold = curMode === "CONSTELLATION" ? 150 : 120;
            if (dist < threshold) {
              const la = (1 - dist / threshold) * 0.12;
              ctx.strokeStyle = hexToRgba(CATEGORY_COLORS[a.tag.category] || "#ffffff", la);
              ctx.lineWidth = 0.4;
              ctx.beginPath();
              ctx.moveTo(a.px, a.py);
              ctx.lineTo(b.px, b.py);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      for (const { tag, px, py } of positions) {
        const color = CATEGORY_COLORS_DIM[tag.category] || "rgba(255,255,255,0.3)";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, tag.radius, 0, Math.PI * 2);
        ctx.fill();

        if (curMode === "SCATTER") {
          ctx.strokeStyle = hexToRgba(CATEGORY_COLORS[tag.category] || "#ffffff", 0.08);
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.arc(px, py, tag.radius + 4 + Math.sin(t + tag.phase) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (mx > 0) {
          const dx = px - mx, dy = py - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < Math.max(tag.radius + 20, 30) && dist < hoveredDist) {
            hovered = tag;
            hoveredDist = dist;
          }
        }
      }

      if (hovered) {
        const hp = positions.find(p => p.tag === hovered)!;
        const fullColor = CATEGORY_COLORS[hovered.category] || "#ffffff";

        ctx.shadowColor = fullColor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = fullColor;
        ctx.beginPath();
        ctx.arc(hp.px, hp.py, hovered.radius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const aboveCenter = hp.py < cy;
        const labelDir = aboveCenter ? -1 : 1;
        const labelY = hp.py + labelDir * (hovered.radius + 16);
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = aboveCenter ? "bottom" : "top";
        ctx.fillStyle = fullColor;
        ctx.fillText(hovered.word, hp.px, labelY);

        const tooltipW = 220;
        const tooltipH = 64;
        let tx = hp.px - tooltipW / 2;
        let ty = aboveCenter ? labelY - 18 - tooltipH : labelY + 18;
        tx = Math.max(10, Math.min(W - tooltipW - 10, tx));
        ty = Math.max(10, Math.min(H - tooltipH - 10, ty));

        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.strokeStyle = hexToRgba(fullColor, 0.3);
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
          let dateInfo = `mean: ${formatDateShort(hovered.meanDate)}`;
          if (hovered.minDate && hovered.maxDate && hovered.minDate !== hovered.maxDate) {
            dateInfo += `  (${formatDateShort(hovered.minDate)} – ${formatDateShort(hovered.maxDate)})`;
          }
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fillText(dateInfo, tx + 10, ty + 28);
        }

        ctx.fillStyle = hexToRgba(fullColor, 0.4);
        ctx.font = '8px "JetBrains Mono", monospace';
        const axisInfo = curMode === "NETWORK" ? "x: date · y: count" : curMode === "ORBITAL" ? "orbit: count · sector: category" : curMode === "CONSTELLATION" ? "x: date · y: category band" : "drift: count · cluster: category";
        ctx.fillText(axisInfo, tx + 10, ty + 46);
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

      const modeY = H - 40;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const totalW = MODES.length * 100;
      const startX = cx - totalW / 2;
      for (let i = 0; i < MODES.length; i++) {
        const mx2 = startX + i * 100 + 50;
        const isActive = MODES[i] === curMode;
        if (isActive) {
          ctx.fillStyle = "rgba(220, 40, 40, 0.15)";
          ctx.beginPath();
          ctx.roundRect(mx2 - 40, modeY - 10, 80, 20, 3);
          ctx.fill();
          ctx.strokeStyle = "rgba(220, 40, 40, 0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.fillStyle = isActive ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.25)";
        ctx.textBaseline = "middle";
        ctx.fillText(MODES[i], mx2, modeY);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("SPACE / TAB to switch · hover for details", cx, H - 14);

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

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const W = canvas.width, H = canvas.height;
    const cxCanvas = W / 2;
    const modeY = H - 40;
    const totalW = MODES.length * 100;
    const startX = cxCanvas - totalW / 2;

    for (let i = 0; i < MODES.length; i++) {
      const mx2 = startX + i * 100 + 50;
      if (clickX >= mx2 - 40 && clickX <= mx2 + 40 && clickY >= modeY - 10 && clickY <= modeY + 10) {
        const target = MODES[i];
        if (target !== modeRef.current) {
          prevModeRef.current = modeRef.current;
          modeRef.current = target;
          transitionRef.current = 0;
          setMode(target);
        }
        return;
      }
    }
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "crosshair" }} data-testid="viz-research-container">
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="viz-research-canvas" onClick={handleCanvasClick} />
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.12)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3 }}>
        CIMC RESEARCH
      </div>
    </div>
  );
}

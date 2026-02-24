import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch } from "wouter";

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
  radius: number;
  opacity: number;
  phase: number;
  norm: number;
  catIndex: number;
  angle: number;
  orbitR: number;
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
  project: "rgba(220, 40, 40, 0.55)",
  person: "rgba(255, 255, 255, 0.3)",
  milestone: "rgba(153, 153, 153, 0.3)",
  lead: "rgba(220, 80, 80, 0.35)",
  language: "rgba(80, 200, 255, 0.45)",
  commit_keyword: "rgba(180, 255, 120, 0.4)",
};

const MODES = ["ORBITAL", "HELIX", "PULSE", "GALAXY"] as const;
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

function parseModeFromSearch(search: string): VizMode {
  const params = new URLSearchParams(search);
  const m = (params.get("mode") || "").toUpperCase();
  if (MODES.includes(m as VizMode)) return m as VizMode;
  return "ORBITAL";
}

export default function VizResearch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<VizData | null>(null);
  const search = useSearch();
  const initialMode = parseModeFromSearch(search);
  const [mode, setMode] = useState<VizMode>(initialMode);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const tagsRef = useRef<PlacedTag[]>([]);
  const mouseRef = useRef({ x: -1, y: -1 });
  const modeRef = useRef<VizMode>(initialMode);
  const transitionRef = useRef(1);
  const prevModeRef = useRef<VizMode>(initialMode);

  useEffect(() => {
    fetch("/api/viz/research").then(r => r.json()).then(setData).catch(console.error);
  }, []);

  const switchMode = useCallback((target: VizMode) => {
    if (target === modeRef.current) return;
    prevModeRef.current = modeRef.current;
    modeRef.current = target;
    transitionRef.current = 0;
    setMode(target);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", target.toLowerCase());
    window.history.replaceState({}, "", url.toString());
  }, []);

  const cycleMode = useCallback(() => {
    const idx = MODES.indexOf(modeRef.current);
    switchMode(MODES[(idx + 1) % MODES.length]);
  }, [switchMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Tab") { e.preventDefault(); cycleMode(); }
      const num = parseInt(e.key);
      if (num >= 1 && num <= MODES.length) { e.preventDefault(); switchMode(MODES[num - 1]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleMode, switchMode]);

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
      const cx = W / 2, cy = H / 2;
      const categoryOrder = ["project", "person", "milestone", "lead", "language", "commit_keyword"];
      const categoryBuckets: Record<string, Tag[]> = {};
      for (const cat of categoryOrder) categoryBuckets[cat] = [];
      for (const tag of data.tags) {
        if (categoryBuckets[tag.category]) categoryBuckets[tag.category].push(tag);
      }

      const placed: PlacedTag[] = [];
      let globalIdx = 0;
      for (const cat of categoryOrder) {
        const bucket = categoryBuckets[cat];
        bucket.sort((a, b) => b.count - a.count);
        const catIdx = categoryOrder.indexOf(cat);
        for (let bi = 0; bi < bucket.length; bi++) {
          const tag = bucket[bi];
          const norm = tag.count / maxCount;
          const sectorAngle = (catIdx / categoryOrder.length) * Math.PI * 2 + (bi / Math.max(bucket.length, 1)) * (Math.PI * 2 / categoryOrder.length);
          const orbitR = 50 + (1 - norm) * Math.min(cx, cy) * 0.55 + bi * 7;
          placed.push({
            word: tag.word, count: tag.count, category: tag.category,
            radius: 2 + norm * 4.5,
            opacity: 0.3 + norm * 0.7,
            phase: globalIdx * 0.7 + Math.random() * 2,
            norm, catIndex: catIdx,
            angle: sectorAngle, orbitR,
            meanDate: tag.meanDate, minDate: tag.minDate, maxDate: tag.maxDate,
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

    const getPos = (tag: PlacedTag, m: VizMode, t: number, W: number, H: number): { x: number; y: number } => {
      const cx = W / 2, cy = H / 2;
      const maxR = Math.min(cx, cy) * 0.85;

      switch (m) {
        case "ORBITAL": {
          const speed = 0.06 + (1 - tag.norm) * 0.12;
          const a = tag.angle + t * speed;
          const wobble = Math.sin(t * 0.25 + tag.phase) * 3;
          return {
            x: cx + Math.cos(a) * (tag.orbitR + wobble),
            y: cy + Math.sin(a) * (tag.orbitR + wobble) * 0.6,
          };
        }
        case "HELIX": {
          const speed = 0.04 + (1 - tag.norm) * 0.08;
          const a = tag.angle + t * speed;
          const yBase = cy + Math.sin(a * 0.5 + tag.phase) * maxR * 0.35;
          const xSpread = Math.cos(a) * tag.orbitR * 0.7;
          const zDepth = Math.sin(a) * 0.5 + 0.5;
          return {
            x: cx + xSpread,
            y: yBase + Math.cos(a * 2 + tag.phase) * 20 * zDepth,
          };
        }
        case "PULSE": {
          const baseR = tag.orbitR * 0.8;
          const pulseWave = Math.sin(t * 0.3 - baseR * 0.01) * 15;
          const a = tag.angle + Math.sin(t * 0.1 + tag.phase) * 0.15;
          const r = baseR + pulseWave;
          return {
            x: cx + Math.cos(a) * r,
            y: cy + Math.sin(a) * r * 0.65,
          };
        }
        case "GALAXY": {
          const armOffset = tag.catIndex * (Math.PI * 2 / 6);
          const distFromCenter = tag.orbitR * 0.7;
          const spiralAngle = armOffset + distFromCenter * 0.012 + t * 0.03;
          const wobble = Math.sin(t * 0.2 + tag.phase) * 5;
          const spreadY = Math.sin(tag.phase * 3.7) * 12;
          return {
            x: cx + Math.cos(spiralAngle) * (distFromCenter + wobble),
            y: cy + Math.sin(spiralAngle) * (distFromCenter + wobble) * 0.45 + spreadY * Math.sin(t * 0.15 + tag.phase),
          };
        }
      }
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height, t = tRef.current;
      const tags = tagsRef.current;
      const cx = W / 2, cy = H / 2;
      const curMode = modeRef.current;

      transitionRef.current = Math.min(transitionRef.current + 0.02, 1);
      const tween = transitionRef.current;
      const eased = tween < 1 ? 1 - Math.pow(1 - tween, 3) : 1;

      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
      ctx.fillRect(0, 0, W, H);

      if (curMode === "ORBITAL" || (tween < 1 && prevModeRef.current === "ORBITAL")) {
        const alpha = curMode === "ORBITAL" ? eased : (1 - eased);
        ctx.globalAlpha = alpha * 0.06;
        ctx.strokeStyle = "rgba(220, 40, 40, 1)";
        ctx.lineWidth = 0.5;
        const maxR = Math.min(cx, cy) * 0.85;
        for (let r = 50; r < maxR; r += 35) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (curMode === "PULSE" || (tween < 1 && prevModeRef.current === "PULSE")) {
        const alpha = curMode === "PULSE" ? eased : (1 - eased);
        ctx.globalAlpha = alpha * 0.04;
        ctx.strokeStyle = "rgba(220, 40, 40, 1)";
        ctx.lineWidth = 0.5;
        const maxR = Math.min(cx, cy) * 0.85;
        for (let r = 30; r < maxR; r += 25) {
          const pulseR = r + Math.sin(t * 0.3 - r * 0.01) * 15;
          ctx.beginPath();
          ctx.ellipse(cx, cy, pulseR, pulseR * 0.65, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (curMode === "GALAXY" || (tween < 1 && prevModeRef.current === "GALAXY")) {
        const alpha = curMode === "GALAXY" ? eased : (1 - eased);
        ctx.globalAlpha = alpha * 0.03;
        ctx.strokeStyle = "rgba(220, 40, 40, 1)";
        ctx.lineWidth = 0.3;
        for (let arm = 0; arm < 6; arm++) {
          ctx.beginPath();
          const armOff = arm * (Math.PI * 2 / 6);
          for (let d = 10; d < Math.min(cx, cy) * 0.7; d += 2) {
            const angle = armOff + d * 0.012 + t * 0.03;
            const px = cx + Math.cos(angle) * d;
            const py = cy + Math.sin(angle) * d * 0.45;
            if (d === 10) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (curMode === "HELIX" || (tween < 1 && prevModeRef.current === "HELIX")) {
        const alpha = curMode === "HELIX" ? eased : (1 - eased);
        ctx.globalAlpha = alpha * 0.05;
        ctx.strokeStyle = "rgba(220, 40, 40, 1)";
        ctx.lineWidth = 0.5;
        const maxR = Math.min(cx, cy) * 0.85;
        for (const strand of [0, Math.PI]) {
          ctx.beginPath();
          for (let xx = -maxR; xx < maxR; xx += 3) {
            const a = (xx / maxR) * Math.PI * 3 + t * 0.04 + strand;
            const yy = cy + Math.sin(a) * maxR * 0.35;
            const px = cx + xx;
            if (xx === -maxR) ctx.moveTo(px, yy); else ctx.lineTo(px, yy);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = hexToRgba(CATEGORY_COLORS.project, 0.5);
      ctx.shadowColor = CATEGORY_COLORS.project;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      const mx = mouseRef.current.x, my = mouseRef.current.y;
      let hovered: PlacedTag | null = null;
      let hoveredDist = Infinity;
      const positions: { tag: PlacedTag; px: number; py: number }[] = [];

      for (const tag of tags) {
        let pos: { x: number; y: number };
        if (tween < 1) {
          const from = getPos(tag, prevModeRef.current, t, W, H);
          const to = getPos(tag, curMode, t, W, H);
          pos = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
        } else {
          pos = getPos(tag, curMode, t, W, H);
        }
        positions.push({ tag, px: pos.x, py: pos.y });
      }

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i], b = positions[j];
          if (a.tag.category !== b.tag.category) continue;
          const dx = a.px - b.px, dy = a.py - b.py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 60) {
            const la = (1 - dist / 60) * 0.06;
            ctx.strokeStyle = hexToRgba(CATEGORY_COLORS[a.tag.category] || "#ffffff", la);
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(b.px, b.py);
            ctx.stroke();
          }
        }
      }

      for (const { tag, px, py } of positions) {
        const color = CATEGORY_COLORS_DIM[tag.category] || "rgba(255,255,255,0.3)";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, tag.radius, 0, Math.PI * 2);
        ctx.fill();

        if (mx > 0) {
          const dx = px - mx, dy = py - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < Math.max(tag.radius + 20, 28) && dist < hoveredDist) {
            hovered = tag;
            hoveredDist = dist;
          }
        }
      }

      if (hovered) {
        const hp = positions.find(p => p.tag === hovered)!;
        const fullColor = CATEGORY_COLORS[hovered.category] || "#ffffff";

        ctx.shadowColor = fullColor;
        ctx.shadowBlur = 14;
        ctx.fillStyle = fullColor;
        ctx.beginPath();
        ctx.arc(hp.px, hp.py, hovered.radius + 2.5, 0, Math.PI * 2);
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

        const tooltipW = 240;
        const tooltipH = 56;
        let tx = hp.px - tooltipW / 2;
        let ty = aboveCenter ? labelY - 16 - tooltipH : labelY + 16;
        tx = Math.max(10, Math.min(W - tooltipW - 10, tx));
        ty = Math.max(10, Math.min(H - tooltipH - 10, ty));

        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.strokeStyle = hexToRgba(fullColor, 0.25);
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
          ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
          ctx.fillText(dateInfo, tx + 10, ty + 28);
        }
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(data.title, 20, 16);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillText(data.subtitle, 20, 34);

      const legendY = 54;
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
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.textAlign = "left";
        ctx.fillText(lc.label, lx + 12, legendY);
        lx += ctx.measureText(lc.label).width + 22;
      }

      const modeBarY = H - 38;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      const btnW = 90;
      const totalBtnW = MODES.length * btnW;
      const startX = cx - totalBtnW / 2;
      for (let i = 0; i < MODES.length; i++) {
        const bx = startX + i * btnW + btnW / 2;
        const isActive = MODES[i] === curMode;
        if (isActive) {
          ctx.fillStyle = "rgba(220, 40, 40, 0.12)";
          ctx.beginPath();
          ctx.roundRect(bx - 38, modeBarY - 10, 76, 20, 3);
          ctx.fill();
          ctx.strokeStyle = "rgba(220, 40, 40, 0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.fillStyle = isActive ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.2)";
        ctx.textBaseline = "middle";
        ctx.fillText(`${i + 1} ${MODES[i]}`, bx, modeBarY);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("1-4 or SPACE to switch · hover for details", cx, H - 12);

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
    const cxC = W / 2;
    const modeBarY = H - 38;
    const btnW = 90;
    const totalBtnW = MODES.length * btnW;
    const startX = cxC - totalBtnW / 2;

    for (let i = 0; i < MODES.length; i++) {
      const bx = startX + i * btnW + btnW / 2;
      if (clickX >= bx - 38 && clickX <= bx + 38 && clickY >= modeBarY - 10 && clickY <= modeBarY + 10) {
        switchMode(MODES[i]);
        return;
      }
    }
  }, [switchMode]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "crosshair" }} data-testid="viz-research-container">
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="viz-research-canvas" onClick={handleCanvasClick} />
      <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.1)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3 }}>
        CIMC RESEARCH
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch } from "wouter";

interface Tag {
  word: string;
  count: number;
  category: string;
  minDate: number | null;
  maxDate: number | null;
  meanDate: number | null;
  description: string | null;
  stars?: number;
  forks?: number;
  activityCount?: number;
  repoUrl?: string;
  homepage?: string;
  activityLevel?: number;
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
  description: string | null;
  stars?: number;
  forks?: number;
  activityCount?: number;
  repoUrl?: string;
  homepage?: string;
  activityLevel?: number;
}

interface ColorTheme {
  name: string;
  key: string;
  bg: string;
  categories: Record<string, string>;
  categoriesDim: Record<string, string>;
  armStroke: string;
  centerGlow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentDim: string;
  tooltipBg: string;
}

const THEMES: ColorTheme[] = [
  {
    name: "INFRARED",
    key: "infrared",
    bg: "rgba(0, 0, 0, 0.82)",
    categories: {
      project: "#dc2828",
      person: "#ffffff",
      milestone: "#999999",
      lead: "#dc5050",
      language: "#50c8ff",
      commit_keyword: "#b4ff78",
      repo: "#ffaa22",
    },
    categoriesDim: {
      project: "rgba(220, 40, 40, 0.55)",
      person: "rgba(255, 255, 255, 0.3)",
      milestone: "rgba(153, 153, 153, 0.3)",
      lead: "rgba(220, 80, 80, 0.35)",
      language: "rgba(80, 200, 255, 0.45)",
      commit_keyword: "rgba(180, 255, 120, 0.4)",
      repo: "rgba(255, 170, 34, 0.5)",
    },
    armStroke: "rgba(220, 40, 40, 1)",
    centerGlow: "#dc2828",
    textPrimary: "rgba(255, 255, 255, 0.18)",
    textSecondary: "rgba(255, 255, 255, 0.1)",
    textMuted: "rgba(255, 255, 255, 0.06)",
    accent: "rgba(220, 40, 40, 0.35)",
    accentDim: "rgba(220, 40, 40, 0.12)",
    tooltipBg: "rgba(0, 0, 0, 0.92)",
  },
  {
    name: "GREYSCALE",
    key: "greyscale",
    bg: "rgba(0, 0, 0, 0.82)",
    categories: {
      project: "#e0e0e0",
      person: "#b0b0b0",
      milestone: "#707070",
      lead: "#c8c8c8",
      language: "#909090",
      commit_keyword: "#d8d8d8",
      repo: "#aaaaaa",
    },
    categoriesDim: {
      project: "rgba(224, 224, 224, 0.45)",
      person: "rgba(176, 176, 176, 0.3)",
      milestone: "rgba(112, 112, 112, 0.25)",
      lead: "rgba(200, 200, 200, 0.3)",
      language: "rgba(144, 144, 144, 0.3)",
      commit_keyword: "rgba(216, 216, 216, 0.35)",
      repo: "rgba(170, 170, 170, 0.4)",
    },
    armStroke: "rgba(180, 180, 180, 1)",
    centerGlow: "#cccccc",
    textPrimary: "rgba(255, 255, 255, 0.2)",
    textSecondary: "rgba(255, 255, 255, 0.1)",
    textMuted: "rgba(255, 255, 255, 0.06)",
    accent: "rgba(180, 180, 180, 0.35)",
    accentDim: "rgba(180, 180, 180, 0.12)",
    tooltipBg: "rgba(10, 10, 10, 0.94)",
  },
  {
    name: "EMBER",
    key: "ember",
    bg: "rgba(8, 2, 0, 0.82)",
    categories: {
      project: "#ff4422",
      person: "#ff9966",
      milestone: "#cc6644",
      lead: "#ff6644",
      language: "#ffaa77",
      commit_keyword: "#ffcc88",
      repo: "#ff8833",
    },
    categoriesDim: {
      project: "rgba(255, 68, 34, 0.5)",
      person: "rgba(255, 153, 102, 0.35)",
      milestone: "rgba(204, 102, 68, 0.3)",
      lead: "rgba(255, 102, 68, 0.35)",
      language: "rgba(255, 170, 119, 0.35)",
      commit_keyword: "rgba(255, 204, 136, 0.35)",
      repo: "rgba(255, 136, 51, 0.45)",
    },
    armStroke: "rgba(255, 80, 30, 1)",
    centerGlow: "#ff4422",
    textPrimary: "rgba(255, 200, 160, 0.2)",
    textSecondary: "rgba(255, 180, 140, 0.12)",
    textMuted: "rgba(255, 160, 120, 0.06)",
    accent: "rgba(255, 80, 30, 0.35)",
    accentDim: "rgba(255, 80, 30, 0.12)",
    tooltipBg: "rgba(15, 5, 0, 0.94)",
  },
  {
    name: "FROST",
    key: "frost",
    bg: "rgba(0, 2, 8, 0.82)",
    categories: {
      project: "#ffffff",
      person: "#c0d8ff",
      milestone: "#8899bb",
      lead: "#ddeeff",
      language: "#aabbdd",
      commit_keyword: "#eef4ff",
      repo: "#88aadd",
    },
    categoriesDim: {
      project: "rgba(255, 255, 255, 0.45)",
      person: "rgba(192, 216, 255, 0.3)",
      milestone: "rgba(136, 153, 187, 0.25)",
      lead: "rgba(221, 238, 255, 0.3)",
      language: "rgba(170, 187, 221, 0.3)",
      commit_keyword: "rgba(238, 244, 255, 0.35)",
      repo: "rgba(136, 170, 221, 0.4)",
    },
    armStroke: "rgba(200, 220, 255, 1)",
    centerGlow: "#c0d8ff",
    textPrimary: "rgba(200, 220, 255, 0.2)",
    textSecondary: "rgba(180, 200, 240, 0.1)",
    textMuted: "rgba(160, 180, 220, 0.06)",
    accent: "rgba(180, 210, 255, 0.35)",
    accentDim: "rgba(180, 210, 255, 0.12)",
    tooltipBg: "rgba(5, 8, 18, 0.94)",
  },
  {
    name: "CRIMSON",
    key: "crimson",
    bg: "rgba(5, 0, 0, 0.82)",
    categories: {
      project: "#ff1a1a",
      person: "#ff6666",
      milestone: "#aa3333",
      lead: "#ff4444",
      language: "#ff8888",
      commit_keyword: "#ffaaaa",
      repo: "#ff5555",
    },
    categoriesDim: {
      project: "rgba(255, 26, 26, 0.5)",
      person: "rgba(255, 102, 102, 0.3)",
      milestone: "rgba(170, 51, 51, 0.25)",
      lead: "rgba(255, 68, 68, 0.35)",
      language: "rgba(255, 136, 136, 0.3)",
      commit_keyword: "rgba(255, 170, 170, 0.3)",
      repo: "rgba(255, 85, 85, 0.45)",
    },
    armStroke: "rgba(255, 40, 40, 1)",
    centerGlow: "#ff2222",
    textPrimary: "rgba(255, 180, 180, 0.2)",
    textSecondary: "rgba(255, 150, 150, 0.12)",
    textMuted: "rgba(255, 120, 120, 0.06)",
    accent: "rgba(255, 40, 40, 0.35)",
    accentDim: "rgba(255, 40, 40, 0.12)",
    tooltipBg: "rgba(15, 2, 2, 0.94)",
  },
  {
    name: "AURORA",
    key: "aurora",
    bg: "rgba(0, 4, 8, 0.82)",
    categories: {
      project: "#00ffaa",
      person: "#88ffdd",
      milestone: "#44aa88",
      lead: "#66ffcc",
      language: "#22ddaa",
      commit_keyword: "#aaffee",
      repo: "#55eebb",
    },
    categoriesDim: {
      project: "rgba(0, 255, 170, 0.5)",
      person: "rgba(136, 255, 221, 0.3)",
      milestone: "rgba(68, 170, 136, 0.25)",
      lead: "rgba(102, 255, 204, 0.3)",
      language: "rgba(34, 221, 170, 0.35)",
      commit_keyword: "rgba(170, 255, 238, 0.3)",
      repo: "rgba(85, 238, 187, 0.4)",
    },
    armStroke: "rgba(0, 255, 170, 1)",
    centerGlow: "#00ffaa",
    textPrimary: "rgba(170, 255, 230, 0.2)",
    textSecondary: "rgba(140, 230, 200, 0.1)",
    textMuted: "rgba(100, 200, 170, 0.06)",
    accent: "rgba(0, 255, 170, 0.35)",
    accentDim: "rgba(0, 255, 170, 0.12)",
    tooltipBg: "rgba(2, 10, 8, 0.94)",
  },
  {
    name: "VIOLET",
    key: "violet",
    bg: "rgba(4, 0, 8, 0.82)",
    categories: {
      project: "#cc66ff",
      person: "#eeccff",
      milestone: "#8844aa",
      lead: "#dd88ff",
      language: "#aa77dd",
      commit_keyword: "#ddaaff",
      repo: "#bb66ee",
    },
    categoriesDim: {
      project: "rgba(204, 102, 255, 0.5)",
      person: "rgba(238, 204, 255, 0.3)",
      milestone: "rgba(136, 68, 170, 0.25)",
      lead: "rgba(221, 136, 255, 0.3)",
      language: "rgba(170, 119, 221, 0.35)",
      commit_keyword: "rgba(221, 170, 255, 0.3)",
      repo: "rgba(187, 102, 238, 0.4)",
    },
    armStroke: "rgba(180, 100, 255, 1)",
    centerGlow: "#bb66ff",
    textPrimary: "rgba(220, 190, 255, 0.2)",
    textSecondary: "rgba(200, 170, 240, 0.1)",
    textMuted: "rgba(180, 150, 220, 0.06)",
    accent: "rgba(180, 100, 255, 0.35)",
    accentDim: "rgba(180, 100, 255, 0.12)",
    tooltipBg: "rgba(10, 4, 18, 0.94)",
  },
  {
    name: "GOLD",
    key: "gold",
    bg: "rgba(6, 4, 0, 0.82)",
    categories: {
      project: "#ffcc00",
      person: "#ffdd66",
      milestone: "#aa8822",
      lead: "#ffdd44",
      language: "#eebb33",
      commit_keyword: "#ffee88",
      repo: "#ddaa11",
    },
    categoriesDim: {
      project: "rgba(255, 204, 0, 0.5)",
      person: "rgba(255, 221, 102, 0.3)",
      milestone: "rgba(170, 136, 34, 0.25)",
      lead: "rgba(255, 221, 68, 0.3)",
      language: "rgba(238, 187, 51, 0.35)",
      commit_keyword: "rgba(255, 238, 136, 0.3)",
      repo: "rgba(221, 170, 17, 0.45)",
    },
    armStroke: "rgba(255, 200, 40, 1)",
    centerGlow: "#ffcc00",
    textPrimary: "rgba(255, 230, 160, 0.2)",
    textSecondary: "rgba(240, 210, 140, 0.1)",
    textMuted: "rgba(220, 190, 120, 0.06)",
    accent: "rgba(255, 200, 40, 0.35)",
    accentDim: "rgba(255, 200, 40, 0.12)",
    tooltipBg: "rgba(14, 10, 2, 0.94)",
  },
  {
    name: "OCEAN",
    key: "ocean",
    bg: "rgba(0, 2, 6, 0.82)",
    categories: {
      project: "#0088ff",
      person: "#66bbff",
      milestone: "#336699",
      lead: "#44aaff",
      language: "#55ccff",
      commit_keyword: "#88ddff",
      repo: "#3399dd",
    },
    categoriesDim: {
      project: "rgba(0, 136, 255, 0.5)",
      person: "rgba(102, 187, 255, 0.3)",
      milestone: "rgba(51, 102, 153, 0.25)",
      lead: "rgba(68, 170, 255, 0.3)",
      language: "rgba(85, 204, 255, 0.35)",
      commit_keyword: "rgba(136, 221, 255, 0.3)",
      repo: "rgba(51, 153, 221, 0.4)",
    },
    armStroke: "rgba(0, 140, 255, 1)",
    centerGlow: "#0088ff",
    textPrimary: "rgba(160, 210, 255, 0.2)",
    textSecondary: "rgba(140, 190, 240, 0.1)",
    textMuted: "rgba(120, 170, 220, 0.06)",
    accent: "rgba(0, 140, 255, 0.35)",
    accentDim: "rgba(0, 140, 255, 0.12)",
    tooltipBg: "rgba(2, 6, 16, 0.94)",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  project: "projects",
  person: "people",
  milestone: "milestones",
  lead: "leads",
  language: "languages",
  commit_keyword: "keywords",
  repo: "repos",
};

const CATEGORY_ORDER = ["project", "person", "milestone", "lead", "language", "commit_keyword", "repo"];

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

function parseThemeFromSearch(search: string): number {
  const params = new URLSearchParams(search);
  const t = (params.get("theme") || "").toLowerCase();
  const idx = THEMES.findIndex(th => th.key === t);
  const crimsonIdx = THEMES.findIndex(th => th.key === "crimson");
  return idx >= 0 ? idx : (crimsonIdx >= 0 ? crimsonIdx : 0);
}

function parseZoomFromSearch(search: string): number {
  const params = new URLSearchParams(search);
  const z = parseFloat(params.get("zoom") || "");
  if (isFinite(z) && z >= 0.3 && z <= 5) return z;
  return 1;
}

function parseEmbedFromSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("embed") === "true" || params.get("embed") === "1";
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

export default function VizResearch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<VizData | null>(null);
  const search = useSearch();
  const initialTheme = parseThemeFromSearch(search);
  const initialZoom = parseZoomFromSearch(search);
  const isEmbed = parseEmbedFromSearch(search);
  const embedRef = useRef(isEmbed);
  const [themeIdx, setThemeIdx] = useState(initialTheme);
  const animRef = useRef(0);
  const tRef = useRef(0);
  const tagsRef = useRef<PlacedTag[]>([]);
  const mouseRef = useRef({ x: -1, y: -1 });
  const themeRef = useRef(initialTheme);
  const zoomRef = useRef(initialZoom);
  const zoomTargetRef = useRef(initialZoom);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });
  const lastMouseMoveRef = useRef<number>(Date.now());
  const autoCycleIdxRef = useRef<number>(0);
  const lastCycleRef = useRef<number>(Date.now());
  const previewRef = useRef<{ url: string; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ url: string; x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/api/viz/research").then(r => r.json()).then(setData).catch(console.error);
  }, []);

  // Sync the canvas-driven website preview into React state at ~10fps
  useEffect(() => {
    const id = setInterval(() => {
      const p = previewRef.current;
      setPreview(prev => {
        if (!p && !prev) return prev;
        if (!p) return null;
        if (prev && prev.url === p.url && Math.abs(prev.x - p.x) < 2 && Math.abs(prev.y - p.y) < 2) return prev;
        return { ...p };
      });
    }, 120);
    return () => clearInterval(id);
  }, []);

  const updateUrl = useCallback((tIdx: number, zoom: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("theme", THEMES[tIdx].key);
    if (Math.abs(zoom - 1) > 0.05) {
      url.searchParams.set("zoom", zoom.toFixed(2));
    } else {
      url.searchParams.delete("zoom");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  const switchTheme = useCallback((idx: number) => {
    themeRef.current = idx;
    setThemeIdx(idx);
    updateUrl(idx, zoomTargetRef.current);
  }, [updateUrl]);

  const cycleTheme = useCallback(() => {
    switchTheme((themeRef.current + 1) % THEMES.length);
  }, [switchTheme]);

  const setZoomLevel = useCallback((z: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    zoomTargetRef.current = clamped;
    updateUrl(themeRef.current, clamped);
  }, [updateUrl]);

  useEffect(() => {
    if (embedRef.current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Tab") { e.preventDefault(); cycleTheme(); }
      const num = parseInt(e.key);
      if (num >= 1 && num <= THEMES.length) { e.preventDefault(); switchTheme(num - 1); }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoomLevel(zoomTargetRef.current * 1.25); }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoomLevel(zoomTargetRef.current / 1.25); }
      if (e.key === "0") { e.preventDefault(); setZoomLevel(1); panRef.current = { x: 0, y: 0 }; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleTheme, switchTheme, setZoomLevel]);

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
      const categoryBuckets: Record<string, Tag[]> = {};
      for (const cat of CATEGORY_ORDER) categoryBuckets[cat] = [];
      for (const tag of data.tags) {
        if (categoryBuckets[tag.category]) categoryBuckets[tag.category].push(tag);
      }

      const placed: PlacedTag[] = [];
      let globalIdx = 0;
      for (const cat of CATEGORY_ORDER) {
        const bucket = categoryBuckets[cat];
        bucket.sort((a, b) => b.count - a.count);
        const catIdx = CATEGORY_ORDER.indexOf(cat);
        for (let bi = 0; bi < bucket.length; bi++) {
          const tag = bucket[bi];
          const norm = tag.count / maxCount;
          const sectorAngle = (catIdx / CATEGORY_ORDER.length) * Math.PI * 2 + (bi / Math.max(bucket.length, 1)) * (Math.PI * 2 / CATEGORY_ORDER.length);
          const orbitR = 50 + (1 - norm) * Math.min(cx, cy) * 0.55 + bi * 7;
          placed.push({
            word: tag.word, count: tag.count, category: tag.category,
            radius: 2 + norm * 4.5,
            opacity: 0.3 + norm * 0.7,
            phase: globalIdx * 0.7 + Math.sin(globalIdx * 1.337) * 2,
            norm, catIndex: catIdx,
            angle: sectorAngle, orbitR,
            meanDate: tag.meanDate, minDate: tag.minDate, maxDate: tag.maxDate, description: tag.description,
            stars: tag.stars, forks: tag.forks, activityCount: tag.activityCount,
            repoUrl: tag.repoUrl, homepage: tag.homepage, activityLevel: tag.activityLevel,
          });
          globalIdx++;
        }
      }
      tagsRef.current = placed;
    };

    resize();
    window.addEventListener("resize", resize);

    // Track mousedown pos to distinguish click from drag
    const mouseDownPos = { x: 0, y: 0 };

    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      lastMouseMoveRef.current = Date.now();
      if (dragRef.current.dragging) {
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        panRef.current.x += dx;
        panRef.current.y += dy;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
      }
    };
    const onLeave = () => {
      mouseRef.current = { x: -1, y: -1 };
      dragRef.current.dragging = false;
      canvas.style.cursor = "default";
    };
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseDownPos.x = e.clientX;
        mouseDownPos.y = e.clientY;
        dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      }
    };
    const onUp = (e: MouseEvent) => {
      dragRef.current.dragging = false;
      // Treat as a click if mouse barely moved (< 5px)
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) {
        // Find the hovered tag at click position
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const W = canvas.width, H = canvas.height;
        const cx = W / 2, cy = H / 2;
        const zoom = zoomRef.current;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        const worldX = (canvasX - cx - panRef.current.x) / zoom + cx;
        const worldY = (canvasY - cy - panRef.current.y) / zoom + cy;
        const tags = tagsRef.current;
        const positions = tags.map(t => ({ tag: t, ...getPos(t, tRef.current, W, H) }));
        let clicked: PlacedTag | null = null;
        let closestDist = Infinity;
        for (const p of positions) {
          const dist = Math.sqrt((worldX - p.x) ** 2 + (worldY - p.y) ** 2);
          const hitR = Math.max(p.tag.radius + 6, 12);
          if (dist < hitR && dist < closestDist) {
            clicked = p.tag;
            closestDist = dist;
          }
        }
        if (clicked?.category === "repo" && clicked.repoUrl) {
          window.open(`https://github.com/${clicked.repoUrl}`, "_blank", "noopener,noreferrer");
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomTargetRef.current * factor));
      zoomTargetRef.current = newZoom;
      updateUrl(themeRef.current, newZoom);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const getPos = (tag: PlacedTag, t: number, W: number, H: number): { x: number; y: number } => {
      const cx = W / 2, cy = H / 2;
      const armOffset = tag.catIndex * (Math.PI * 2 / 7);
      const distFromCenter = tag.orbitR * 0.7;
      const spiralAngle = armOffset + distFromCenter * 0.012 + t * 0.03;
      const wobble = Math.sin(t * 0.2 + tag.phase) * 5;
      const spreadY = Math.sin(tag.phase * 3.7) * 12;
      return {
        x: cx + Math.cos(spiralAngle) * (distFromCenter + wobble),
        y: cy + Math.sin(spiralAngle) * (distFromCenter + wobble) * 0.45 + spreadY * Math.sin(t * 0.15 + tag.phase),
      };
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height, t = tRef.current;
      const tags = tagsRef.current;
      const cx = W / 2, cy = H / 2;
      const theme = THEMES[themeRef.current];

      zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.08;
      const zoom = zoomRef.current;

      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(cx + panRef.current.x, cy + panRef.current.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);

      ctx.globalAlpha = 0.03;
      ctx.strokeStyle = theme.armStroke;
      ctx.lineWidth = 0.3;
      for (let arm = 0; arm < 7; arm++) {
        ctx.beginPath();
        const armOff = arm * (Math.PI * 2 / 7);
        for (let d = 10; d < Math.min(cx, cy) * 0.7; d += 2) {
          const angle = armOff + d * 0.012 + t * 0.03;
          const px = cx + Math.cos(angle) * d;
          const py = cy + Math.sin(angle) * d * 0.45;
          if (d === 10) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = hexToRgba(theme.centerGlow, 0.5);
      ctx.shadowColor = theme.centerGlow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const rawMx = mouseRef.current.x, rawMy = mouseRef.current.y;
      let mx = -1, my = -1;
      if (rawMx > 0) {
        const canvasX = (rawMx - rect.left) * scaleX;
        const canvasY = (rawMy - rect.top) * scaleY;
        mx = (canvasX - cx - panRef.current.x) / zoom + cx;
        my = (canvasY - cy - panRef.current.y) / zoom + cy;
      }

      let hovered: PlacedTag | null = null;
      let hoveredDist = Infinity;
      let realHover = false;
      const positions: { tag: PlacedTag; px: number; py: number }[] = [];

      for (const tag of tags) {
        const pos = getPos(tag, t, W, H);
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
            ctx.strokeStyle = hexToRgba(theme.categories[a.tag.category] || "#ffffff", la);
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(b.px, b.py);
            ctx.stroke();
          }
        }
      }

      for (const { tag, px, py } of positions) {
        const haloScore = (tag.stars || 0) + (tag.forks || 0);
        if (tag.category === "repo" && haloScore > 0) {
          const haloRadius = tag.radius + 3 + Math.min(haloScore, 15) * 1.5;
          const haloAlpha = Math.min(0.15 + haloScore * 0.05, 0.55);
          const fullColor = theme.categories[tag.category] || "#ffffff";
          const grad = ctx.createRadialGradient(px, py, tag.radius, px, py, haloRadius);
          grad.addColorStop(0, hexToRgba(fullColor, haloAlpha));
          grad.addColorStop(0.5, hexToRgba(fullColor, haloAlpha * 0.4));
          grad.addColorStop(1, hexToRgba(fullColor, 0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Animated activity halo for externally-integrated apps
        const lvl = tag.activityLevel || 0;
        if (lvl > 0) {
          const t = tRef.current;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
          const ringRadius = tag.radius + 5 + lvl * 3 + pulse * 2.5;
          const spinSpeed = lvl === 3 ? 1.4 : lvl === 2 ? 0.8 : 0.4;
          const rotation = t * spinSpeed;
          const arcLen = lvl === 3 ? Math.PI * 1.6 : lvl === 2 ? Math.PI * 1.2 : Math.PI * 0.8;
          const gap = Math.PI * 2 - arcLen;
          const alpha = 0.45 + pulse * 0.35;
          const haloColor = lvl === 3 ? "#00ffcc" : lvl === 2 ? "#7fffb2" : "#4de8a4";

          // Outer glow fill (soft radial)
          const glowR = ringRadius + 4 + lvl * 2;
          const glowGrad = ctx.createRadialGradient(px, py, ringRadius - 2, px, py, glowR);
          glowGrad.addColorStop(0, hexToRgba(haloColor, alpha * 0.5));
          glowGrad.addColorStop(1, hexToRgba(haloColor, 0));
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(px, py, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Rotating arc stroke
          ctx.save();
          ctx.strokeStyle = hexToRgba(haloColor, alpha);
          ctx.lineWidth = 1.2 + lvl * 0.4;
          ctx.shadowColor = haloColor;
          ctx.shadowBlur = 6 + lvl * 3;
          ctx.beginPath();
          ctx.arc(px, py, ringRadius, rotation, rotation + arcLen);
          ctx.stroke();
          // Counter-rotating small arc
          ctx.strokeStyle = hexToRgba(haloColor, alpha * 0.5);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(px, py, ringRadius - 3, -rotation * 0.7, -rotation * 0.7 + gap * 0.4);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();
        }

        const color = theme.categoriesDim[tag.category] || "rgba(255,255,255,0.3)";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, tag.radius, 0, Math.PI * 2);
        ctx.fill();

        if (mx > 0) {
          const dx = px - mx, dy = py - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const hitR = Math.max(tag.radius + 20 / zoom, 28 / zoom);
          if (dist < hitR && dist < hoveredDist) {
            hovered = tag;
            hoveredDist = dist;
            realHover = true;
          }
        }
      }

      // Auto-cycle screensaver: when mouse idle >4s, walk through nodes every 2.5s
      const IDLE_MS = 4000;
      const CYCLE_MS = 2500;
      const now = Date.now();
      const idle = now - lastMouseMoveRef.current > IDLE_MS;
      if (idle && tags.length > 0 && !hovered) {
        if (now - lastCycleRef.current > CYCLE_MS) {
          autoCycleIdxRef.current = (autoCycleIdxRef.current + 1) % tags.length;
          lastCycleRef.current = now;
        }
        hovered = tags[autoCycleIdxRef.current % tags.length];
      }

      // Update cursor: pointer for clickable repo nodes, default otherwise
      if (!dragRef.current.dragging) {
        canvas.style.cursor = (hovered?.category === "repo" && hovered?.repoUrl) ? "pointer" : "default";
      }

      // Website preview bridge: expose hovered repo's homepage + screen position.
      // Only on genuine pointer hover, not the idle auto-cycle screensaver.
      if (realHover && hovered && hovered.category === "repo" && hovered.homepage) {
        const hpp = positions.find(p => p.tag === hovered)!;
        const screenX = (hpp.px - cx) * zoom + cx + panRef.current.x;
        const screenY = (hpp.py - cy) * zoom + cy + panRef.current.y;
        previewRef.current = { url: hovered.homepage, x: screenX, y: screenY };
      } else {
        previewRef.current = null;
      }

      if (hovered) {
        const hp = positions.find(p => p.tag === hovered)!;
        const fullColor = theme.categories[hovered.category] || "#ffffff";

        ctx.shadowColor = fullColor;
        ctx.shadowBlur = 14;
        ctx.fillStyle = fullColor;
        ctx.beginPath();
        ctx.arc(hp.px, hp.py, hovered.radius + 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const invScale = 1 / zoom;
        const aboveCenter = hp.py < cy;
        const labelDir = aboveCenter ? -1 : 1;
        const labelY = hp.py + labelDir * (hovered.radius + 16 * invScale);

        ctx.save();
        ctx.translate(hp.px, labelY);
        ctx.scale(invScale, invScale);

        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = aboveCenter ? "bottom" : "top";
        ctx.fillStyle = fullColor;
        ctx.fillText(hovered.word, 0, 0);

        const tooltipW = 260;
        const hasDesc = hovered.description && hovered.description.length > 0;
        const isRepo = hovered.category === "repo";
        const hasRepoStats = isRepo && (hovered.stars !== undefined || hovered.forks !== undefined);
        const hasRepoUrl = isRepo && !!hovered.repoUrl;
        let tooltipLines = 2;
        if (hasDesc) tooltipLines++;
        if (hasRepoStats) tooltipLines++;
        if (hovered.meanDate || hovered.minDate) tooltipLines++;
        if (hasRepoUrl) tooltipLines++;
        const tooltipH = 16 + tooltipLines * 14;
        const tooltipDir = aboveCenter ? -1 : 1;
        const ty = tooltipDir * 16;
        const tx = -tooltipW / 2;

        ctx.fillStyle = theme.tooltipBg;
        ctx.strokeStyle = hexToRgba(fullColor, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, aboveCenter ? ty - tooltipH : ty, tooltipW, tooltipH, 4);
        ctx.fill();
        ctx.stroke();

        const tooltipTop = aboveCenter ? ty - tooltipH : ty;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = '9px "JetBrains Mono", monospace';
        let countLabel: string;
        if (isRepo) {
          const actCount = hovered.activityCount ?? hovered.count;
          countLabel = `${actCount} commits`;
        } else {
          countLabel = `${hovered.count} events`;
        }
        ctx.fillText(`${hovered.category} · ${countLabel}`, tx + 10, tooltipTop + 10);

        let nextY = tooltipTop + 28;
        if (hasDesc) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          const truncDesc = hovered.description!.length > 40 ? hovered.description!.substring(0, 40) + "…" : hovered.description!;
          ctx.fillText(truncDesc, tx + 10, nextY);
          nextY += 14;
        }

        if (hasRepoStats) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          const statsLine = `★ ${hovered.stars ?? 0} stars · ${hovered.forks ?? 0} forks`;
          ctx.fillText(statsLine, tx + 10, nextY);
          nextY += 14;
        }

        if (isRepo && hovered.minDate) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
          ctx.fillText(`created: ${formatDateShort(hovered.minDate)}`, tx + 10, nextY);
          nextY += 14;
        } else if (hovered.meanDate) {
          let dateInfo = `mean: ${formatDateShort(hovered.meanDate)}`;
          if (hovered.minDate && hovered.maxDate && hovered.minDate !== hovered.maxDate) {
            dateInfo += `  (${formatDateShort(hovered.minDate)} – ${formatDateShort(hovered.maxDate)})`;
          }
          ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
          ctx.fillText(dateInfo, tx + 10, nextY);
          nextY += 14;
        }
        if (hasRepoUrl) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillText(`↗ click to open on GitHub`, tx + 10, nextY);
        }
        ctx.restore();
      }

      ctx.restore();

      const embed = embedRef.current;

      if (!embed) {
        ctx.fillStyle = theme.textPrimary;
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(data.title, 20, 16);
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = theme.textSecondary;
        ctx.fillText(data.subtitle, 20, 34);

        const legendY = 54;
        let lx = 20;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textBaseline = "middle";
        for (const cat of CATEGORY_ORDER) {
          ctx.fillStyle = theme.categories[cat];
          ctx.beginPath();
          ctx.arc(lx + 4, legendY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
          ctx.textAlign = "left";
          const label = CATEGORY_LABELS[cat] || cat;
          ctx.fillText(label, lx + 12, legendY);
          lx += ctx.measureText(label).width + 22;
        }

        const barY = H - 38;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        const btnW = Math.min(72, (W - 40) / THEMES.length);
        const totalBtnW = THEMES.length * btnW;
        const startX = cx - totalBtnW / 2;
        for (let i = 0; i < THEMES.length; i++) {
          const bx = startX + i * btnW + btnW / 2;
          const isActive = i === themeRef.current;
          const halfW = btnW / 2 - 4;
          if (isActive) {
            ctx.fillStyle = theme.accentDim;
            ctx.beginPath();
            ctx.roundRect(bx - halfW, barY - 10, halfW * 2, 20, 3);
            ctx.fill();
            ctx.strokeStyle = theme.accent;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.fillStyle = isActive ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.2)";
          ctx.textBaseline = "middle";
          ctx.fillText(`${i + 1} ${THEMES[i].name}`, bx, barY);
        }

        const zoomPct = Math.round(zoom * 100);
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(`${zoomPct}%`, W - 20, 16);

        const zoomBtnY = 36;
        const zoomBtns = [
          { label: "+", action: 1.25 },
          { label: "−", action: 0.8 },
          { label: "⟲", action: 0 },
        ];
        for (let i = 0; i < zoomBtns.length; i++) {
          const by = zoomBtnY + i * 24;
          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          ctx.beginPath();
          ctx.roundRect(W - 36, by, 20, 18, 3);
          ctx.fill();
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(zoomBtns[i].label, W - 26, by + 9);
        }

        ctx.fillStyle = theme.textMuted;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("1-9 or SPACE to switch theme · scroll to zoom · drag to pan · 0 to reset", cx, H - 12);
      }

      tRef.current += 0.016;
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(animRef.current);
    };
  }, [data, updateUrl]);

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

    const barY = H - 38;
    const btnW = Math.min(72, (W - 40) / THEMES.length);
    const totalBtnW = THEMES.length * btnW;
    const startX = cxC - totalBtnW / 2;
    for (let i = 0; i < THEMES.length; i++) {
      const bx = startX + i * btnW + btnW / 2;
      const halfW = btnW / 2 - 4;
      if (clickX >= bx - halfW && clickX <= bx + halfW && clickY >= barY - 10 && clickY <= barY + 10) {
        switchTheme(i);
        return;
      }
    }

    const zoomBtnY = 36;
    for (let i = 0; i < 3; i++) {
      const by = zoomBtnY + i * 24;
      if (clickX >= W - 36 && clickX <= W - 16 && clickY >= by && clickY <= by + 18) {
        if (i === 0) setZoomLevel(zoomTargetRef.current * 1.25);
        else if (i === 1) setZoomLevel(zoomTargetRef.current * 0.8);
        else { setZoomLevel(1); panRef.current = { x: 0, y: 0 }; }
        return;
      }
    }
  }, [switchTheme, setZoomLevel]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: dragRef.current?.dragging ? "grabbing" : "crosshair" }} data-testid="viz-research-container">
      <canvas ref={canvasRef} style={{ display: "block" }} data-testid="viz-research-canvas" onClick={isEmbed ? undefined : handleCanvasClick} />
      {preview && (() => {
        const PW = 280, PH = 175;
        const margin = 16;
        let left = preview.x + 24;
        let top = preview.y - PH / 2;
        if (typeof window !== "undefined") {
          if (left + PW + margin > window.innerWidth) left = preview.x - PW - 24;
          if (left < margin) left = margin;
          top = Math.max(margin, Math.min(top, window.innerHeight - PH - margin));
        }
        const fullUrl = /^https?:\/\//i.test(preview.url) ? preview.url : `https://${preview.url}`;
        let host = fullUrl;
        try { host = new URL(fullUrl).host; } catch {}
        const shot = `https://api.microlink.io/?url=${encodeURIComponent(fullUrl)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800`;
        return (
          <div
            data-testid="website-preview"
            style={{
              position: "absolute", left, top, width: PW, pointerEvents: "none",
              background: "rgba(0,0,0,0.92)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6, overflow: "hidden", boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
              fontFamily: "'JetBrains Mono', monospace", zIndex: 50,
            }}
          >
            <div style={{ width: PW, height: PH, background: "#0a0a0a", position: "relative" }}>
              <img
                src={shot}
                alt={host}
                width={PW}
                height={PH}
                style={{ width: PW, height: PH, objectFit: "cover", display: "block" }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
              />
            </div>
            <div style={{ padding: "6px 10px", fontSize: 10, color: "rgba(255,255,255,0.75)", borderTop: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              ↗ {host}
            </div>
          </div>
        );
      })()}
      {!isEmbed && (
        <div style={{ position: "absolute", bottom: 16, right: 16, color: "rgba(255,255,255,0.1)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3 }}>
          CIMC RESEARCH
        </div>
      )}
    </div>
  );
}

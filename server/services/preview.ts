import { storage } from "../storage";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";

const objectStorage = new ObjectStorageService();

const STALE_MS = 1000 * 60 * 60 * 24 * 30; // re-capture sites older than 30 days
const FETCH_TIMEOUT_MS = 25000; // abort screenshot fetch if microlink hangs
const UPLOAD_TIMEOUT_MS = 30000; // abort object upload if it hangs

// Single-flight lock: only one capture run at a time across startup + manual triggers.
let capturing = false;

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Fetch a single screenshot from microlink and return raw image bytes.
async function fetchScreenshot(homepage: string): Promise<Buffer | null> {
  const fullUrl = normalizeUrl(homepage);
  const api = `https://api.microlink.io/?url=${encodeURIComponent(fullUrl)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800`;
  try {
    const res = await fetchWithTimeout(api, { headers: { Accept: "image/*" } }, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      console.error(`[preview] screenshot fetch failed for ${fullUrl}: ${res.status}`);
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 100) {
      console.error(`[preview] screenshot too small for ${fullUrl} (${buf.length} bytes)`);
      return null;
    }
    return buf;
  } catch (err) {
    console.error(`[preview] screenshot error for ${fullUrl}:`, err);
    return null;
  }
}

// Upload image bytes to object storage and return a public /objects/... path.
async function storeImage(bytes: Buffer): Promise<string> {
  const uploadUrl = await objectStorage.getObjectEntityUploadURL();
  const put = await fetchWithTimeout(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  }, UPLOAD_TIMEOUT_MS);
  if (!put.ok) {
    throw new Error(`object upload failed: ${put.status}`);
  }
  // Make the screenshot publicly readable and get the normalized /objects/ path.
  const objectPath = await objectStorage.trySetObjectEntityAclPolicy(uploadUrl, {
    owner: "system",
    visibility: "public",
  });
  return objectPath;
}

export interface CaptureResult {
  captured: number;
  skipped: number;
  failed: number;
}

/**
 * Capture website screenshots for active repositories that have a homepage.
 * Each site is fetched once and stored in object storage; repeat runs only
 * re-capture missing or stale (>30d) previews unless `force` is set.
 */
export async function capturePreviews(opts: { force?: boolean } = {}): Promise<CaptureResult> {
  const { force = false } = opts;

  if (capturing) {
    console.log("[preview] capture already running, skipping this trigger");
    return { captured: 0, skipped: 0, failed: 0 };
  }
  capturing = true;

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const repos = await storage.getRepositories();
    const now = Date.now();

    for (const repo of repos) {
      if (!repo.isActive || !repo.homepage) continue;

      const fresh =
        !force &&
        repo.previewImage &&
        repo.previewCapturedAt &&
        now - new Date(repo.previewCapturedAt).getTime() < STALE_MS;
      if (fresh) {
        skipped++;
        continue;
      }

      const bytes = await fetchScreenshot(repo.homepage);
      if (!bytes) {
        failed++;
        continue;
      }

      try {
        const objectPath = await storeImage(bytes);
        await storage.updateRepository(repo.id, {
          previewImage: objectPath,
          previewCapturedAt: new Date(),
        });
        captured++;
        console.log(`[preview] captured ${repo.name} -> ${objectPath}`);
      } catch (err) {
        console.error(`[preview] store failed for ${repo.name}:`, err);
        failed++;
      }
    }
  } finally {
    capturing = false;
  }

  console.log(`[preview] done: ${captured} captured, ${skipped} skipped, ${failed} failed`);
  return { captured, skipped, failed };
}

/* Client-side stitcher: composes the whole wall into one PNG.
 * Published tiles render their art; everything else renders as clean paper —
 * the artwork-in-progress look Mickey reviews on the admin page, and the
 * downloadable artwork everyone gets at the finale.
 * Browser-safe resolutions: 384px/tile → 9216² (≈85M px). The true print-res
 * stitch for the physical canvas is an offline job, not a browser one. */

const PAPER = "#f4eee2";

export type StitchTile = { x: number; y: number; img: string | null }; // full PNG URL or founder hex

export async function stitchWall(
  tiles: StitchTile[], cols: number, rows: number, tilePx: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = cols * tilePx; cv.height = rows * tilePx;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.fillStyle = PAPER; g.fillRect(0, 0, cv.width, cv.height);

  const painted = tiles.filter((t) => t.img);
  let done = 0;
  const CONCURRENCY = 12;
  let i = 0;
  const worker = async () => {
    while (i < painted.length) {
      const t = painted[i++];
      const X = t.x * tilePx, Y = t.y * tilePx;
      if (t.img!.startsWith("#")) { g.fillStyle = t.img!; g.fillRect(X, Y, tilePx, tilePx); }
      else {
        await new Promise<void>((resolve) => {
          const im = new Image();
          im.crossOrigin = "anonymous"; // keeps the canvas exportable
          im.onload = () => { g.drawImage(im, X, Y, tilePx, tilePx); resolve(); };
          im.onerror = () => resolve(); // missing image stays paper
          im.src = t.img!;
        });
      }
      done += 1; onProgress?.(done, painted.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, painted.length)) }, worker));

  return await new Promise<Blob>((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("couldn't export the stitched canvas"))), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(u);
}

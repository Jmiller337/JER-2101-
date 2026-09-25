/**
 * Pure frame analysis for framing guidance (PROMPT.md 6.2). Everything works on a small
 * grayscale copy of a video frame (about 160 pixels wide) and is written as plain functions over
 * pixel arrays so it can be unit tested with synthetic frames. These are heuristics: simple and
 * predictable beats clever, and the reading model tolerates imperfect framing.
 */

export interface PixelFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Luma {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Box {
  x0: number;
  y0: number;
  /** Inclusive right and bottom edges. */
  x1: number;
  y1: number;
}

/** A point in frame pixels (0 to width, 0 to height). */
export interface Point {
  x: number;
  y: number;
}

/** The page's outline: four corners in clockwise order on screen, in frame pixels. */
export type Quad = [Point, Point, Point, Point];

export interface Edges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export interface PageEstimate {
  found: boolean;
  box: Box | null;
  /** The page's corners, which follow a tilted or skewed page; the box is its upright bounds. */
  quad: Quad | null;
  /** Page box area as a fraction of the frame. */
  coverage: number;
  touches: Edges;
  strategy: "bright" | "edges" | "none";
}

export interface FrameAnalysis {
  luma: Luma;
  frameMean: number;
  page: PageEstimate;
  /** Mean brightness inside the page box (or of the frame when no page is found). */
  pageMean: number;
  /** Fraction of page pixels that are blown-out highlights. */
  glare: number;
  /** Laplacian variance inside the page box: higher is sharper. */
  sharpness: number;
  /** Laplacian variance of the central region, used to compare the still with the preview. */
  centerSharpness: number;
  /** Mean absolute difference from the previous frame (0 when there is none). */
  motion: number;
}

const NO_EDGES: Edges = { left: false, right: false, top: false, bottom: false };

export function toLuma(frame: PixelFrame): Luma {
  const { data, width, height } = frame;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
  }
  return { data: out, width, height };
}

export function mean(values: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  return values.length ? sum / values.length : 0;
}

/** Otsu's threshold over a 256-bin histogram, with the two class means. */
export function otsu(values: Uint8Array): { threshold: number; lowMean: number; highMean: number } {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i++) hist[values[i]!]! += 1;
  const total = values.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]!;
  let sumLow = 0;
  let weightLow = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightLow += hist[t]!;
    if (weightLow === 0) continue;
    const weightHigh = total - weightLow;
    if (weightHigh === 0) break;
    sumLow += t * hist[t]!;
    const meanLow = sumLow / weightLow;
    const meanHigh = (sumAll - sumLow) / weightHigh;
    const between = weightLow * weightHigh * (meanLow - meanHigh) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  let lowSum = 0;
  let lowCount = 0;
  let highSum = 0;
  let highCount = 0;
  for (let t = 0; t < 256; t++) {
    if (t <= threshold) {
      lowSum += t * hist[t]!;
      lowCount += hist[t]!;
    } else {
      highSum += t * hist[t]!;
      highCount += hist[t]!;
    }
  }
  return {
    threshold,
    lowMean: lowCount ? lowSum / lowCount : 0,
    highMean: highCount ? highSum / highCount : 0,
  };
}

/**
 * Fills the holes in a binary mask: every unset region that does not reach the frame's border
 * becomes set. The lines of text on a page leave dark holes in its bright region, which would
 * otherwise split a tilted page into pieces.
 */
export function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = Uint8Array.from(mask);
  const outside = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let top = 0;
  const push = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < mask.length - width) push(i + width);
  }
  for (let i = 0; i < out.length; i++) if (!outside[i]) out[i] = 1;
  return out;
}

/** 3 by 3 erosion of a binary mask (1 = set). Removes specks and thin bright lines. */
export function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (
        mask[i] &&
        mask[i - 1] &&
        mask[i + 1] &&
        mask[i - width] &&
        mask[i + width] &&
        mask[i - width - 1] &&
        mask[i - width + 1] &&
        mask[i + width - 1] &&
        mask[i + width + 1]
      ) {
        out[i] = 1;
      }
    }
  }
  // Keep the border pixels of the mask so a page running off the frame still touches the edge.
  for (let x = 0; x < width; x++) {
    out[x] = mask[x]! & mask[x + width]!;
    out[(height - 1) * width + x] = mask[(height - 1) * width + x]! & mask[(height - 2) * width + x]!;
  }
  for (let y = 0; y < height; y++) {
    out[y * width] = mask[y * width]! & mask[y * width + 1]!;
    out[y * width + width - 1] = mask[y * width + width - 1]! & mask[y * width + width - 2]!;
  }
  return out;
}

export interface Component {
  area: number;
  box: Box;
  quad: Quad;
}

export function quadArea(quad: Quad): number {
  let twice = 0;
  for (let k = 0; k < 4; k++) {
    const a = quad[k]!;
    const b = quad[(k + 1) % 4]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * The corners of a roughly four-sided blob from its extreme pixels. Extremes along the
 * diagonals (x + y and x - y) are the corners of a page that is upright or tilted by less than
 * 45 degrees; extremes along the axes are the corners of a page turned further. The larger of
 * the two outlines is the right one. The eroded mask lost one pixel all round, so the corners
 * move out by one pixel, and each corner sits on the outer edge of its pixel.
 */
function cornersOf(width: number, height: number, at: Int32Array): Quad {
  const px = (i: number) => i % width;
  const py = (i: number) => Math.floor(i / width);
  const clamp = (p: Point): Point => ({ x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) });
  // The pixel indices of the extremes, in the order largestComponent records them.
  const [minX, maxX, minY, maxY, minSum, maxSum, minDiff, maxDiff] = at;
  const diagonal: Quad = [
    clamp({ x: px(minSum!) - 1, y: py(minSum!) - 1 }),
    clamp({ x: px(maxDiff!) + 2, y: py(maxDiff!) - 1 }),
    clamp({ x: px(maxSum!) + 2, y: py(maxSum!) + 2 }),
    clamp({ x: px(minDiff!) - 1, y: py(minDiff!) + 2 }),
  ];
  const axis: Quad = [
    clamp({ x: px(minY!) + 0.5, y: py(minY!) - 1 }),
    clamp({ x: px(maxX!) + 2, y: py(maxX!) + 0.5 }),
    clamp({ x: px(maxY!) + 0.5, y: py(maxY!) + 2 }),
    clamp({ x: px(minX!) - 1, y: py(minX!) + 0.5 }),
  ];
  return quadArea(axis) > quadArea(diagonal) * 1.05 ? axis : diagonal;
}

/** The corners of an upright box, in frame pixels. */
export function boxQuad(box: Box): Quad {
  return [
    { x: box.x0, y: box.y0 },
    { x: box.x1 + 1, y: box.y0 },
    { x: box.x1 + 1, y: box.y1 + 1 },
    { x: box.x0, y: box.y1 + 1 },
  ];
}

/** The largest 4-connected component of a binary mask, with its bounding box and corners. */
export function largestComponent(mask: Uint8Array, width: number, height: number): Component | null {
  const labels = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best: Component | null = null;
  let label = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    label += 1;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let minSum = Infinity;
    let maxSum = -Infinity;
    let minDiff = Infinity;
    let maxDiff = -Infinity;
    const at = new Int32Array(8);
    while (top > 0) {
      const i = stack[--top]!;
      area += 1;
      const x = i % width;
      const y = (i - x) / width;
      if (x < x0) {
        x0 = x;
        at[0] = i;
      }
      if (x > x1) {
        x1 = x;
        at[1] = i;
      }
      if (y < y0) {
        y0 = y;
        at[2] = i;
      }
      if (y > y1) {
        y1 = y;
        at[3] = i;
      }
      if (x + y < minSum) {
        minSum = x + y;
        at[4] = i;
      }
      if (x + y > maxSum) {
        maxSum = x + y;
        at[5] = i;
      }
      if (x - y < minDiff) {
        minDiff = x - y;
        at[6] = i;
      }
      if (x - y > maxDiff) {
        maxDiff = x - y;
        at[7] = i;
      }
      if (x > 0 && mask[i - 1] && !labels[i - 1]) {
        labels[i - 1] = label;
        stack[top++] = i - 1;
      }
      if (x < width - 1 && mask[i + 1] && !labels[i + 1]) {
        labels[i + 1] = label;
        stack[top++] = i + 1;
      }
      if (y > 0 && mask[i - width] && !labels[i - width]) {
        labels[i - width] = label;
        stack[top++] = i - width;
      }
      if (y < height - 1 && mask[i + width] && !labels[i + width]) {
        labels[i + width] = label;
        stack[top++] = i + width;
      }
    }
    if (!best || area > best.area) best = { area, box: { x0, y0, x1, y1 }, quad: cornersOf(width, height, at) };
  }
  return best;
}

/**
 * Bounding box of "text-like" detail: pixels with a strong local gradient, with isolated noise
 * removed and the extreme 2% trimmed on each side. Used when the paper is not brighter than
 * what it lies on (a white page on a white table).
 */
export function detailBox(luma: Luma): { box: Box | null; fraction: number } {
  const { data, width, height } = luma;
  const strong = new Uint8Array(data.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = Math.abs(data[i + 1]! - data[i - 1]!);
      const gy = Math.abs(data[i + width]! - data[i - width]!);
      if (gx + gy > 60) strong[i] = 1;
    }
  }
  // Keep a strong pixel only when its 3 by 3 neighborhood has at least 3 strong pixels.
  const cols = new Float64Array(width);
  const rows = new Float64Array(height);
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!strong[i]) continue;
      const n =
        strong[i - 1]! + strong[i + 1]! + strong[i - width]! + strong[i + width]! +
        strong[i - width - 1]! + strong[i - width + 1]! + strong[i + width - 1]! + strong[i + width + 1]!;
      if (n < 2) continue;
      cols[x]! += 1;
      rows[y]! += 1;
      count += 1;
    }
  }
  const fraction = count / data.length;
  if (fraction < 0.004) return { box: null, fraction };
  const range = (hist: Float64Array): [number, number] => {
    const lowCut = count * 0.02;
    const highCut = count * 0.98;
    let acc = 0;
    let lo = 0;
    let hi = hist.length - 1;
    let loSet = false;
    for (let k = 0; k < hist.length; k++) {
      acc += hist[k]!;
      if (!loSet && acc >= lowCut) {
        lo = k;
        loSet = true;
      }
      if (acc >= highCut) {
        hi = k;
        break;
      }
    }
    return [lo, hi];
  };
  const [x0, x1] = range(cols);
  const [y0, y1] = range(rows);
  return { box: { x0, y0, x1, y1 }, fraction };
}

export function boxArea(box: Box): number {
  return (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
}

export function touchingEdges(box: Box, width: number, height: number): Edges {
  const mx = Math.max(2, Math.round(width * 0.03));
  const my = Math.max(2, Math.round(height * 0.03));
  return {
    left: box.x0 <= mx,
    right: box.x1 >= width - 1 - mx,
    top: box.y0 <= my,
    bottom: box.y1 >= height - 1 - my,
  };
}

export function countEdges(edges: Edges): number {
  return Number(edges.left) + Number(edges.right) + Number(edges.top) + Number(edges.bottom);
}

function expand(box: Box, width: number, height: number, fraction: number): Box {
  const dx = Math.round(width * fraction);
  const dy = Math.round(height * fraction);
  return {
    x0: Math.max(0, box.x0 - dx),
    y0: Math.max(0, box.y0 - dy),
    x1: Math.min(width - 1, box.x1 + dx),
    y1: Math.min(height - 1, box.y1 + dy),
  };
}

/**
 * Finds the page. First strategy: paper is usually the brightest large region, so threshold
 * (Otsu), erode, and take the largest bright blob. Fallback: the box around text-like detail.
 */
export function findPage(luma: Luma): PageEstimate {
  const { data, width, height } = luma;
  const frameArea = width * height;
  const none: PageEstimate = { found: false, box: null, quad: null, coverage: 0, touches: NO_EDGES, strategy: "none" };
  const detail = () => detailBox(luma);

  const { threshold, lowMean, highMean } = otsu(data);
  let bright: Component | null = null;
  if (highMean - lowMean >= 40 && highMean >= 90) {
    const mask = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) mask[i] = data[i]! > threshold ? 1 : 0;
    const component = largestComponent(erode(fillHoles(mask, width, height), width, height), width, height);
    if (component) {
      const fill = component.area / boxArea(component.box);
      if (component.area >= frameArea * 0.04 && fill >= 0.45) bright = component;
    }
  }

  if (bright) {
    const touches = touchingEdges(bright.box, width, height);
    const coverage = boxArea(bright.box) / frameArea;
    // A bright region filling the frame is either a page held too close or a light table
    // around a page. The text decides which.
    if (countEdges(touches) >= 3 && coverage > 0.85) {
      const text = detail().box;
      if (text) {
        const textTouches = touchingEdges(text, width, height);
        if (countEdges(textTouches) <= 1) {
          const box = expand(text, width, height, 0.05);
          return {
            found: true,
            box,
            quad: boxQuad(box),
            coverage: boxArea(box) / frameArea,
            touches: touchingEdges(box, width, height),
            strategy: "edges",
          };
        }
      }
    }
    return { found: true, box: bright.box, quad: bright.quad, coverage, touches, strategy: "bright" };
  }

  const text = detail().box;
  if (!text) return none;
  const box = expand(text, width, height, 0.05);
  const coverage = boxArea(box) / frameArea;
  if (coverage < 0.02) return none;
  return { found: true, box, quad: boxQuad(box), coverage, touches: touchingEdges(box, width, height), strategy: "edges" };
}

/** How far two boxes differ: the largest change of any edge, in pixels. */
export function boxShift(a: Box, b: Box): number {
  return Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.y0 - b.y0), Math.abs(a.x1 - b.x1), Math.abs(a.y1 - b.y1));
}

/** Mean absolute difference between two frames of the same size. */
export function frameDifference(a: Luma, b: Luma): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i]! - b.data[i]!);
  return sum / a.data.length;
}

/** Variance of the 4-neighbour Laplacian inside a box: a standard focus and blur measure. */
export function laplacianVariance(luma: Luma, box?: Box | null): number {
  const { data, width, height } = luma;
  const x0 = Math.max(1, box?.x0 ?? 1);
  const y0 = Math.max(1, box?.y0 ?? 1);
  const x1 = Math.min(width - 2, box?.x1 ?? width - 2);
  const y1 = Math.min(height - 2, box?.y1 ?? height - 2);
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      const lap = 4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - width]! - data[i + width]!;
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const m = sum / n;
  return sumSq / n - m * m;
}

export function centerBox(width: number, height: number): Box {
  return {
    x0: Math.round(width * 0.2),
    y0: Math.round(height * 0.2),
    x1: Math.round(width * 0.8),
    y1: Math.round(height * 0.8),
  };
}

function boxStats(luma: Luma, box: Box): { mean: number; glare: number; median: number } {
  const hist = new Float64Array(256);
  let n = 0;
  let sum = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const v = luma.data[y * luma.width + x]!;
      hist[v]! += 1;
      sum += v;
      n += 1;
    }
  }
  let blown = 0;
  for (let v = 250; v < 256; v++) blown += hist[v]!;
  let acc = 0;
  let median = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= n / 2) {
      median = v;
      break;
    }
  }
  const blownFraction = n ? blown / n : 0;
  // A few blown-out pixels on paper that is otherwise not blown out is glare. Paper that is
  // entirely at full brightness is overexposure, which still reads fine.
  const glare = median < 235 && blownFraction < 0.6 ? blownFraction : 0;
  return { mean: n ? sum / n : 0, glare, median };
}

export function analyzeFrame(frame: PixelFrame, previous: Luma | null): FrameAnalysis {
  const luma = toLuma(frame);
  const frameMean = mean(luma.data);
  const page = findPage(luma);
  const stats = page.box ? boxStats(luma, page.box) : { mean: frameMean, glare: 0, median: 0 };
  return {
    luma,
    frameMean,
    page,
    pageMean: stats.mean,
    glare: stats.glare,
    sharpness: laplacianVariance(luma, page.box),
    centerSharpness: laplacianVariance(luma, centerBox(luma.width, luma.height)),
    motion: previous ? frameDifference(luma, previous) : 0,
  };
}

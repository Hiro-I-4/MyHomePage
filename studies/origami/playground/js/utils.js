// utils.js - small helpers and geometry primitives (no external deps)

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function nearlyEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

export function pt(x, y) {
  return { x, y };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a, s) {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

export function len2(a) {
  return a.x * a.x + a.y * a.y;
}

export function len(a) {
  return Math.sqrt(len2(a));
}

export function dist2(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function dist(a, b) {
  return Math.sqrt(dist2(a, b));
}

export function normalize(v) {
  const l = len(v);
  if (l < 1e-12) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

export function snapPoint(p, grid) {
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid,
  };
}

export function bboxOfPoints(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function polygonArea(points) {
  // signed area, points should NOT repeat the first at end
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonCentroid(points) {
  // for non-self-intersecting polygon
  const A = polygonArea(points);
  if (Math.abs(A) < 1e-12) {
    const b = bboxOfPoints(points);
    return pt((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  cx /= (6 * A);
  cy /= (6 * A);
  return pt(cx, cy);
}

export function ensureCCW(points) {
  // returns a new array
  if (polygonArea(points) < 0) {
    return [...points].reverse();
  }
  return [...points];
}

export function ensureCW(points) {
  if (polygonArea(points) > 0) {
    return [...points].reverse();
  }
  return [...points];
}

export function pointInPolygon(p, poly) {
  // ray casting; poly is array of {x,y} no duplicate
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersect = ((a.y > p.y) !== (b.y > p.y)) &&
      (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 0.0) + a.x);
    if (intersect) inside = !inside;
  }
  return inside;
}

function orient(a, b, c) {
  return cross(sub(b, a), sub(c, a));
}

function onSegment(a, b, p, eps = 1e-9) {
  return Math.min(a.x, b.x) - eps <= p.x && p.x <= Math.max(a.x, b.x) + eps &&
         Math.min(a.y, b.y) - eps <= p.y && p.y <= Math.max(a.y, b.y) + eps &&
         Math.abs(orient(a, b, p)) <= eps;
}

export function segmentsIntersect(a, b, c, d, eps = 1e-9) {
  // proper intersection or touching
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
      ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) {
    return true;
  }

  // collinear / touching
  if (Math.abs(o1) <= eps && onSegment(a, b, c, eps)) return true;
  if (Math.abs(o2) <= eps && onSegment(a, b, d, eps)) return true;
  if (Math.abs(o3) <= eps && onSegment(c, d, a, eps)) return true;
  if (Math.abs(o4) <= eps && onSegment(c, d, b, eps)) return true;
  return false;
}

export function isSimplePolygon(points, eps = 1e-9) {
  // O(n^2) check for self intersections, excluding adjacent edges
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const b1 = points[j];
      const b2 = points[(j + 1) % n];

      // skip same edge
      if (i === j) continue;
      // skip adjacent edges that share a vertex
      if ((i + 1) % n === j) continue;
      if (i === (j + 1) % n) continue;

      if (segmentsIntersect(a1, a2, b1, b2, eps)) return false;
    }
  }
  return true;
}

export function isClosedPolyline(points, eps = 1e-6) {
  if (points.length < 3) return false;
  return dist2(points[0], points[points.length - 1]) <= eps * eps;
}

export function nearestPointOnSegment(p, a, b) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / (len2(ab) + 1e-12), 0, 1);
  const q = add(a, mul(ab, t));
  return { q, t };
}

export function lineRaySegmentIntersection(rayP, rayDir, a, b, eps = 1e-9) {
  // Ray: rayP + t*rayDir, t>=0
  // Segment: a + u*(b-a), u in [0,1]
  const v = rayDir;
  const w = sub(b, a);
  const denom = cross(v, w);
  if (Math.abs(denom) <= eps) return null; // parallel

  const ap = sub(a, rayP);
  const t = cross(ap, w) / denom;
  const u = cross(ap, v) / denom;
  if (t >= -eps && u >= -eps && u <= 1 + eps) {
    return { t, u, p: add(rayP, mul(v, t)) };
  }
  return null;
}

export function polylineToPathD(points, closed) {
  if (points.length === 0) return '';
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x} ${points[i].y}`);
  }
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('File read error'));
    reader.readAsText(file);
  });
}

export function roundTo(n, digits = 3) {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}

export function quantizePoint(p, q = 1e-3) {
  return { x: Math.round(p.x / q) * q, y: Math.round(p.y / q) * q };
}

export function keyForUndirectedEdge(a, b, q = 1e-3) {
  const A = quantizePoint(a, q);
  const B = quantizePoint(b, q);
  const k1 = `${A.x},${A.y}`;
  const k2 = `${B.x},${B.y}`;
  return (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`;
}

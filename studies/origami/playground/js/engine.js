// engine.js - Straight Skeleton based crease generation (demo)
//
// This module uses the npm package "straight-skeleton" (WASM/CGAL wrapper) through esm.sh.
// It computes a straight skeleton of a polygon (optionally with holes) and converts it into:
//  - Mountain creases: interior edges of skeleton faces
//  - Valley creases: demo perpendiculars from skeleton vertices towards the defining edge of each face
//  - Cut line: a single straight line (visual aid)
//
// NOTE: This is an educational demo; it does not attempt to fully reproduce the entire Fold-and-Cut folding/reflection construction.

import {
  pt,
  bboxOfPoints,
  polygonArea,
  polygonCentroid,
  ensureCCW,
  ensureCW,
  isSimplePolygon,
  pointInPolygon,
  normalize,
  sub,
  add,
  mul,
  dot,
  keyForUndirectedEdge,
  lineRaySegmentIntersection,
} from './utils.js';

const EPS_TIME = 1e-7;

class StraightSkeletonService {
  static _mod = null;
  static _initPromise = null;

  static async load() {
    if (this._mod) return this._mod;
    if (!this._initPromise) {
      this._initPromise = (async () => {
        // default export object (see CodePen examples)
        const mod = await import('https://esm.sh/straight-skeleton@2.0.1');
        const api = mod.default ?? mod;
        if (!api.SkeletonBuilder) {
          throw new Error('Failed to load straight-skeleton (SkeletonBuilder not found).');
        }
        await api.SkeletonBuilder.init();
        this._mod = api;
        return api;
      })();
    }
    return this._initPromise;
  }
}

function ringFromShape(shape) {
  // shape.points: [{x,y},...], closed polygon (no duplicate last)
  const pts = shape.points.map(p => pt(p.x, p.y));
  if (pts.length < 3) throw new Error('A closed shape needs at least 3 points.');
  // ensure no duplicate consecutive points
  const clean = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (!prev || (Math.abs(prev.x - p.x) > 1e-9 || Math.abs(prev.y - p.y) > 1e-9)) clean.push(p);
  }
  if (clean.length < 3) throw new Error('A closed shape needs at least 3 points.');
  if (!isSimplePolygon(clean)) throw new Error('This shape is self-intersecting. Please use a simple polygon.');
  return clean;
}

function farthestPair(points) {
  let bestI = 0, bestJ = 1;
  let bestD2 = -Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const d2 = dx * dx + dy * dy;
      if (d2 > bestD2) {
        bestD2 = d2;
        bestI = i;
        bestJ = j;
      }
    }
  }
  return [points[bestI], points[bestJ]];
}

function buildRingsFromProject(project, selectedId = null) {
  // Collect closed polygons only
  const closed = project.shapes.filter(s => s.type === 'polygon' && s.closed && Array.isArray(s.points));
  if (closed.length === 0) {
    throw new Error('No closed polygon found. Create one using Pen/Rectangle/Regular Polygon.');
  }

  // If selected and it's a polygon, prioritize it as outer candidate
  const selected = selectedId ? project.getShapeById(selectedId) : null;
  if (selectedId && selected && !(selected.type === 'polygon' && selected.closed)) {
    throw new Error('The selected shape is not closed. Please select a closed polygon.');
  }

  // Convert to rings and compute areas
  const ringInfos = closed.map(s => {
    const ring = ringFromShape(s);
    const area = polygonArea(ring);
    const centroid = polygonCentroid(ring);
    return { id: s.id, ring, area, absArea: Math.abs(area), centroid };
  });

  // Choose outer: selected if it's closed polygon and not inside another larger polygon; else largest area
  let outer = null;
  if (selected && selected.type === 'polygon' && selected.closed) {
    const selInfo = ringInfos.find(r => r.id === selected.id);
    if (selInfo) outer = selInfo;
  }
  if (!outer) {
    outer = ringInfos.reduce((a, b) => (b.absArea > a.absArea ? b : a), ringInfos[0]);
  }

  // Determine holes: other rings whose centroid is inside outer
  const holes = [];
  const outsiders = [];
  for (const info of ringInfos) {
    if (info.id === outer.id) continue;
    if (pointInPolygon(info.centroid, outer.ring)) holes.push(info);
    else outsiders.push(info);
  }

  if (outsiders.length > 0) {
    // Multiple disjoint polygons. In a full PSLG setting you could handle it, but this demo keeps it simple.
    throw new Error(
      'Multiple outer candidates (disjoint closed polygons) were detected.\n' +
      'This demo supports only: "one outer boundary + holes (inner closed polygons)".\n' +
      `Number of polygons outside the outer boundary: ${outsiders.length}`
    );
  }

  // Ensure orientations
  const outerCCW = ensureCCW(outer.ring);
  const holeRings = holes.map(h => ensureCW(h.ring));

  // Convert to numeric rings with duplicate first point
  const rings = [outerCCW, ...holeRings].map(r => {
    const arr = r.map(p => [p.x, p.y]);
    // duplicate first vertex at end
    arr.push([r[0].x, r[0].y]);
    return arr;
  });

  return { rings, outerRing: outerCCW };
}

function extractInteriorEdgesFromSkeleton(skeleton) {
  // skeleton.polygons: array<indices>; skeleton.vertices: [x,y,t]
  const edgeCount = new Map();
  for (const poly of skeleton.polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a === b) continue;
      const i0 = Math.min(a, b);
      const i1 = Math.max(a, b);
      const key = `${i0}|${i1}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }

  const edges = [];
  for (const [key, count] of edgeCount.entries()) {
    if (count < 2) continue; // likely boundary
    const [i0s, i1s] = key.split('|');
    const i0 = Number(i0s);
    const i1 = Number(i1s);
    const v0 = skeleton.vertices[i0];
    const v1 = skeleton.vertices[i1];
    if (!v0 || !v1) continue;
    // Filter degenerate
    const dx = v0[0] - v1[0];
    const dy = v0[1] - v1[1];
    if (dx * dx + dy * dy < 1e-10) continue;
    edges.push({ i0, i1 });
  }
  return edges;
}

function buildPerpendicularsFromFaces(skeleton) {
  // For each skeleton face polygon, estimate the defining edge as the longest pair among time==0 vertices.
  // Then cast a ray from each time>0 vertex towards that line and intersect with face boundary.
  const creases = [];
  const seen = new Set();

  const verts = skeleton.vertices;

  for (const poly of skeleton.polygons) {
    const face = poly.map(i => ({ i, x: verts[i][0], y: verts[i][1], t: verts[i][2] }));

    const boundaryPts = face.filter(v => Math.abs(v.t) <= EPS_TIME).map(v => pt(v.x, v.y));
    if (boundaryPts.length < 2) continue;

    const [e0, e1] = farthestPair(boundaryPts);
    const d = normalize(sub(e1, e0));
    if (d.x === 0 && d.y === 0) continue;

    // Precompute boundary segments of face polygon
    const face2D = face.map(v => pt(v.x, v.y));

    for (const v of face) {
      if (v.t <= EPS_TIME) continue;
      const p = pt(v.x, v.y);
      const foot = add(e0, mul(d, dot(sub(p, e0), d)));
      let dir = sub(foot, p);
      dir = normalize(dir);
      if (dir.x === 0 && dir.y === 0) continue;

      let best = null;
      for (let i = 0; i < face2D.length; i++) {
        const a = face2D[i];
        const b = face2D[(i + 1) % face2D.length];
        const hit = lineRaySegmentIntersection(p, dir, a, b);
        if (!hit) continue;
        if (hit.t <= 1e-6) continue;
        if (!best || hit.t < best.t) best = hit;
      }

      if (!best) continue;
      const q = best.p;
      const key = keyForUndirectedEdge(p, q, 1e-2);
      if (seen.has(key)) continue;
      seen.add(key);

      creases.push({ a: p, b: q, kind: 'V', source: 'perp' });
    }
  }

  return creases;
}

export class FoldAndCutEngine {
  constructor() {
    this.ready = false;
  }

  async init() {
    await StraightSkeletonService.load();
    this.ready = true;
  }

  async run(project, selectedId, viewport) {
    const api = await StraightSkeletonService.load();

    const { rings } = buildRingsFromProject(project, selectedId);

    const skeleton = api.SkeletonBuilder.buildFromPolygon(rings);
    if (!skeleton) {
      throw new Error('Failed to generate a straight skeleton (the input may not be weakly simple, etc.).');
    }

    // 1) skeleton interior edges -> Mountain creases
    const interiorEdges = extractInteriorEdgesFromSkeleton(skeleton);
    const creases = [];
    for (const e of interiorEdges) {
      const v0 = skeleton.vertices[e.i0];
      const v1 = skeleton.vertices[e.i1];
      creases.push({
        a: pt(v0[0], v0[1]),
        b: pt(v1[0], v1[1]),
        kind: 'M',
        source: 'skeleton',
      });
    }

    // 2) demo perpendiculars -> Valley creases
    const perps = buildPerpendicularsFromFaces(skeleton);
    creases.push(...perps);

    // 3) cut line (single straight cut): put it through the center of skeleton bbox
    const allPts = skeleton.vertices.map(v => pt(v[0], v[1]));
    const bb = bboxOfPoints(allPts);
    const y = (bb.minY + bb.maxY) / 2;
    const cutLine = {
      a: pt(0, y),
      b: pt(viewport.w, y),
    };

    // 4) return
    return {
      rings,
      skeleton,
      creases,
      cutLine,
    };
  }
}
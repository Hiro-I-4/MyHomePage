// models.js - document model (Project, Shapes)

import { uid, polylineToPathD, pt, bboxOfPoints, pointInPolygon, dist2 } from './utils.js';

export class Project {
  constructor() {
    this.version = 1;
    this.shapes = []; // array<Shape>
    this.settings = {
      gridSize: 25,
      showGrid: true,
      snap: true,
    };
  }

  addShape(shape) {
    this.shapes.push(shape);
  }

  removeShapeById(id) {
    const idx = this.shapes.findIndex(s => s.id === id);
    if (idx >= 0) this.shapes.splice(idx, 1);
  }

  getShapeById(id) {
    return this.shapes.find(s => s.id === id) ?? null;
  }

  toJSON() {
    return {
      version: this.version,
      settings: { ...this.settings },
      shapes: this.shapes.map(s => s.toJSON()),
    };
  }

  static fromJSON(obj) {
    const p = new Project();
    if (obj?.settings) p.settings = { ...p.settings, ...obj.settings };
    p.shapes = Array.isArray(obj?.shapes) ? obj.shapes.map(ShapeFactory.fromJSON) : [];
    return p;
  }
}

export class Shape {
  constructor(type) {
    this.id = uid('shape');
    this.type = type; // 'polyline' | 'polygon'
    this.selected = false;
  }

  bbox() {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  translate(dx, dy) {}

  hitTest(_p, _eps) {
    return false;
  }

  toPathD() {
    return '';
  }

  toJSON() {
    return { id: this.id, type: this.type };
  }
}

export class PolylineShape extends Shape {
  constructor(points = [], closed = false) {
    super(closed ? 'polygon' : 'polyline');
    this.points = points.map(p => pt(p.x, p.y));
    this.closed = closed;
  }

  clone() {
    const s = new PolylineShape(this.points, this.closed);
    s.id = this.id;
    return s;
  }

  bbox() {
    return bboxOfPoints(this.points);
  }

  translate(dx, dy) {
    for (const p of this.points) {
      p.x += dx;
      p.y += dy;
    }
  }

  toPathD() {
    return polylineToPathD(this.points, this.closed);
  }

  hitTest(p, eps = 6) {
    // polygon: point-in-poly; polyline: distance to segments
    if (this.closed) {
      return pointInPolygon(p, this.points);
    }
    const e2 = eps * eps;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      // distance to segment (approx)
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (((b.x - a.x) ** 2 + (b.y - a.y) ** 2) + 1e-12);
      const tt = Math.max(0, Math.min(1, t));
      const qx = a.x + (b.x - a.x) * tt;
      const qy = a.y + (b.y - a.y) * tt;
      if ((p.x - qx) ** 2 + (p.y - qy) ** 2 <= e2) return true;
    }
    return false;
  }

  nearestVertex(p, eps = 8) {
    const e2 = eps * eps;
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d2 = dist2(p, this.points[i]);
      if (d2 <= e2 && d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      closed: this.closed,
      points: this.points.map(p => ({ x: p.x, y: p.y })),
    };
  }

  static fromJSON(obj) {
    const pts = Array.isArray(obj?.points) ? obj.points.map(p => pt(p.x, p.y)) : [];
    const s = new PolylineShape(pts, Boolean(obj?.closed) || obj?.type === 'polygon');
    if (obj?.id) s.id = obj.id;
    return s;
  }
}

export class ShapeFactory {
  static fromJSON(obj) {
    if (!obj?.type) return new PolylineShape([], false);
    if (obj.type === 'polyline' || obj.type === 'polygon') return PolylineShape.fromJSON(obj);
    // future-proof
    return PolylineShape.fromJSON(obj);
  }
}

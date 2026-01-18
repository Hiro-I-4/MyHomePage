// tools.js - interaction tools (pen/select/rect/ngon)

import { pt, snapPoint, dist2 } from './utils.js';
import { PolylineShape } from './models.js';
import { AddShapeCommand, UpdateShapeCommand } from './history.js';

export class Tool {
  constructor(app) {
    this.app = app;
  }
  activate() {}
  deactivate() {}
  onPointerDown(_evt) {}
  onPointerMove(_evt) {}
  onPointerUp(_evt) {}
  onKeyDown(_evt) {}
}

function rectToPoints(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return [pt(x1, y1), pt(x2, y1), pt(x2, y2), pt(x1, y2)];
}

function regularPolygonPoints(center, radius, sides) {
  const n = Math.max(3, Math.round(sides));
  const pts = [];
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const th = startAngle + (2 * Math.PI * i) / n;
    pts.push(pt(center.x + radius * Math.cos(th), center.y + radius * Math.sin(th)));
  }
  return pts;
}

export class SelectTool extends Tool {
  constructor(app) {
    super(app);
    this.state = { mode: 'idle' };
  }

  onPointerDown(evt) {
    const p = this.app.getWorldPoint(evt);

    const selected = this.app.getSelectedShape();

    // vertex handle?
    const target = evt.target;
    const vIdxStr = target?.getAttribute?.('data-vertex-index');
    if (selected && vIdxStr != null) {
      const vIdx = Number(vIdxStr);
      if (Number.isFinite(vIdx) && vIdx >= 0) {
        this.state = {
          mode: 'dragVertex',
          shapeId: selected.id,
          vertexIndex: vIdx,
          start: p,
          before: selected.toJSON(),
        };
        evt.preventDefault();
        return;
      }
    }

    // shape hit test (topmost last)
    const shapes = this.app.project.shapes;
    let hit = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapes[i].hitTest(p, 8)) {
        hit = shapes[i];
        break;
      }
    }

    if (hit) {
      this.app.setSelectedShapeId(hit.id);
      const nowSel = this.app.getSelectedShape();
      if (nowSel) {
        this.state = {
          mode: 'dragShape',
          shapeId: nowSel.id,
          start: p,
          before: nowSel.toJSON(),
        };
      }
    } else {
      this.app.setSelectedShapeId(null);
      this.state = { mode: 'idle' };
    }

    this.app.render();
  }

  onPointerMove(evt) {
    if (this.state.mode === 'idle') return;
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);

    const shape = this.app.project.getShapeById(this.state.shapeId);
    if (!shape || !Array.isArray(shape.points)) return;

    if (this.state.mode === 'dragVertex') {
      shape.points[this.state.vertexIndex] = pt(p.x, p.y);
      this.app.render();
      return;
    }

    if (this.state.mode === 'dragShape') {
      const dx = p.x - this.state.start.x;
      const dy = p.y - this.state.start.y;
      // apply transform relative to before snapshot
      const beforeShape = PolylineShape.fromJSON(this.state.before);
      beforeShape.translate(dx, dy);
      const idx = this.app.project.shapes.findIndex(s => s.id === shape.id);
      if (idx >= 0) this.app.project.shapes[idx] = beforeShape;
      this.app.render();
    }
  }

  onPointerUp(_evt) {
    if (this.state.mode === 'idle') return;
    const afterShape = this.app.project.getShapeById(this.state.shapeId);
    if (afterShape) {
      const after = afterShape.toJSON();
      // If no move happened, don't clutter history
      if (JSON.stringify(after) !== JSON.stringify(this.state.before)) {
        this.app.history.exec(new UpdateShapeCommand(this.state.shapeId, this.state.before, after), this.app.project);
      }
    }
    this.state = { mode: 'idle' };
    this.app.render();
  }
}

export class PenTool extends Tool {
  constructor(app) {
    super(app);
    this.points = [];
  }

  activate() {
    this.points = [];
    this.app.view.renderOverlayPreview(this.points, false);
    this.app.setStatus('Pen: click to add points / Enter=close / Esc=finish as polyline / Backspace=undo');
  }

  deactivate() {
    this.points = [];
    this.app.view.clearOverlay();
  }

  onPointerDown(evt) {
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);

    // close by clicking near the first point
    if (this.points.length >= 3 && dist2(p, this.points[0]) <= 12 * 12) {
      this._commitPolygon();
      return;
    }

    this.points.push(pt(p.x, p.y));
    this.app.view.renderOverlayPreview(this.points, false);
  }

  onPointerMove(evt) {
    if (this.points.length === 0) return;
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);

    const preview = [...this.points, pt(p.x, p.y)];
    this.app.view.renderOverlayPreview(preview, false);
  }

  onKeyDown(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      this._commitPolygon();
      return;
    }
    if (evt.key === 'Escape') {
      evt.preventDefault();
      this._commitPolyline();
      return;
    }
    if (evt.key === 'Backspace') {
      evt.preventDefault();
      this.points.pop();
      this.app.view.renderOverlayPreview(this.points, false);
    }
  }

  _commitPolygon() {
    if (this.points.length < 3) {
      this.app.showError('Not enough points (minimum 3).');
      return;
    }
    const shape = new PolylineShape(this.points, true);
    this.app.history.exec(new AddShapeCommand(shape.toJSON()), this.app.project);
    this.points = [];
    this.app.view.clearOverlay();
    this.app.render();
  }

  _commitPolyline() {
    if (this.points.length < 2) {
      this.app.showError('Not enough points (minimum 2).');
      return;
    }
    const shape = new PolylineShape(this.points, false);
    this.app.history.exec(new AddShapeCommand(shape.toJSON()), this.app.project);
    this.points = [];
    this.app.view.clearOverlay();
    this.app.render();
  }
}

export class RectTool extends Tool {
  constructor(app) {
    super(app);
    this.state = { dragging: false };
  }

  activate() {
    this.app.setStatus('Rectangle: drag to create');
  }

  onPointerDown(evt) {
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);
    this.state = { dragging: true, start: p, current: p };
  }

  onPointerMove(evt) {
    if (!this.state.dragging) return;
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);
    this.state.current = p;
    const pts = rectToPoints(this.state.start, this.state.current);
    this.app.view.renderOverlayPreview(pts, true);
  }

  onPointerUp(_evt) {
    if (!this.state.dragging) return;
    const pts = rectToPoints(this.state.start, this.state.current);
    this.state.dragging = false;
    this.app.view.clearOverlay();

    if (Math.abs(pts[2].x - pts[0].x) < 5 || Math.abs(pts[2].y - pts[0].y) < 5) {
      this.app.showError('Rectangle is too small.');
      return;
    }

    const shape = new PolylineShape(pts, true);
    this.app.history.exec(new AddShapeCommand(shape.toJSON()), this.app.project);
    this.app.render();
  }
}

export class NgonTool extends Tool {
  constructor(app) {
    super(app);
    this.state = { dragging: false };
  }

  activate() {
    this.app.setStatus('Regular polygon: drag to create (center → radius)');
  }

  _getSides() {
    const el = document.getElementById('ngonSides');
    const n = Number(el?.value ?? 6);
    return Math.max(3, Math.min(40, Math.round(n || 6)));
  }

  onPointerDown(evt) {
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);
    this.state = { dragging: true, center: p, current: p };
  }

  onPointerMove(evt) {
    if (!this.state.dragging) return;
    const snap = this.app.project.settings.snap;
    const grid = this.app.project.settings.gridSize;
    let p = this.app.getWorldPoint(evt);
    if (snap) p = snapPoint(p, grid);
    this.state.current = p;

    const r = Math.sqrt(dist2(this.state.center, this.state.current));
    const pts = regularPolygonPoints(this.state.center, r, this._getSides());
    this.app.view.renderOverlayPreview(pts, true);
  }

  onPointerUp(_evt) {
    if (!this.state.dragging) return;
    this.state.dragging = false;
    this.app.view.clearOverlay();

    const r = Math.sqrt(dist2(this.state.center, this.state.current));
    if (r < 8) {
      this.app.showError('Regular polygon is too small.');
      return;
    }
    const pts = regularPolygonPoints(this.state.center, r, this._getSides());
    const shape = new PolylineShape(pts, true);
    this.app.history.exec(new AddShapeCommand(shape.toJSON()), this.app.project);
    this.app.render();
  }
}
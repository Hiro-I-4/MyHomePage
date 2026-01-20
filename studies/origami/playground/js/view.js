// view.js - SVG renderer / coordinate helpers

import { polylineToPathD } from './utils.js';

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

export class SVGView {
  constructor(svg) {
    this.svg = svg;
    this.gGrid = svg.querySelector('#grid');
    this.gResult = svg.querySelector('#result');
    this.gShapes = svg.querySelector('#shapes');
    this.gHandles = svg.querySelector('#handles');
    this.gOverlay = svg.querySelector('#overlay');

    this.viewport = { w: 1000, h: 700 };
    this._updateViewportFromViewBox();
  }

  _updateViewportFromViewBox() {
    const vb = this.svg.viewBox.baseVal;
    this.viewport = { w: vb.width || 1000, h: vb.height || 700 };
  }

  screenToWorld(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  renderGrid(settings) {
    clear(this.gGrid);
    if (!settings.showGrid) return;
    this._updateViewportFromViewBox();
    const grid = Math.max(5, Number(settings.gridSize) || 25);
    const { w, h } = this.viewport;

    for (let x = 0; x <= w; x += grid) {
      const line = svgEl('line', { x1: x, y1: 0, x2: x, y2: h, class: 'grid-line' });
      this.gGrid.appendChild(line);
    }
    for (let y = 0; y <= h; y += grid) {
      const line = svgEl('line', { x1: 0, y1: y, x2: w, y2: y, class: 'grid-line' });
      this.gGrid.appendChild(line);
    }
  }

  renderShapes(project, selectedId) {
    clear(this.gShapes);
    for (const shape of project.shapes) {
      const path = svgEl('path', {
        d: shape.toPathD(),
        class: `shape-path${shape.id === selectedId ? ' selected' : ''}`,
        'data-shape-id': shape.id,
      });
      this.gShapes.appendChild(path);
    }
  }

  renderHandles(selectedShape) {
    clear(this.gHandles);
    if (!selectedShape) return;
    if (!Array.isArray(selectedShape.points)) return;

    const pts = selectedShape.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const c = svgEl('circle', {
        cx: p.x,
        cy: p.y,
        r: 5,
        class: 'handle',
        'data-vertex-index': i,
      });
      this.gHandles.appendChild(c);
    }
  }

  renderOverlayPreview(points, closed) {
    clear(this.gOverlay);
    if (!points || points.length === 0) return;
    const path = svgEl('path', {
      d: polylineToPathD(points, closed),
      class: 'preview',
    });
    this.gOverlay.appendChild(path);
  }

  clearOverlay() {
    clear(this.gOverlay);
  }

  renderResult(resultLayer) {
    clear(this.gResult);
    if (!resultLayer) return;

    // 1) optional: show input as reference (not here; it's in shapes layer)

    // 2) creases
    for (const seg of resultLayer.creases ?? []) {
      const cls = seg.kind === 'M' ? 'crease-m' : 'crease-v';
      const line = svgEl('line', {
        x1: seg.a.x,
        y1: seg.a.y,
        x2: seg.b.x,
        y2: seg.b.y,
        class: cls,
      });
      this.gResult.appendChild(line);
    }

    
  }
}

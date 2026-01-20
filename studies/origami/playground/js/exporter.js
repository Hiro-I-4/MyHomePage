// exporter.js - export functions (SVG / JSON)

import { downloadTextFile, roundTo, pt } from './utils.js';

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class Exporter {
  static exportProjectJSON(project) {
    const text = JSON.stringify(project.toJSON(), null, 2);
    downloadTextFile('project.json', text);
  }

  static exportResultJSON(result) {
    if (!result) {
      downloadTextFile('result.json', JSON.stringify({ error: 'no result' }, null, 2));
      return;
    }
    // Light-weight, program-friendly format
    const obj = {
      meta: {
        generator: 'foldcut-webapp-demo',
        createdAt: new Date().toISOString(),
      },
      
      creases: (result.creases ?? []).map(c => ({
        kind: c.kind,
        a: { x: roundTo(c.a.x), y: roundTo(c.a.y) },
        b: { x: roundTo(c.b.x), y: roundTo(c.b.y) },
        source: c.source ?? null,
      })),
      rings: result.rings ?? null,
    };
    downloadTextFile('crease-pattern.json', JSON.stringify(obj, null, 2));
  }

  static exportSVG(project, result, viewBox) {
    const vb = viewBox ?? { w: 1000, h: 700 };
    const lines = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb.w} ${vb.h}">`);
    lines.push(`<rect x="0" y="0" width="${vb.w}" height="${vb.h}" fill="#ffffff"/>`);

    // shapes
    lines.push(`<g id="input" fill="none" stroke="#111" stroke-width="2">`);
    for (const s of project.shapes) {
      const d = s.toPathD();
      if (!d) continue;
      lines.push(`<path d="${esc(d)}" />`);
    }
    lines.push(`</g>`);

    // result creases
    if (result) {
      const m = (result.creases ?? []).filter(c => c.kind === 'M');
      const v = (result.creases ?? []).filter(c => c.kind === 'V');

      lines.push(`<g id="creases-m" fill="none" stroke="#d00" stroke-width="2">`);
      for (const c of m) {
        lines.push(`<line x1="${c.a.x}" y1="${c.a.y}" x2="${c.b.x}" y2="${c.b.y}" />`);
      }
      lines.push(`</g>`);

      lines.push(`<g id="creases-v" fill="none" stroke="#06f" stroke-width="2" stroke-dasharray="6 6">`);
      for (const c of v) {
        lines.push(`<line x1="${c.a.x}" y1="${c.a.y}" x2="${c.b.x}" y2="${c.b.y}" />`);
      }
      lines.push(`</g>`);

      
    }

    lines.push(`</svg>`);
    downloadTextFile('crease-pattern.svg', lines.join('\n'));
  }
}

// app.js - entry point & UI wiring

import { Project } from './models.js';
import { UndoManager, RemoveShapeCommand, SetProjectCommand } from './history.js';
import { SVGView } from './view.js';
import { SelectTool, PenTool, RectTool, NgonTool } from './tools.js';
import { FoldAndCutEngine } from './engine.js';
import { Exporter } from './exporter.js';

const LOCAL_KEY = 'foldcut_project_v1';

class App {
  constructor() {
    this.project = new Project();
    this.history = new UndoManager();
    this.engine = new FoldAndCutEngine();
    this.selectedShapeId = null;
    this.result = null;

    this.svg = document.getElementById('canvas');
    this.view = new SVGView(this.svg);

    this.ui = {
      status: document.getElementById('status'),
      error: document.getElementById('error'),
      chkGrid: document.getElementById('chkGrid'),
      chkSnap: document.getElementById('chkSnap'),
      gridSize: document.getElementById('gridSize'),
      btnUndo: document.getElementById('btnUndo'),
      btnRedo: document.getElementById('btnRedo'),
      btnDelete: document.getElementById('btnDelete'),
      btnRun: document.getElementById('btnRun'),
      btnClearResult: document.getElementById('btnClearResult'),
      btnSaveLocal: document.getElementById('btnSaveLocal'),
      btnLoadLocal: document.getElementById('btnLoadLocal'),
      btnExportProject: document.getElementById('btnExportProject'),
      btnImportProject: document.getElementById('btnImportProject'),
      fileImport: document.getElementById('fileImport'),
      btnExportSVG: document.getElementById('btnExportSVG'),
      btnExportPattern: document.getElementById('btnExportPattern'),
      toolButtons: Array.from(document.querySelectorAll('.tool')),
      helpBtn: document.getElementById('helpBtn'),
      help: document.getElementById('help'),
      helpClose: document.getElementById('helpClose'),
    };

    // Tools
    this.tools = {
      select: new SelectTool(this),
      pen: new PenTool(this),
      rect: new RectTool(this),
      ngon: new NgonTool(this),
    };
    this.currentTool = this.tools.select;

    this._bindUI();
    this._bindCanvasEvents();

    // history -> keep buttons in sync + autosave
    this.history.onChange = () => {
      this._updateUndoRedoUI();
      this._autosave();
    };

    this._loadAutosaveIfAny();
    this._updateUndoRedoUI();
    this.render();

    // init engine (async)
    this._initEngine();
  }

  async _initEngine() {
    try {
      this.setStatus('Straight Skeleton エンジンを初期化中…');
      await this.engine.init();
      this.setStatus('Ready. 図形を描いて Run を押してください。');
    } catch (e) {
      this.showError(String(e?.message ?? e));
      this.setStatus('エンジン初期化に失敗しました（ネットワーク/ブラウザ制限の可能性）。');
    }
  }

  _bindUI() {
    // tool switching
    for (const btn of this.ui.toolButtons) {
      btn.addEventListener('click', () => {
        const toolName = btn.getAttribute('data-tool');
        this.setTool(toolName);
      });
    }

    // grid
    this.ui.chkGrid.addEventListener('change', () => {
      this.project.settings.showGrid = this.ui.chkGrid.checked;
      this.render();
      this._autosave();
    });
    this.ui.chkSnap.addEventListener('change', () => {
      this.project.settings.snap = this.ui.chkSnap.checked;
      this._autosave();
    });
    this.ui.gridSize.addEventListener('change', () => {
      const n = Number(this.ui.gridSize.value);
      this.project.settings.gridSize = Number.isFinite(n) ? n : 25;
      this.render();
      this._autosave();
    });

    // undo/redo
    this.ui.btnUndo.addEventListener('click', () => {
      this.history.undo(this.project);
      this.render();
    });
    this.ui.btnRedo.addEventListener('click', () => {
      this.history.redo(this.project);
      this.render();
    });

    // delete
    this.ui.btnDelete.addEventListener('click', () => {
      const sel = this.getSelectedShape();
      if (!sel) return;
      this.history.exec(new RemoveShapeCommand(sel.toJSON()), this.project);
      this.selectedShapeId = null;
      this.render();
    });

    // run
    this.ui.btnRun.addEventListener('click', async () => {
      await this.run();
    });
    this.ui.btnClearResult.addEventListener('click', () => {
      this.result = null;
      this.render();
    });

    // local save/load
    this.ui.btnSaveLocal.addEventListener('click', () => {
      this._saveLocal();
      this.setStatus('ローカル保存しました。');
    });
    this.ui.btnLoadLocal.addEventListener('click', () => {
      this._loadLocal();
    });

    // export/import
    this.ui.btnExportProject.addEventListener('click', () => {
      Exporter.exportProjectJSON(this.project);
    });
    this.ui.btnImportProject.addEventListener('click', () => {
      this.ui.fileImport.click();
    });
    this.ui.fileImport.addEventListener('change', async () => {
      const file = this.ui.fileImport.files?.[0];
      this.ui.fileImport.value = '';
      if (!file) return;
      await this.importProjectFromFile(file);
    });

    this.ui.btnExportSVG.addEventListener('click', () => {
      Exporter.exportSVG(this.project, this.result, this.view.viewport);
    });
    this.ui.btnExportPattern.addEventListener('click', () => {
      Exporter.exportResultJSON(this.result);
    });

    // help
    this.ui.helpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.ui.help.hidden = false;
    });
    this.ui.helpClose.addEventListener('click', () => {
      this.ui.help.hidden = true;
    });
  }

  _bindCanvasEvents() {
    // Pointer events dispatched to active tool
    this.svg.addEventListener('pointerdown', (evt) => {
      this.clearError();
      this.currentTool.onPointerDown(evt);
    });
    this.svg.addEventListener('pointermove', (evt) => {
      this.currentTool.onPointerMove(evt);
    });
    this.svg.addEventListener('pointerup', (evt) => {
      this.currentTool.onPointerUp(evt);
    });

    // Keyboard shortcuts (on SVG focus)
    this.svg.addEventListener('keydown', (evt) => {
      // global shortcuts
      if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z') {
        evt.preventDefault();
        if (evt.shiftKey) this.history.redo(this.project);
        else this.history.undo(this.project);
        this.render();
        return;
      }
      if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'y') {
        evt.preventDefault();
        this.history.redo(this.project);
        this.render();
        return;
      }
      if (evt.key === 'Delete') {
        const sel = this.getSelectedShape();
        if (sel) {
          this.history.exec(new RemoveShapeCommand(sel.toJSON()), this.project);
          this.selectedShapeId = null;
          this.render();
        }
        return;
      }

      this.currentTool.onKeyDown(evt);
    });

    // Focus SVG when click canvas
    this.svg.addEventListener('pointerdown', () => {
      this.svg.focus();
    });
  }

  setTool(name) {
    const next = this.tools[name];
    if (!next) return;
    if (this.currentTool?.deactivate) this.currentTool.deactivate();
    this.currentTool = next;
    if (this.currentTool?.activate) this.currentTool.activate();

    for (const btn of this.ui.toolButtons) {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === name);
    }
  }

  getWorldPoint(evt) {
    return this.view.screenToWorld(evt);
  }

  setSelectedShapeId(id) {
    this.selectedShapeId = id;
  }

  getSelectedShape() {
    if (!this.selectedShapeId) return null;
    return this.project.getShapeById(this.selectedShapeId);
  }

  render() {
    // sync grid controls (project->UI)
    this.ui.chkGrid.checked = this.project.settings.showGrid;
    this.ui.chkSnap.checked = this.project.settings.snap;
    this.ui.gridSize.value = String(this.project.settings.gridSize);

    this.view.renderGrid(this.project.settings);
    this.view.renderResult(this.result);
    this.view.renderShapes(this.project, this.selectedShapeId);
    this.view.renderHandles(this.getSelectedShape());
  }

  async run() {
    this.clearError();
    try {
      this.setStatus('計算中…（straight skeleton）');
      const res = await this.engine.run(this.project, this.selectedShapeId, this.view.viewport);
      this.result = res;
      this.render();
      this.setStatus(`完了: creases=${res.creases?.length ?? 0} / rings=${res.rings?.length ?? 0}`);
    } catch (e) {
      this.showError(String(e?.message ?? e));
      this.setStatus('失敗: 入力図形を見直してください。');
    }
  }

  setStatus(text) {
    this.ui.status.textContent = text;
  }

  showError(text) {
    this.ui.error.hidden = false;
    this.ui.error.textContent = text;
  }

  clearError() {
    this.ui.error.hidden = true;
    this.ui.error.textContent = '';
  }

  _updateUndoRedoUI() {
    this.ui.btnUndo.disabled = !this.history.canUndo();
    this.ui.btnRedo.disabled = !this.history.canRedo();
  }

  _autosave() {
    // lightweight autosave (no history)
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.project.toJSON()));
    } catch {
      // ignore
    }
  }

  _loadAutosaveIfAny() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      this.project = Project.fromJSON(obj);
      // re-wire history because project reference changed
      // (history stacks are kept, but in practice we reset them for clarity)
      this.history.undoStack = [];
      this.history.redoStack = [];

      // UI sync
      this.setStatus('前回の自動保存を読み込みました。');
    } catch {
      // ignore
    }
  }

  _saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY + '_manual', JSON.stringify(this.project.toJSON()));
    } catch {
      // ignore
    }
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY + '_manual');
      if (!raw) {
        this.showError('ローカル保存が見つかりません。');
        return;
      }
      const obj = JSON.parse(raw);
      const before = this.project.toJSON();
      const after = obj;
      this.history.exec(new SetProjectCommand(before, after), this.project);
      this.selectedShapeId = null;
      this.result = null;
      this.render();
      this.setStatus('ローカル保存を読み込みました。');
    } catch (e) {
      this.showError(String(e?.message ?? e));
    }
  }

  async importProjectFromFile(file) {
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const before = this.project.toJSON();
      const after = obj;
      this.history.exec(new SetProjectCommand(before, after), this.project);
      this.selectedShapeId = null;
      this.result = null;
      this.render();
      this.setStatus('インポート完了。');
    } catch (e) {
      this.showError('インポートに失敗しました: ' + String(e?.message ?? e));
    }
  }
}

// boot
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  // default tool
  app.setTool('select');
  // expose for debugging
  window.__app = app;
});

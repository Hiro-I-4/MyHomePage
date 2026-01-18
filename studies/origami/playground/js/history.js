// history.js - Undo/Redo (Command pattern)

import { ShapeFactory } from './models.js';

export class Command {
  /** @param {string} label */
  constructor(label = 'command') {
    this.label = label;
  }
  do(_project) {}
  undo(_project) {}
}

export class UndoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = () => {};
  }

  exec(cmd, project) {
    cmd.do(project);
    this.undoStack.push(cmd);
    this.redoStack = [];
    this.onChange();
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo(project) {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo(project);
    this.redoStack.push(cmd);
    this.onChange();
  }

  redo(project) {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do(project);
    this.undoStack.push(cmd);
    this.onChange();
  }
}

export class AddShapeCommand extends Command {
  constructor(shapeJSON) {
    super('add-shape');
    this.shapeJSON = shapeJSON;
  }
  do(project) {
    project.shapes.push(ShapeFactory.fromJSON(this.shapeJSON));
  }
  undo(project) {
    project.removeShapeById(this.shapeJSON.id);
  }
}

export class RemoveShapeCommand extends Command {
  constructor(shapeJSON) {
    super('remove-shape');
    this.shapeJSON = shapeJSON;
  }
  do(project) {
    project.removeShapeById(this.shapeJSON.id);
  }
  undo(project) {
    project.shapes.push(ShapeFactory.fromJSON(this.shapeJSON));
  }
}

export class UpdateShapeCommand extends Command {
  constructor(shapeId, beforeJSON, afterJSON) {
    super('update-shape');
    this.shapeId = shapeId;
    this.beforeJSON = beforeJSON;
    this.afterJSON = afterJSON;
  }

  _apply(project, json) {
    const idx = project.shapes.findIndex(s => s.id === this.shapeId);
    if (idx < 0) return;
    const newShape = ShapeFactory.fromJSON(json);
    newShape.id = this.shapeId;
    project.shapes[idx] = newShape;
  }

  do(project) { this._apply(project, this.afterJSON); }
  undo(project) { this._apply(project, this.beforeJSON); }
}

export class SetProjectCommand extends Command {
  constructor(beforeProjectJSON, afterProjectJSON) {
    super('set-project');
    this.before = beforeProjectJSON;
    this.after = afterProjectJSON;
  }
  do(project) {
    project.settings = { ...project.settings, ...this.after.settings };
    project.shapes = this.after.shapes.map(ShapeFactory.fromJSON);
  }
  undo(project) {
    project.settings = { ...project.settings, ...this.before.settings };
    project.shapes = this.before.shapes.map(ShapeFactory.fromJSON);
  }
}

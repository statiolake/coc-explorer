"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(index_exports);
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
var import_coc = require("coc.nvim");
var ExplorerProvider = class {
  changeEmitter = new import_coc.Emitter();
  onDidChangeTreeData = this.changeEmitter.event;
  root;
  constructor() {
    this.root = this.configuredRoot();
  }
  getRoot() {
    return this.root;
  }
  setRoot(root) {
    this.root = root;
    this.refresh();
  }
  refresh(node) {
    this.changeEmitter.fire(node);
  }
  getTreeItem(node) {
    const item = new import_coc.TreeItem(
      import_coc.Uri.file(node.path),
      node.directory ? import_coc.TreeItemCollapsibleState.Collapsed : import_coc.TreeItemCollapsibleState.None
    );
    item.id = node.path;
    item.tooltip = node.path;
    item.command = {
      command: node.directory ? "coc-explorer.toggle" : "coc-explorer.open",
      title: node.directory ? "Expand or Collapse" : "Open",
      arguments: [node]
    };
    return item;
  }
  resolveActions(_item, node) {
    const action = (title, command) => ({
      title,
      handler: () => import_coc.commands.executeCommand(command, node)
    });
    const actions = node.directory ? [
      action("Expand / Collapse", "coc-explorer.toggle"),
      action("Set as Root", "coc-explorer.changeRootTo"),
      action("New File", "coc-explorer.newFile"),
      action("New Folder", "coc-explorer.newFolder")
    ] : [
      action("Open", "coc-explorer.open"),
      action("Open in Split", "coc-explorer.openSplit"),
      action("Open in Vertical Split", "coc-explorer.openVsplit")
    ];
    actions.push(
      action("Rename", "coc-explorer.rename"),
      action("Delete", "coc-explorer.delete"),
      action("Copy Path", "coc-explorer.copyPath"),
      action("Run System Command", "coc-explorer.runSystem"),
      action("Refresh", "coc-explorer.refresh")
    );
    return actions;
  }
  async getChildren(node) {
    const parent = node ?? { path: this.root, directory: true };
    if (!parent.directory) return [];
    try {
      const entries = await import_node_fs.promises.readdir(parent.path, { withFileTypes: true });
      return entries.filter((entry) => this.shouldShow(entry.name)).map((entry) => ({
        path: import_node_path.default.join(parent.path, entry.name),
        parent: node,
        directory: entry.isDirectory()
      })).sort((left, right) => {
        if (left.directory !== right.directory)
          return left.directory ? -1 : 1;
        return import_node_path.default.basename(left.path).localeCompare(import_node_path.default.basename(right.path));
      });
    } catch (error) {
      import_coc.window.showWarningMessage(
        `Explorer cannot read ${parent.path}: ${String(error)}`
      );
      return [];
    }
  }
  getParent(node) {
    return node.parent;
  }
  dispose() {
    this.changeEmitter.dispose();
  }
  configuredRoot() {
    const configured = import_coc.workspace.getConfiguration("coc-explorer").get("root", "");
    return import_node_path.default.resolve(configured || import_coc.workspace.rootPath || import_coc.workspace.cwd);
  }
  shouldShow(name) {
    const config = import_coc.workspace.getConfiguration("coc-explorer");
    if (!config.get("showHidden", true) && name.startsWith("."))
      return false;
    return !config.get("exclude", []).includes(name);
  }
};
var Explorer = class {
  constructor(ui, context) {
    this.ui = ui;
    const container = ui.registerViewContainer({
      id: "explorer",
      title: "Explorer",
      location: "primarySidebar"
    });
    this.tree = ui.createTreeView({
      id: "explorer.files",
      containerId: "explorer",
      title: "Explorer",
      treeDataProvider: this.provider,
      enableFilter: true
    });
    context.subscriptions.push(
      container,
      this.tree,
      this.provider,
      import_coc.commands.registerCommand(
        "coc-explorer.show",
        () => this.ui.showContainer("explorer")
      ),
      import_coc.commands.registerCommand("coc-explorer.refresh", () => this.refresh()),
      import_coc.commands.registerCommand(
        "coc-explorer.changeRoot",
        () => this.changeRoot()
      ),
      import_coc.commands.registerCommand("coc-explorer.reveal", () => this.reveal()),
      import_coc.commands.registerCommand(
        "coc-explorer.toggle",
        (node) => this.toggle(node)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.open",
        (node) => this.open(node)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.openSplit",
        (node) => this.open(node, "split")
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.openVsplit",
        (node) => this.open(node, "vsplit")
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.runSystem",
        (node) => this.runSystem(node)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.changeRootTo",
        (node) => this.changeRootTo(node)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.newFile",
        (node) => this.create(node, false)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.newFolder",
        (node) => this.create(node, true)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.rename",
        (node) => this.rename(node)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.delete",
        (node) => this.delete(node)
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.copyPath",
        (node) => this.copyPath(node)
      ),
      import_coc.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      import_coc.workspace.onDidChangeWorkspaceFolders(() => this.resetRoot())
    );
  }
  provider = new ExplorerProvider();
  tree;
  refreshTimer;
  async show() {
    await this.ui.showContainer("explorer");
  }
  async reveal() {
    const document = await import_coc.workspace.document;
    const uri = import_coc.Uri.parse(document.textDocument.uri);
    if (uri.scheme !== "file") {
      await this.show();
      return;
    }
    const filename = uri.fsPath;
    if (!this.isWithinRoot(filename))
      this.provider.setRoot(import_node_path.default.dirname(filename));
    await this.ui.showView("explorer.files", { focus: true });
    await this.tree.reveal(this.nodeFor(filename), { focus: true, expand: 2 });
  }
  dispose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.tree.dispose();
  }
  async open(node, split) {
    if (!node || node.directory) return;
    if (split)
      await import_coc.workspace.nvim.command(`${split} ${fnameescape(node.path)}`);
    else await this.ui.openLocation(import_coc.Uri.file(node.path).toString(), 0, 0);
  }
  async toggle(node) {
    if (!node?.directory) return;
    await this.ui.toggleTreeItem("explorer.files");
  }
  async changeRoot() {
    const root = await import_coc.window.requestInput(
      "Explorer root",
      this.provider.getRoot()
    );
    if (!root) return;
    this.provider.setRoot(import_node_path.default.resolve(root));
    await this.show();
  }
  async changeRootTo(node) {
    if (!node?.directory) return;
    this.provider.setRoot(node.path);
    await this.show();
  }
  async create(node, directory) {
    if (!node) return;
    const parent = node.directory ? node.path : import_node_path.default.dirname(node.path);
    const name = await import_coc.window.requestInput(
      `${directory ? "New folder" : "New file"} in ${parent}`,
      ""
    );
    if (!name) return;
    const target = import_node_path.default.isAbsolute(name) ? name : import_node_path.default.join(parent, name);
    if (directory) await import_node_fs.promises.mkdir(target, { recursive: true });
    else {
      await import_node_fs.promises.mkdir(import_node_path.default.dirname(target), { recursive: true });
      await import_node_fs.promises.writeFile(target, "", { flag: "wx" });
    }
    this.provider.refresh(node.directory ? node : node.parent);
    if (!directory)
      await this.ui.openLocation(import_coc.Uri.file(target).toString(), 0, 0);
  }
  async rename(node) {
    if (!node) return;
    const name = await import_coc.window.requestInput("Rename", import_node_path.default.basename(node.path));
    if (!name) return;
    const target = import_node_path.default.isAbsolute(name) ? name : import_node_path.default.join(import_node_path.default.dirname(node.path), name);
    if (target === node.path) return;
    await import_node_fs.promises.rename(node.path, target);
    this.provider.refresh(node.parent);
  }
  async delete(node) {
    if (!node) return;
    const answer = await import_coc.window.showWarningMessage(
      `Delete ${node.path}?`,
      "Delete"
    );
    if (answer !== "Delete") return;
    await import_node_fs.promises.rm(node.path, { recursive: node.directory });
    this.provider.refresh(node.parent);
  }
  async copyPath(node) {
    if (!node) return;
    await import_coc.workspace.nvim.call("setreg", ["+", node.path]);
  }
  async runSystem(node) {
    if (!node) return;
    const command = await import_coc.window.requestInput("Run command", "");
    if (!command) return;
    await import_coc.window.runTerminalCommand(
      command,
      node.directory ? node.path : import_node_path.default.dirname(node.path)
    );
  }
  refresh() {
    this.provider.refresh();
  }
  scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 100);
  }
  resetRoot() {
    this.provider.setRoot(import_node_path.default.resolve(import_coc.workspace.rootPath || import_coc.workspace.cwd));
  }
  isWithinRoot(filename) {
    return filename === this.provider.getRoot() || filename.startsWith(`${this.provider.getRoot()}${import_node_path.default.sep}`);
  }
  nodeFor(filename) {
    const parts = import_node_path.default.relative(this.provider.getRoot(), filename).split(import_node_path.default.sep);
    let parent;
    let current = this.provider.getRoot();
    for (const part of parts) {
      current = import_node_path.default.join(current, part);
      parent = { path: current, parent, directory: current !== filename };
    }
    return parent ?? { path: filename, directory: false };
  }
};
function fnameescape(filename) {
  return filename.replace(/([\\\s|"'])/g, "\\$1");
}
async function activate(context) {
  const extension = import_coc.extensions.getExtensionById("@statiolake/coc-ui");
  if (!extension?.exports) {
    throw new Error("@statiolake/coc-ui must be activated before coc-explorer");
  }
  const ui = extension.exports;
  context.subscriptions.push(new Explorer(ui, context));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate
});
//# sourceMappingURL=index.js.map

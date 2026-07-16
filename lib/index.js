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
  expanded = /* @__PURE__ */ new Set();
  root;
  constructor() {
    this.root = this.configuredRoot();
  }
  getRoot() {
    return this.root;
  }
  setRoot(root) {
    this.root = root;
    this.expanded.clear();
    this.refresh();
  }
  setExpanded(node, expanded) {
    if (expanded) this.expanded.add(node.path);
    else this.expanded.delete(node.path);
    this.refresh(node);
  }
  refresh(node) {
    this.changeEmitter.fire(node);
  }
  getTreeItem(node) {
    const expanded = this.expanded.has(node.path);
    const item = new import_coc.TreeItem(
      import_coc.Uri.file(node.path),
      node.directory ? expanded ? import_coc.TreeItemCollapsibleState.Expanded : import_coc.TreeItemCollapsibleState.Collapsed : import_coc.TreeItemCollapsibleState.None
    );
    item.id = node.path;
    if (node.directory) {
      const config = import_coc.workspace.getConfiguration("coc-explorer");
      item.icon = {
        text: config.get(
          expanded ? "icons.folderOpen" : "icons.folderClosed",
          expanded ? "\uF07C" : "\uF07B"
        ),
        hlGroup: "Directory"
      };
    }
    item.command = {
      command: node.directory ? "coc-explorer.toggle" : "coc-explorer.open",
      title: node.directory ? "Expand or Collapse" : "Open",
      arguments: [node]
    };
    return item;
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
      icon: "\u{F024B}",
      location: "primarySidebar",
      order: 1
    });
    const view = ui.registerView({
      id: "explorer.files",
      containerId: "explorer",
      name: "Explorer",
      order: 1
    });
    this.tree = ui.createTreeView("explorer.files", {
      treeDataProvider: this.provider,
      enableFilter: true,
      actions: this.viewActions()
    });
    context.subscriptions.push(
      container,
      view,
      this.tree,
      this.provider,
      this.tree.onDidExpandElement(
        ({ element }) => this.provider.setExpanded(element, true)
      ),
      this.tree.onDidCollapseElement(
        ({ element }) => this.provider.setExpanded(element, false)
      ),
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
        "coc-explorer.openTab",
        (node) => this.open(node, "tabedit")
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
        "coc-explorer.create",
        (node) => this.createFromInput(node)
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
        "coc-explorer.cut",
        (node) => this.stage(node, "cut")
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.copy",
        (node) => this.stage(node, "copy")
      ),
      import_coc.commands.registerCommand(
        "coc-explorer.paste",
        (node) => this.paste(node)
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
  clipboard;
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
  async activate(node) {
    if (node.directory) await this.toggle(node);
    else await this.open(node);
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
  async createFromInput(node) {
    if (!node) return;
    const parent = node.directory ? node.path : import_node_path.default.dirname(node.path);
    const name = await import_coc.window.requestInput(`Create in ${parent}`, "");
    if (!name) return;
    const directory = name.endsWith(import_node_path.default.sep);
    const normalized = directory ? name.slice(0, -import_node_path.default.sep.length) : name;
    if (!normalized) return;
    const target = import_node_path.default.isAbsolute(normalized) ? normalized : import_node_path.default.join(parent, normalized);
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
    this.clearClipboardWithin(node.path);
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
    this.clearClipboardWithin(node.path);
    this.provider.refresh(node.parent);
  }
  stage(node, operation) {
    if (!node) return;
    this.clipboard = {
      operation,
      source: node.path,
      directory: node.directory
    };
    import_coc.window.showInformationMessage(
      `${operation === "copy" ? "Copied" : "Cut"} ${node.path}`
    );
  }
  async paste(node) {
    if (!node) return;
    const entry = this.clipboard;
    if (!entry) {
      import_coc.window.showWarningMessage("Explorer clipboard is empty");
      return;
    }
    const destination = node.directory ? node.path : import_node_path.default.dirname(node.path);
    const target = import_node_path.default.join(destination, import_node_path.default.basename(entry.source));
    if (target === entry.source) {
      import_coc.window.showWarningMessage("Source and destination are the same");
      return;
    }
    if (entry.directory && isWithin(target, entry.source)) {
      import_coc.window.showWarningMessage("Cannot paste a directory inside itself");
      return;
    }
    try {
      await import_node_fs.promises.lstat(entry.source);
    } catch {
      this.clipboard = void 0;
      import_coc.window.showWarningMessage(`Source no longer exists: ${entry.source}`);
      return;
    }
    const replace = await pathExists(target);
    if (replace) {
      const answer = await import_coc.window.showWarningMessage(
        `Replace ${target}?`,
        "Replace"
      );
      if (answer !== "Replace") return;
    }
    await writeReplacing(target, replace, async () => {
      if (entry.operation === "copy") {
        await import_node_fs.promises.cp(entry.source, target, {
          recursive: entry.directory,
          errorOnExist: true,
          force: false
        });
      } else {
        await move(entry.source, target, entry.directory);
      }
    });
    if (entry.operation === "cut") this.clipboard = void 0;
    this.provider.refresh();
  }
  clearClipboardWithin(parent) {
    if (this.clipboard && isWithin(this.clipboard.source, parent)) {
      this.clipboard = void 0;
    }
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
  async changeRootToParent() {
    const root = this.provider.getRoot();
    const parent = import_node_path.default.dirname(root);
    if (parent === root) return;
    this.provider.setRoot(parent);
    await this.show();
  }
  async focusParent(node) {
    if (!node.parent) return;
    await this.tree.reveal(node.parent, { focus: true });
  }
  viewActions() {
    const file = (node) => !node.directory;
    const directory = (node) => node.directory;
    return [
      {
        id: "coc-explorer.activate",
        title: "Open / Toggle",
        keys: ["o"],
        handler: (node) => this.activate(node)
      },
      {
        id: "coc-explorer.openSplit",
        title: "Open in Split",
        keys: ["<C-x>"],
        when: file,
        handler: (node) => this.open(node, "split")
      },
      {
        id: "coc-explorer.openVsplit",
        title: "Open in Vertical Split",
        keys: ["<C-v>"],
        when: file,
        handler: (node) => this.open(node, "vsplit")
      },
      {
        id: "coc-explorer.openTab",
        title: "Open in New Tab",
        keys: ["<C-t>"],
        when: file,
        handler: (node) => this.open(node, "tabedit")
      },
      {
        id: "coc-explorer.changeRootTo",
        title: "Set as Root",
        keys: ["+", "<C-CR>"],
        when: directory,
        handler: (node) => this.changeRootTo(node)
      },
      {
        id: "coc-explorer.changeRootToParent",
        title: "Root Up",
        keys: ["-"],
        handler: () => this.changeRootToParent()
      },
      {
        id: "coc-explorer.focusParent",
        title: "Focus Parent",
        keys: ["<BS>", "P"],
        when: (node) => Boolean(node.parent),
        handler: (node) => this.focusParent(node)
      },
      {
        id: "coc-explorer.create",
        title: "Create",
        keys: ["a"],
        handler: (node) => this.createFromInput(node)
      },
      {
        id: "coc-explorer.rename",
        title: "Rename",
        keys: ["r"],
        handler: (node) => this.rename(node)
      },
      {
        id: "coc-explorer.cut",
        title: "Cut",
        keys: ["x"],
        handler: (node) => this.stage(node, "cut")
      },
      {
        id: "coc-explorer.copy",
        title: "Copy",
        keys: ["y"],
        handler: (node) => this.stage(node, "copy")
      },
      {
        id: "coc-explorer.paste",
        title: "Paste",
        keys: ["p"],
        handler: (node) => this.paste(node)
      },
      {
        id: "coc-explorer.delete",
        title: "Delete",
        keys: ["d"],
        handler: (node) => this.delete(node)
      },
      {
        id: "coc-explorer.copyPath",
        title: "Copy Absolute Path",
        keys: ["gy"],
        handler: (node) => this.copyPath(node)
      },
      {
        id: "coc-explorer.runSystem",
        title: "Run System Command",
        keys: [".", "s"],
        handler: (node) => this.runSystem(node)
      },
      {
        id: "coc-explorer.refresh",
        title: "Refresh",
        keys: ["R"],
        handler: () => this.refresh()
      }
    ];
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
function isWithin(filename, parent) {
  const relative = import_node_path.default.relative(parent, filename);
  return relative === "" || relative !== ".." && !relative.startsWith(`..${import_node_path.default.sep}`) && !import_node_path.default.isAbsolute(relative);
}
async function pathExists(filename) {
  try {
    await import_node_fs.promises.lstat(filename);
    return true;
  } catch {
    return false;
  }
}
async function writeReplacing(target, replace, write) {
  if (!replace) {
    await write();
    return;
  }
  const backup = import_node_path.default.join(
    import_node_path.default.dirname(target),
    `.coc-explorer-${import_node_path.default.basename(target)}-${process.pid}-${Date.now()}`
  );
  await import_node_fs.promises.rename(target, backup);
  try {
    await write();
  } catch (error) {
    await import_node_fs.promises.rm(target, { recursive: true, force: true });
    await import_node_fs.promises.rename(backup, target);
    throw error;
  }
  await import_node_fs.promises.rm(backup, { recursive: true, force: true });
}
async function move(source, target, directory) {
  try {
    await import_node_fs.promises.rename(source, target);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await import_node_fs.promises.cp(source, target, {
      recursive: directory,
      errorOnExist: true,
      force: false
    });
    await import_node_fs.promises.rm(source, { recursive: directory });
  }
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

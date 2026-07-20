import { promises as fs } from "node:fs";
import path from "node:path";
import {
  commands,
  Disposable,
  Event,
  Emitter,
  ExtensionContext,
  extensions,
  TreeItem,
  TreeItemCollapsibleState,
  TreeView,
  TreeDataProvider,
  Uri,
  window,
  workspace,
} from "coc.nvim";
import type { CocUiApi, ViewAction } from "@statiolake/coc-ui";

type ExplorerNode = {
  path: string;
  parent?: ExplorerNode;
  directory: boolean;
};

type ClipboardEntry = {
  operation: "copy" | "cut";
  source: string;
  directory: boolean;
};

class ExplorerProvider implements TreeDataProvider<ExplorerNode>, Disposable {
  private readonly changeEmitter = new Emitter<ExplorerNode | undefined>();
  readonly onDidChangeTreeData: Event<ExplorerNode | undefined> =
    this.changeEmitter.event;
  private readonly expanded = new Set<string>();
  private root: string;

  constructor() {
    this.root = this.configuredRoot();
  }

  getRoot(): string {
    return this.root;
  }

  setRoot(root: string): void {
    this.root = root;
    this.expanded.clear();
    this.refresh();
  }

  setExpanded(node: ExplorerNode, expanded: boolean): void {
    if (expanded) this.expanded.add(node.path);
    else this.expanded.delete(node.path);
    this.refresh(node);
  }

  refresh(node?: ExplorerNode): void {
    this.changeEmitter.fire(node);
  }

  getTreeItem(node: ExplorerNode): TreeItem {
    const expanded = this.expanded.has(node.path);
    const item = new TreeItem(
      Uri.file(node.path),
      node.directory
        ? expanded
          ? TreeItemCollapsibleState.Expanded
          : TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None,
    );
    item.id = node.path;
    if (node.directory) {
      const config = workspace.getConfiguration("explorer");
      item.icon = {
        text: config.get<string>(
          expanded ? "icons.folderOpen" : "icons.folderClosed",
          expanded ? "" : "",
        ),
        hlGroup: "Directory",
      };
    }
    item.command = {
      command: node.directory ? "explorer.toggle" : "explorer.open",
      title: node.directory ? "Expand or Collapse" : "Open",
      arguments: [node],
    };
    return item;
  }

  async getChildren(node?: ExplorerNode): Promise<ExplorerNode[]> {
    const parent = node ?? { path: this.root, directory: true };
    if (!parent.directory) return [];

    try {
      const entries = await fs.readdir(parent.path, { withFileTypes: true });
      return entries
        .filter((entry) => this.shouldShow(entry.name))
        .map((entry) => ({
          path: path.join(parent.path, entry.name),
          parent: node,
          directory: entry.isDirectory(),
        }))
        .sort((left, right) => {
          if (left.directory !== right.directory)
            return left.directory ? -1 : 1;
          return path
            .basename(left.path)
            .localeCompare(path.basename(right.path));
        });
    } catch (error) {
      window.showWarningMessage(
        `Explorer cannot read ${parent.path}: ${String(error)}`,
      );
      return [];
    }
  }

  getParent(node: ExplorerNode): ExplorerNode | undefined {
    return node.parent;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private configuredRoot(): string {
    const configured = workspace
      .getConfiguration("explorer")
      .get<string>("root", "");
    return path.resolve(configured || workspace.rootPath || workspace.cwd);
  }

  private shouldShow(name: string): boolean {
    const config = workspace.getConfiguration("explorer");
    if (!config.get<boolean>("showHidden", true) && name.startsWith("."))
      return false;
    return !config.get<string[]>("exclude", []).includes(name);
  }
}

class Explorer implements Disposable {
  private readonly provider = new ExplorerProvider();
  private readonly tree: TreeView<ExplorerNode>;
  private clipboard: ClipboardEntry | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly ui: CocUiApi,
    context: ExtensionContext,
  ) {
    const container = ui.registerViewContainer({
      id: "explorer",
      title: "Explorer",
      icon: "󰉋",
      location: "primarySidebar",
      order: 1,
    });
    const view = ui.registerView({
      id: "explorer.files",
      containerId: "explorer",
      name: "Explorer",
      order: 1,
    });
    this.tree = ui.createTreeView("explorer.files", {
      treeDataProvider: this.provider,
      enableFilter: true,
      actions: this.viewActions(),
    });

    context.subscriptions.push(
      container,
      view,
      this.tree,
      this.provider,
      this.tree.onDidExpandElement(({ element }) =>
        this.provider.setExpanded(element, true),
      ),
      this.tree.onDidCollapseElement(({ element }) =>
        this.provider.setExpanded(element, false),
      ),
      commands.registerCommand("explorer.show", () =>
        this.ui.showContainer("explorer"),
      ),
      commands.registerCommand("explorer.refresh", () => this.refresh()),
      commands.registerCommand("explorer.changeRoot", () =>
        this.changeRoot(),
      ),
      commands.registerCommand("explorer.reveal", () => this.reveal()),
      commands.registerCommand("explorer.toggle", (node: ExplorerNode) =>
        this.toggle(node),
      ),
      commands.registerCommand("explorer.open", (node: ExplorerNode) =>
        this.open(node),
      ),
      commands.registerCommand("explorer.openSplit", (node: ExplorerNode) =>
        this.open(node, "split"),
      ),
      commands.registerCommand(
        "explorer.openVsplit",
        (node: ExplorerNode) => this.open(node, "vsplit"),
      ),
      commands.registerCommand("explorer.openTab", (node: ExplorerNode) =>
        this.open(node, "tabedit"),
      ),
      commands.registerCommand("explorer.runSystem", (node: ExplorerNode) =>
        this.runSystem(node),
      ),
      commands.registerCommand(
        "explorer.changeRootTo",
        (node: ExplorerNode) => this.changeRootTo(node),
      ),
      commands.registerCommand("explorer.newFile", (node: ExplorerNode) =>
        this.create(node, false),
      ),
      commands.registerCommand("explorer.newFolder", (node: ExplorerNode) =>
        this.create(node, true),
      ),
      commands.registerCommand("explorer.create", (node: ExplorerNode) =>
        this.createFromInput(node),
      ),
      commands.registerCommand("explorer.rename", (node: ExplorerNode) =>
        this.rename(node),
      ),
      commands.registerCommand("explorer.delete", (node: ExplorerNode) =>
        this.delete(node),
      ),
      commands.registerCommand("explorer.cut", (node: ExplorerNode) =>
        this.stage(node, "cut"),
      ),
      commands.registerCommand("explorer.copy", (node: ExplorerNode) =>
        this.stage(node, "copy"),
      ),
      commands.registerCommand("explorer.paste", (node: ExplorerNode) =>
        this.paste(node),
      ),
      commands.registerCommand("explorer.copyPath", (node: ExplorerNode) =>
        this.copyPath(node),
      ),
      workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      workspace.onDidChangeWorkspaceFolders(() => this.resetRoot()),
    );
  }

  async show(): Promise<void> {
    await this.ui.showContainer("explorer");
  }

  async reveal(): Promise<void> {
    const document = await workspace.document;
    const uri = Uri.parse(document.textDocument.uri);
    if (uri.scheme !== "file") {
      await this.show();
      return;
    }

    const filename = uri.fsPath;
    if (!this.isWithinRoot(filename))
      this.provider.setRoot(path.dirname(filename));
    await this.ui.showView("explorer.files", { focus: true });
    await this.tree.reveal(this.nodeFor(filename), { focus: true, expand: 2 });
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.tree.dispose();
  }

  private async open(
    node: ExplorerNode,
    split?: "split" | "vsplit" | "tabedit",
  ): Promise<void> {
    if (!node || node.directory) return;
    if (split)
      await workspace.nvim.command(`${split} ${fnameescape(node.path)}`);
    else await this.ui.openLocation(Uri.file(node.path).toString(), 0, 0);
  }

  private async toggle(node: ExplorerNode): Promise<void> {
    if (!node?.directory) return;
    await this.ui.toggleTreeItem("explorer.files");
  }

  private async activate(node: ExplorerNode): Promise<void> {
    if (node.directory) await this.toggle(node);
    else await this.open(node);
  }

  private async changeRoot(): Promise<void> {
    const root = await window.requestInput(
      "Explorer root",
      this.provider.getRoot(),
    );
    if (!root) return;
    this.provider.setRoot(path.resolve(root));
    await this.show();
  }

  private async changeRootTo(node: ExplorerNode): Promise<void> {
    if (!node?.directory) return;
    this.provider.setRoot(node.path);
    await this.show();
  }

  private async create(node: ExplorerNode, directory: boolean): Promise<void> {
    if (!node) return;
    const parent = node.directory ? node.path : path.dirname(node.path);
    const name = await window.requestInput(
      `${directory ? "New folder" : "New file"} in ${parent}`,
      "",
    );
    if (!name) return;
    const target = path.isAbsolute(name) ? name : path.join(parent, name);

    if (directory) await fs.mkdir(target, { recursive: true });
    else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "", { flag: "wx" });
    }
    this.provider.refresh(node.directory ? node : node.parent);
    if (!directory)
      await this.ui.openLocation(Uri.file(target).toString(), 0, 0);
  }

  private async createFromInput(node: ExplorerNode): Promise<void> {
    if (!node) return;
    const parent = node.directory ? node.path : path.dirname(node.path);
    const name = await window.requestInput(`Create in ${parent}`, "");
    if (!name) return;
    const directory = name.endsWith(path.sep);
    const normalized = directory ? name.slice(0, -path.sep.length) : name;
    if (!normalized) return;
    const target = path.isAbsolute(normalized)
      ? normalized
      : path.join(parent, normalized);

    if (directory) await fs.mkdir(target, { recursive: true });
    else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "", { flag: "wx" });
    }
    this.provider.refresh(node.directory ? node : node.parent);
    if (!directory)
      await this.ui.openLocation(Uri.file(target).toString(), 0, 0);
  }

  private async rename(node: ExplorerNode): Promise<void> {
    if (!node) return;
    const name = await window.requestInput("Rename", path.basename(node.path));
    if (!name) return;
    const target = path.isAbsolute(name)
      ? name
      : path.join(path.dirname(node.path), name);
    if (target === node.path) return;
    await fs.rename(node.path, target);
    this.clearClipboardWithin(node.path);
    this.provider.refresh(node.parent);
  }

  private async delete(node: ExplorerNode): Promise<void> {
    if (!node) return;
    const answer = await window.showWarningMessage(
      `Delete ${node.path}?`,
      "Delete",
    );
    if (answer !== "Delete") return;
    await fs.rm(node.path, { recursive: node.directory });
    this.clearClipboardWithin(node.path);
    this.provider.refresh(node.parent);
  }

  private stage(node: ExplorerNode, operation: "copy" | "cut"): void {
    if (!node) return;
    this.clipboard = {
      operation,
      source: node.path,
      directory: node.directory,
    };
    window.showInformationMessage(
      `${operation === "copy" ? "Copied" : "Cut"} ${node.path}`,
    );
  }

  private async paste(node: ExplorerNode): Promise<void> {
    if (!node) return;
    const entry = this.clipboard;
    if (!entry) {
      window.showWarningMessage("Explorer clipboard is empty");
      return;
    }

    const destination = node.directory ? node.path : path.dirname(node.path);
    const target = path.join(destination, path.basename(entry.source));
    if (target === entry.source) {
      window.showWarningMessage("Source and destination are the same");
      return;
    }
    if (entry.directory && isWithin(target, entry.source)) {
      window.showWarningMessage("Cannot paste a directory inside itself");
      return;
    }

    try {
      await fs.lstat(entry.source);
    } catch {
      this.clipboard = undefined;
      window.showWarningMessage(`Source no longer exists: ${entry.source}`);
      return;
    }

    const replace = await pathExists(target);
    if (replace) {
      const answer = await window.showWarningMessage(
        `Replace ${target}?`,
        "Replace",
      );
      if (answer !== "Replace") return;
    }

    await writeReplacing(target, replace, async () => {
      if (entry.operation === "copy") {
        await fs.cp(entry.source, target, {
          recursive: entry.directory,
          errorOnExist: true,
          force: false,
        });
      } else {
        await move(entry.source, target, entry.directory);
      }
    });
    if (entry.operation === "cut") this.clipboard = undefined;
    this.provider.refresh();
  }

  private clearClipboardWithin(parent: string): void {
    if (this.clipboard && isWithin(this.clipboard.source, parent)) {
      this.clipboard = undefined;
    }
  }

  private async copyPath(node: ExplorerNode): Promise<void> {
    if (!node) return;
    await workspace.nvim.call("setreg", ["+", node.path]);
  }

  private async runSystem(node: ExplorerNode): Promise<void> {
    if (!node) return;
    const command = await window.requestInput("Run command", "");
    if (!command) return;
    await window.runTerminalCommand(
      command,
      node.directory ? node.path : path.dirname(node.path),
    );
  }

  private refresh(): void {
    this.provider.refresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 100);
  }

  private resetRoot(): void {
    this.provider.setRoot(path.resolve(workspace.rootPath || workspace.cwd));
  }

  private async changeRootToParent(): Promise<void> {
    const root = this.provider.getRoot();
    const parent = path.dirname(root);
    if (parent === root) return;
    this.provider.setRoot(parent);
    await this.show();
  }

  private async focusParent(node: ExplorerNode): Promise<void> {
    if (!node.parent) return;
    await this.tree.reveal(node.parent, { focus: true });
  }

  private viewActions(): ViewAction<ExplorerNode>[] {
    const file = (node: ExplorerNode) => !node.directory;
    const directory = (node: ExplorerNode) => node.directory;
    return [
      {
        id: "explorer.activate",
        title: "Open / Toggle",
        keys: ["o"],
        handler: (node) => this.activate(node),
      },
      {
        id: "explorer.openSplit",
        title: "Open in Split",
        keys: ["<C-x>"],
        when: file,
        handler: (node) => this.open(node, "split"),
      },
      {
        id: "explorer.openVsplit",
        title: "Open in Vertical Split",
        keys: ["<C-v>"],
        when: file,
        handler: (node) => this.open(node, "vsplit"),
      },
      {
        id: "explorer.openTab",
        title: "Open in New Tab",
        keys: ["<C-t>"],
        when: file,
        handler: (node) => this.open(node, "tabedit"),
      },
      {
        id: "explorer.changeRootTo",
        title: "Set as Root",
        keys: ["+", "<C-CR>"],
        when: directory,
        handler: (node) => this.changeRootTo(node),
      },
      {
        id: "explorer.changeRootToParent",
        title: "Root Up",
        keys: ["-"],
        handler: () => this.changeRootToParent(),
      },
      {
        id: "explorer.focusParent",
        title: "Focus Parent",
        keys: ["<BS>", "P"],
        when: (node) => Boolean(node.parent),
        handler: (node) => this.focusParent(node),
      },
      {
        id: "explorer.create",
        title: "Create",
        keys: ["a"],
        handler: (node) => this.createFromInput(node),
      },
      {
        id: "explorer.rename",
        title: "Rename",
        keys: ["r"],
        handler: (node) => this.rename(node),
      },
      {
        id: "explorer.cut",
        title: "Cut",
        keys: ["x"],
        handler: (node) => this.stage(node, "cut"),
      },
      {
        id: "explorer.copy",
        title: "Copy",
        keys: ["y"],
        handler: (node) => this.stage(node, "copy"),
      },
      {
        id: "explorer.paste",
        title: "Paste",
        keys: ["p"],
        handler: (node) => this.paste(node),
      },
      {
        id: "explorer.delete",
        title: "Delete",
        keys: ["d"],
        handler: (node) => this.delete(node),
      },
      {
        id: "explorer.copyPath",
        title: "Copy Absolute Path",
        keys: ["gy"],
        handler: (node) => this.copyPath(node),
      },
      {
        id: "explorer.runSystem",
        title: "Run System Command",
        keys: [".", "s"],
        handler: (node) => this.runSystem(node),
      },
      {
        id: "explorer.refresh",
        title: "Refresh",
        keys: ["R"],
        handler: () => this.refresh(),
      },
    ];
  }

  private isWithinRoot(filename: string): boolean {
    return (
      filename === this.provider.getRoot() ||
      filename.startsWith(`${this.provider.getRoot()}${path.sep}`)
    );
  }

  private nodeFor(filename: string): ExplorerNode {
    const parts = path
      .relative(this.provider.getRoot(), filename)
      .split(path.sep);
    let parent: ExplorerNode | undefined;
    let current = this.provider.getRoot();
    for (const part of parts) {
      current = path.join(current, part);
      parent = { path: current, parent, directory: current !== filename };
    }
    return parent ?? { path: filename, directory: false };
  }
}

function fnameescape(filename: string): string {
  return filename.replace(/([\\\s|"'])/g, "\\$1");
}

function isWithin(filename: string, parent: string): boolean {
  const relative = path.relative(parent, filename);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function pathExists(filename: string): Promise<boolean> {
  try {
    await fs.lstat(filename);
    return true;
  } catch {
    return false;
  }
}

async function writeReplacing(
  target: string,
  replace: boolean,
  write: () => Promise<void>,
): Promise<void> {
  if (!replace) {
    await write();
    return;
  }

  const backup = path.join(
    path.dirname(target),
    `.coc-explorer-${path.basename(target)}-${process.pid}-${Date.now()}`,
  );
  await fs.rename(target, backup);
  try {
    await write();
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(backup, target);
    throw error;
  }
  await fs.rm(backup, { recursive: true, force: true });
}

async function move(
  source: string,
  target: string,
  directory: boolean,
): Promise<void> {
  try {
    await fs.rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.cp(source, target, {
      recursive: directory,
      errorOnExist: true,
      force: false,
    });
    await fs.rm(source, { recursive: directory });
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  const extension = extensions.getExtensionById<CocUiApi>("@statiolake/coc-ui");
  if (!extension?.exports) {
    throw new Error("@statiolake/coc-ui must be activated before coc-explorer");
  }
  const ui = extension.exports;
  context.subscriptions.push(new Explorer(ui, context));
}

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
  TreeItemAction,
  TreeItemCollapsibleState,
  TreeView,
  TreeDataProvider,
  Uri,
  window,
  workspace,
} from "coc.nvim";
import type { CocUiApi } from "@statiolake/coc-ui";

type ExplorerNode = {
  path: string;
  parent?: ExplorerNode;
  directory: boolean;
};

class ExplorerProvider implements TreeDataProvider<ExplorerNode>, Disposable {
  private readonly changeEmitter = new Emitter<ExplorerNode | undefined>();
  readonly onDidChangeTreeData: Event<ExplorerNode | undefined> =
    this.changeEmitter.event;
  private root: string;

  constructor() {
    this.root = this.configuredRoot();
  }

  getRoot(): string {
    return this.root;
  }

  setRoot(root: string): void {
    this.root = root;
    this.refresh();
  }

  refresh(node?: ExplorerNode): void {
    this.changeEmitter.fire(node);
  }

  getTreeItem(node: ExplorerNode): TreeItem {
    const item = new TreeItem(
      Uri.file(node.path),
      node.directory
        ? TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None,
    );
    item.id = node.path;
    item.tooltip = node.path;
    item.command = {
      command: node.directory ? "coc-explorer.toggle" : "coc-explorer.open",
      title: node.directory ? "Expand or Collapse" : "Open",
      arguments: [node],
    };
    return item;
  }

  resolveActions(
    _item: TreeItem,
    node: ExplorerNode,
  ): TreeItemAction<ExplorerNode>[] {
    const action = (
      title: string,
      command: string,
    ): TreeItemAction<ExplorerNode> => ({
      title,
      handler: () => commands.executeCommand(command, node),
    });

    const actions = node.directory
      ? [
          action("Expand / Collapse", "coc-explorer.toggle"),
          action("Set as Root", "coc-explorer.changeRootTo"),
          action("New File", "coc-explorer.newFile"),
          action("New Folder", "coc-explorer.newFolder"),
        ]
      : [
          action("Open", "coc-explorer.open"),
          action("Open in Split", "coc-explorer.openSplit"),
          action("Open in Vertical Split", "coc-explorer.openVsplit"),
        ];

    actions.push(
      action("Rename", "coc-explorer.rename"),
      action("Delete", "coc-explorer.delete"),
      action("Copy Path", "coc-explorer.copyPath"),
      action("Run System Command", "coc-explorer.runSystem"),
      action("Refresh", "coc-explorer.refresh"),
    );
    return actions;
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
      .getConfiguration("coc-explorer")
      .get<string>("root", "");
    return path.resolve(configured || workspace.rootPath || workspace.cwd);
  }

  private shouldShow(name: string): boolean {
    const config = workspace.getConfiguration("coc-explorer");
    if (!config.get<boolean>("showHidden", true) && name.startsWith("."))
      return false;
    return !config.get<string[]>("exclude", []).includes(name);
  }
}

class Explorer implements Disposable {
  private readonly provider = new ExplorerProvider();
  private readonly tree: TreeView<ExplorerNode>;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly ui: CocUiApi,
    context: ExtensionContext,
  ) {
    const container = ui.registerViewContainer({
      id: "explorer",
      title: "Explorer",
      location: "primarySidebar",
    });
    this.tree = ui.createTreeView({
      id: "explorer.files",
      containerId: "explorer",
      title: "Explorer",
      treeDataProvider: this.provider,
      enableFilter: true,
    });

    context.subscriptions.push(
      container,
      this.tree,
      this.provider,
      commands.registerCommand("coc-explorer.show", () =>
        this.ui.showContainer("explorer"),
      ),
      commands.registerCommand("coc-explorer.refresh", () => this.refresh()),
      commands.registerCommand("coc-explorer.changeRoot", () =>
        this.changeRoot(),
      ),
      commands.registerCommand("coc-explorer.reveal", () => this.reveal()),
      commands.registerCommand("coc-explorer.toggle", (node: ExplorerNode) =>
        this.toggle(node),
      ),
      commands.registerCommand("coc-explorer.open", (node: ExplorerNode) =>
        this.open(node),
      ),
      commands.registerCommand("coc-explorer.openSplit", (node: ExplorerNode) =>
        this.open(node, "split"),
      ),
      commands.registerCommand(
        "coc-explorer.openVsplit",
        (node: ExplorerNode) => this.open(node, "vsplit"),
      ),
      commands.registerCommand("coc-explorer.runSystem", (node: ExplorerNode) =>
        this.runSystem(node),
      ),
      commands.registerCommand(
        "coc-explorer.changeRootTo",
        (node: ExplorerNode) => this.changeRootTo(node),
      ),
      commands.registerCommand("coc-explorer.newFile", (node: ExplorerNode) =>
        this.create(node, false),
      ),
      commands.registerCommand("coc-explorer.newFolder", (node: ExplorerNode) =>
        this.create(node, true),
      ),
      commands.registerCommand("coc-explorer.rename", (node: ExplorerNode) =>
        this.rename(node),
      ),
      commands.registerCommand("coc-explorer.delete", (node: ExplorerNode) =>
        this.delete(node),
      ),
      commands.registerCommand("coc-explorer.copyPath", (node: ExplorerNode) =>
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
    split?: "split" | "vsplit",
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

  private async rename(node: ExplorerNode): Promise<void> {
    if (!node) return;
    const name = await window.requestInput("Rename", path.basename(node.path));
    if (!name) return;
    const target = path.isAbsolute(name)
      ? name
      : path.join(path.dirname(node.path), name);
    if (target === node.path) return;
    await fs.rename(node.path, target);
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
    this.provider.refresh(node.parent);
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

export async function activate(context: ExtensionContext): Promise<void> {
  const extension = extensions.getExtensionById<CocUiApi>("@statiolake/coc-ui");
  if (!extension?.exports) {
    throw new Error("@statiolake/coc-ui must be activated before coc-explorer");
  }
  const ui = extension.exports;
  context.subscriptions.push(new Explorer(ui, context));
}

import { debounce, Notice, Plugin, TAbstractFile } from "obsidian";
import { BOARD_PATH, BoardStore } from "./store";
import { KanbanView, VIEW_TYPE_KANBAN } from "./view";

export default class VaultKanbanPlugin extends Plugin {
	store!: BoardStore;

	async onload(): Promise<void> {
		this.store = new BoardStore(this.app.vault);

		this.registerView(VIEW_TYPE_KANBAN, (leaf) => new KanbanView(leaf, this.store));

		this.addRibbonIcon("kanban", "Open kanban board", () => this.activateView());
		this.addCommand({
			id: "open-board",
			name: "Open board",
			callback: () => this.activateView(),
		});

		this.app.workspace.onLayoutReady(async () => {
			try {
				await this.store.load();
			} catch (e) {
				console.error(e);
				new Notice(`Kanban: could not read ${BOARD_PATH}`);
			}
			this.refreshViews();
		});

		// Pick up edits made outside the plugin (sync, manual edits of board.json).
		const onExternalChange = debounce(
			async () => {
				try {
					if (await this.store.reloadIfChanged()) this.refreshViews();
				} catch (e) {
					console.error(e);
				}
			},
			300,
			true
		);
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file.path === BOARD_PATH) onExternalChange();
			})
		);
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN)) {
			if (leaf.view instanceof KanbanView) leaf.view.render();
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_KANBAN)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_KANBAN, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}

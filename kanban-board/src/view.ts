import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { ItemModal } from "./modal";
import { BoardStore, KanbanItem, Status, STATUSES, STATUS_LABELS } from "./store";

export const VIEW_TYPE_KANBAN = "vault-kanban-board";

const DRAG_MIME = "application/x-vault-kanban-item";

export class KanbanView extends ItemView {
	private draggingId: string | null = null;
	private placeholder: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, private store: BoardStore) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_KANBAN;
	}

	getDisplayText(): string {
		return "Kanban";
	}

	getIcon(): string {
		return "kanban";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	render(): void {
		const root = this.contentEl;
		const scrollLeft = root.querySelector(".vault-kanban-board")?.scrollLeft ?? 0;
		root.empty();
		root.addClass("vault-kanban-view");

		const board = root.createDiv({ cls: "vault-kanban-board" });
		for (const status of STATUSES) {
			this.renderColumn(board, status);
		}
		board.scrollLeft = scrollLeft;
	}

	private async commit(): Promise<void> {
		this.render();
		try {
			await this.store.save();
		} catch (e) {
			console.error(e);
			new Notice("Kanban: failed to save board.json");
		}
	}

	private async archive(ids: string[]): Promise<void> {
		try {
			const count = await this.store.archive(ids);
			if (count > 0) new Notice(`Archived ${count} item${count === 1 ? "" : "s"}`);
		} catch (e) {
			console.error(e);
			new Notice("Kanban: archiving failed");
		}
		this.render();
	}

	private renderColumn(board: HTMLElement, status: Status): void {
		const items = this.store.itemsIn(status);
		const column = board.createDiv({ cls: "vault-kanban-column", attr: { "data-status": status } });

		const header = column.createDiv({ cls: "vault-kanban-column-header" });
		header.createSpan({ cls: "vault-kanban-dot" });
		header.createSpan({ cls: "vault-kanban-column-title", text: STATUS_LABELS[status] });
		header.createSpan({ cls: "vault-kanban-count", text: String(items.length) });
		header.createDiv({ cls: "vault-kanban-spacer" });

		const menuBtn = header.createDiv({ cls: "clickable-icon vault-kanban-column-menu", attr: { "aria-label": "Column actions" } });
		setIcon(menuBtn, "more-horizontal");
		menuBtn.addEventListener("click", (e) => {
			const menu = new Menu();
			menu.addItem((mi) => mi.setTitle("Add item").setIcon("plus").onClick(() => this.openNewItem(status)));
			if (status === "closed") {
				menu.addItem((mi) =>
					mi
						.setTitle("Archive all")
						.setIcon("archive")
						.setDisabled(items.length === 0)
						.onClick(() => this.archive(items.map((i) => i.id)))
				);
			}
			menu.showAtMouseEvent(e);
		});

		const list = column.createDiv({ cls: "vault-kanban-cards" });
		for (const item of items) {
			this.renderCard(list, item);
		}
		this.attachDropTarget(list, status);

		const add = column.createDiv({ cls: "vault-kanban-add" });
		setIcon(add.createSpan(), "plus");
		add.createSpan({ text: "Add item" });
		add.addEventListener("click", () => this.showInlineAdd(column, add, status));
	}

	private renderCard(list: HTMLElement, item: KanbanItem): void {
		const card = list.createDiv({ cls: "vault-kanban-card", attr: { draggable: "true", "data-id": item.id } });

		const top = card.createDiv({ cls: "vault-kanban-card-top" });
		const icon = top.createSpan({ cls: "vault-kanban-card-icon" });
		setIcon(icon, item.status === "closed" ? "check-circle-2" : "circle-dot");
		top.createDiv({ cls: "vault-kanban-card-title", text: item.title });

		const more = top.createDiv({ cls: "clickable-icon vault-kanban-card-menu", attr: { "aria-label": "Item actions" } });
		setIcon(more, "more-horizontal");
		more.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showCardMenu(item, e);
		});

		if (item.description.trim()) {
			card.createDiv({ cls: "vault-kanban-card-desc", text: item.description });
		}

		card.addEventListener("click", () => this.openEditItem(item));
		card.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showCardMenu(item, e);
		});

		card.addEventListener("dragstart", (e) => {
			this.draggingId = item.id;
			e.dataTransfer?.setData(DRAG_MIME, item.id);
			e.dataTransfer?.setData("text/plain", item.title);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			// Defer so the drag image is captured before the card is dimmed.
			window.setTimeout(() => card.addClass("is-dragging"), 0);
		});
		card.addEventListener("dragend", () => {
			this.draggingId = null;
			card.removeClass("is-dragging");
			this.removePlaceholder();
		});
	}

	private showCardMenu(item: KanbanItem, e: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((mi) => mi.setTitle("Edit").setIcon("pencil").onClick(() => this.openEditItem(item)));
		menu.addSeparator();
		for (const s of STATUSES) {
			if (s === item.status) continue;
			menu.addItem((mi) =>
				mi
					.setTitle(`Move to ${STATUS_LABELS[s]}`)
					.setIcon("arrow-right")
					.onClick(() => {
						this.store.move(item.id, s, null);
						this.commit();
					})
			);
		}
		menu.addSeparator();
		if (item.status === "closed") {
			menu.addItem((mi) => mi.setTitle("Archive").setIcon("archive").onClick(() => this.archive([item.id])));
		}
		menu.addItem((mi) =>
			mi
				.setTitle("Delete")
				.setIcon("trash")
				.onClick(() => {
					this.store.remove(item.id);
					this.commit();
				})
		);
		menu.showAtMouseEvent(e);
	}

	private attachDropTarget(list: HTMLElement, status: Status): void {
		const column = list.parentElement!;
		column.addEventListener("dragover", (e) => {
			if (!this.draggingId) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			column.addClass("is-drop-target");
			const before = this.cardAfterPointer(list, e.clientY);
			const ph = this.ensurePlaceholder();
			if (before) {
				if (ph.nextSibling !== before) list.insertBefore(ph, before);
			} else if (ph.parentElement !== list || ph.nextSibling) {
				list.appendChild(ph);
			}
		});
		column.addEventListener("dragleave", (e) => {
			if (!column.contains(e.relatedTarget as Node | null)) {
				column.removeClass("is-drop-target");
			}
		});
		column.addEventListener("drop", (e) => {
			const id = e.dataTransfer?.getData(DRAG_MIME) || this.draggingId;
			column.removeClass("is-drop-target");
			if (!id) return;
			e.preventDefault();
			const before = this.cardAfterPointer(list, e.clientY);
			this.removePlaceholder();
			this.store.move(id, status, before?.dataset.id ?? null);
			this.commit();
		});
	}

	/** First card (other than the one being dragged) whose vertical middle is below the pointer. */
	private cardAfterPointer(list: HTMLElement, y: number): HTMLElement | null {
		const cards = Array.from(list.querySelectorAll<HTMLElement>(".vault-kanban-card:not(.is-dragging)"));
		for (const card of cards) {
			const rect = card.getBoundingClientRect();
			if (y < rect.top + rect.height / 2) return card;
		}
		return null;
	}

	private ensurePlaceholder(): HTMLElement {
		if (!this.placeholder) {
			this.placeholder = createDiv({ cls: "vault-kanban-placeholder" });
		}
		return this.placeholder;
	}

	private removePlaceholder(): void {
		this.placeholder?.remove();
		this.contentEl.querySelectorAll(".is-drop-target").forEach((el) => el.removeClass("is-drop-target"));
	}

	private showInlineAdd(column: HTMLElement, addBtn: HTMLElement, status: Status): void {
		addBtn.hide();
		const wrap = column.createDiv({ cls: "vault-kanban-inline-add" });
		const input = wrap.createEl("input", { type: "text", attr: { placeholder: "Start typing to create a draft" } });
		input.focus();

		let done = false;
		const finish = (keepOpen: boolean) => {
			const title = input.value.trim();
			if (title) {
				this.store.add(title, "", status);
				this.commit().then(() => {
					if (keepOpen) {
						// Re-open the input in the freshly rendered column for quick multi-add.
						const col = this.contentEl.querySelector<HTMLElement>(`.vault-kanban-column[data-status="${status}"]`);
						const btn = col?.querySelector<HTMLElement>(".vault-kanban-add");
						if (col && btn) this.showInlineAdd(col, btn, status);
					}
				});
			} else {
				wrap.remove();
				addBtn.show();
			}
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.isComposing) {
				e.preventDefault();
				done = true;
				finish(true);
			} else if (e.key === "Escape") {
				done = true;
				wrap.remove();
				addBtn.show();
			}
		});
		input.addEventListener("blur", () => {
			if (!done) {
				done = true;
				finish(false);
			}
		});
	}

	private openNewItem(status: Status): void {
		new ItemModal(this.app, {
			status,
			onSubmit: ({ title, description, status }) => {
				this.store.add(title, description, status);
				this.commit();
			},
		}).open();
	}

	private openEditItem(item: KanbanItem): void {
		new ItemModal(this.app, {
			item,
			onSubmit: ({ title, description, status }) => {
				if (status !== item.status) this.store.move(item.id, status, null);
				this.store.update(item.id, { title, description });
				this.commit();
			},
			onDelete: () => {
				this.store.remove(item.id);
				this.commit();
			},
			onArchive: () => this.archive([item.id]),
		}).open();
	}
}

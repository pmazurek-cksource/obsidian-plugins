import { App, Modal, Setting } from "obsidian";
import { KanbanItem, Status, STATUSES, STATUS_LABELS } from "./store";

export interface ItemModalResult {
	title: string;
	description: string;
	status: Status;
}

export interface ItemModalOptions {
	item?: KanbanItem;
	status?: Status;
	onSubmit: (result: ItemModalResult) => void;
	onDelete?: () => void;
	onArchive?: () => void;
}

export class ItemModal extends Modal {
	private result: ItemModalResult;

	constructor(app: App, private options: ItemModalOptions) {
		super(app);
		const { item } = options;
		this.result = {
			title: item?.title ?? "",
			description: item?.description ?? "",
			status: item?.status ?? options.status ?? "todo",
		};
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.modalEl.addClass("vault-kanban-modal");
		this.titleEl.setText(options.item ? "Edit item" : "New item");

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.result.title).onChange((v) => (this.result.title = v));
			text.inputEl.addClass("vault-kanban-modal-title");
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					this.submit();
				}
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(contentEl).setName("Status").addDropdown((dd) => {
			for (const s of STATUSES) dd.addOption(s, STATUS_LABELS[s]);
			dd.setValue(this.result.status).onChange((v) => (this.result.status = v as Status));
		});

		const descSetting = new Setting(contentEl).setName("Description");
		descSetting.settingEl.addClass("vault-kanban-modal-desc");
		descSetting.addTextArea((ta) => {
			ta.setValue(this.result.description).onChange((v) => (this.result.description = v));
			ta.inputEl.rows = 8;
		});

		if (options.item) {
			const meta = contentEl.createDiv({ cls: "vault-kanban-modal-meta" });
			meta.setText(
				`Created ${new Date(options.item.createdAt).toLocaleString()} · Updated ${new Date(options.item.updatedAt).toLocaleString()}`
			);
		}

		const buttons = new Setting(contentEl);
		if (options.onDelete) {
			buttons.addButton((b) =>
				b.setButtonText("Delete").setWarning().onClick(() => {
					options.onDelete?.();
					this.close();
				})
			);
		}
		if (options.onArchive && options.item?.status === "closed") {
			buttons.addButton((b) =>
				b.setButtonText("Archive").onClick(() => {
					options.onArchive?.();
					this.close();
				})
			);
		}
		buttons.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		buttons.addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit()));
	}

	private submit(): void {
		const title = this.result.title.trim();
		if (!title) return;
		this.options.onSubmit({ ...this.result, title });
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

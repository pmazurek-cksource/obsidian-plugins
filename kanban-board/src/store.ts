import { normalizePath, Vault } from "obsidian";

export const STATUSES = ["todo", "in-progress", "waiting-for-feedback", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
	"todo": "Todo",
	"in-progress": "In progress",
	"waiting-for-feedback": "Waiting for feedback",
	"closed": "Closed",
};

export interface KanbanItem {
	id: string;
	title: string;
	description: string;
	status: Status;
	createdAt: string;
	updatedAt: string;
	archivedAt?: string;
}

export interface BoardData {
	version: 1;
	// Order within a column is the order of items in this array.
	items: KanbanItem[];
}

export const ROOT_DIR = "obsidian-kanban";
export const BOARD_PATH = normalizePath(`${ROOT_DIR}/board.json`);
export const ARCHIVE_DIR = normalizePath(`${ROOT_DIR}/archived`);

function emptyBoard(): BoardData {
	return { version: 1, items: [] };
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

export function archiveFileName(date: Date): string {
	return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}.json`;
}

export function newId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function serialize(data: unknown): string {
	return JSON.stringify(data, null, 2) + "\n";
}

/**
 * Reads and writes the board through the vault adapter. Writes are serialized
 * so rapid edits (e.g. several drags) never interleave on disk.
 */
export class BoardStore {
	data: BoardData = emptyBoard();
	private lastWritten: string | null = null;
	private queue: Promise<void> = Promise.resolve();

	constructor(private vault: Vault) {}

	private get adapter() {
		return this.vault.adapter;
	}

	private async ensureDir(path: string): Promise<void> {
		if (!(await this.adapter.exists(path))) {
			await this.adapter.mkdir(path);
		}
	}

	async load(): Promise<void> {
		await this.ensureDir(ROOT_DIR);
		if (!(await this.adapter.exists(BOARD_PATH))) {
			this.data = emptyBoard();
			await this.save();
			return;
		}
		const raw = await this.adapter.read(BOARD_PATH);
		this.data = this.parse(raw);
		this.lastWritten = raw;
	}

	/** Returns true when board.json on disk differs from what we last wrote (external edit). */
	async reloadIfChanged(): Promise<boolean> {
		if (!(await this.adapter.exists(BOARD_PATH))) return false;
		const raw = await this.adapter.read(BOARD_PATH);
		if (raw === this.lastWritten) return false;
		this.data = this.parse(raw);
		this.lastWritten = raw;
		return true;
	}

	private parse(raw: string): BoardData {
		const parsed = JSON.parse(raw) as Partial<BoardData>;
		const items = Array.isArray(parsed.items) ? parsed.items : [];
		return {
			version: 1,
			items: items.map((item) => ({
				...item,
				status: STATUSES.includes(item.status) ? item.status : "todo",
				description: item.description ?? "",
			})),
		};
	}

	save(): Promise<void> {
		this.queue = this.queue.then(async () => {
			await this.ensureDir(ROOT_DIR);
			const raw = serialize(this.data);
			this.lastWritten = raw;
			await this.adapter.write(BOARD_PATH, raw);
		});
		return this.queue;
	}

	itemsIn(status: Status): KanbanItem[] {
		return this.data.items.filter((i) => i.status === status);
	}

	add(title: string, description: string, status: Status): KanbanItem {
		const now = new Date().toISOString();
		const item: KanbanItem = { id: newId(), title, description, status, createdAt: now, updatedAt: now };
		this.data.items.push(item);
		return item;
	}

	update(id: string, patch: Partial<Pick<KanbanItem, "title" | "description" | "status">>): void {
		const item = this.data.items.find((i) => i.id === id);
		if (!item) return;
		Object.assign(item, patch, { updatedAt: new Date().toISOString() });
	}

	remove(id: string): void {
		this.data.items = this.data.items.filter((i) => i.id !== id);
	}

	/**
	 * Moves an item to `status`, placing it before `beforeId` (or at the end of
	 * the column when `beforeId` is null).
	 */
	move(id: string, status: Status, beforeId: string | null): void {
		const items = this.data.items;
		const from = items.findIndex((i) => i.id === id);
		if (from === -1 || id === beforeId) return;
		const [item] = items.splice(from, 1);
		if (item.status !== status) {
			item.status = status;
			item.updatedAt = new Date().toISOString();
		}
		let to = beforeId ? items.findIndex((i) => i.id === beforeId) : -1;
		if (to === -1) {
			// End of the column: right after the last item with this status.
			const lastInColumn = items.map((i) => i.status).lastIndexOf(status);
			to = lastInColumn === -1 ? items.length : lastInColumn + 1;
		}
		items.splice(to, 0, item);
	}

	/** Moves the given items to today's archive file and removes them from the board. */
	async archive(ids: string[]): Promise<number> {
		const idSet = new Set(ids);
		const toArchive = this.data.items.filter((i) => idSet.has(i.id));
		if (toArchive.length === 0) return 0;

		const now = new Date();
		await this.ensureDir(ROOT_DIR);
		await this.ensureDir(ARCHIVE_DIR);
		const path = normalizePath(`${ARCHIVE_DIR}/${archiveFileName(now)}`);

		let archived: KanbanItem[] = [];
		if (await this.adapter.exists(path)) {
			const parsed = JSON.parse(await this.adapter.read(path));
			archived = Array.isArray(parsed) ? parsed : [];
		}
		const archivedAt = now.toISOString();
		archived.push(...toArchive.map((i) => ({ ...i, archivedAt })));
		// Archive first, so a failure never loses items from the board.
		await this.adapter.write(path, serialize(archived));

		this.data.items = this.data.items.filter((i) => !idSet.has(i.id));
		await this.save();
		return toArchive.length;
	}
}

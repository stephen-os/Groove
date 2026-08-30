import { getDatabase } from './client';

export interface Item {
  id: number;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  /** Epoch milliseconds, or null when no reminder is set. */
  remindAt: number | null;
  /** OS notification id, so the reminder can be cancelled with the item. */
  notificationId: string | null;
}

// SQLite gives back the column names verbatim. Keeping the row shape separate
// from `Item` means snake_case stops at this file instead of leaking into
// components.
interface ItemRow {
  id: number;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
  remind_at: number | null;
  notification_id: string | null;
}

const toItem = (row: ItemRow): Item => ({
  id: row.id,
  title: row.title,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  remindAt: row.remind_at,
  notificationId: row.notification_id,
});

const SELECT_COLUMNS = 'id, title, body, created_at, updated_at, remind_at, notification_id';

/** All items, newest first. */
export async function listItems(): Promise<Item[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT ${SELECT_COLUMNS} FROM items ORDER BY created_at DESC`
  );
  return rows.map(toItem);
}

export interface NewItem {
  title: string;
  body: string;
  remindAt?: number | null;
  notificationId?: string | null;
}

/** Inserts an item and returns it as stored, including the id SQLite assigned. */
export async function createItem(input: NewItem): Promise<Item> {
  const db = await getDatabase();
  const now = Date.now();

  // Parameterised, like every other query here. String-built SQL is how a note
  // body containing a quote becomes a syntax error at best and a dropped table
  // at worst — even in an app only you will ever use.
  const result = await db.runAsync(
    `INSERT INTO items (title, body, created_at, updated_at, remind_at, notification_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.title, input.body, now, now, input.remindAt ?? null, input.notificationId ?? null]
  );

  return {
    id: result.lastInsertRowId,
    title: input.title,
    body: input.body,
    createdAt: now,
    updatedAt: now,
    remindAt: input.remindAt ?? null,
    notificationId: input.notificationId ?? null,
  };
}

export async function deleteItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

/**
 * Replaces every item with the given set, preserving ids, in one transaction.
 *
 * This is what restoring a backup does. Replace rather than merge: with
 * device-local integer ids there is no sane way to reconcile two histories, and
 * a restore that silently duplicated everything would be worse than one that is
 * explicit about overwriting. The transaction means a failure part-way leaves
 * the existing data untouched rather than half-erased.
 */
export async function replaceAllItems(items: readonly Item[]): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM items');
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO items (id, title, body, created_at, updated_at, remind_at, notification_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.title,
          item.body,
          item.createdAt,
          item.updatedAt,
          item.remindAt,
          item.notificationId,
        ]
      );
    }
  });
}

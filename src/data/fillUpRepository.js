export async function migrateDbIfNeeded(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS fill_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      odometer_km REAL,
      liters REAL NOT NULL,
      total_cost_inr REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS fill_ups_odometer_idx ON fill_ups (odometer_km);
    CREATE INDEX IF NOT EXISTS fill_ups_date_idx ON fill_ups (date);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  await migrateNullableOdometerIfNeeded(db);
}

export async function listFillUps(db) {
  const rows = await db.getAllAsync(`
    SELECT
      id,
      date,
      odometer_km,
      liters,
      total_cost_inr,
      notes,
      created_at,
      updated_at
    FROM fill_ups
    ORDER BY date ASC, id ASC
  `);

  return rows.map(rowToFillUp);
}

export async function createFillUp(db, input) {
  const result = await insertFillUp(db, input);

  return result.lastInsertRowId;
}

export async function updateFillUp(db, id, input) {
  await db.runAsync(
    `
      UPDATE fill_ups
      SET
        date = $date,
        odometer_km = $odometerKm,
        liters = $liters,
        total_cost_inr = $totalCostInr,
        notes = $notes,
        updated_at = datetime('now')
      WHERE id = $id
    `,
    {
      $id: id,
      $date: input.date,
      $odometerKm: input.odometerKm,
      $liters: input.liters,
      $totalCostInr: input.totalCostInr,
      $notes: input.notes ?? ""
    }
  );
}

export async function deleteFillUp(db, id) {
  await db.runAsync("DELETE FROM fill_ups WHERE id = $id", { $id: id });
}

export async function replaceAllFillUps(db, fillUps) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM fill_ups");

    for (const fillUp of fillUps) {
      await insertFillUp(txn, fillUp);
    }
  });
}

export async function getSetting(db, key, fallbackValue = null) {
  const row = await db.getFirstAsync("SELECT value FROM app_settings WHERE key = $key", { $key: key });
  return row?.value ?? fallbackValue;
}

export async function setSetting(db, key, value) {
  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES ($key, $value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    {
      $key: key,
      $value: value
    }
  );
}

async function insertFillUp(db, input) {
  return db.runAsync(
    `
      INSERT INTO fill_ups (date, odometer_km, liters, total_cost_inr, notes)
      VALUES ($date, $odometerKm, $liters, $totalCostInr, $notes)
    `,
    {
      $date: input.date,
      $odometerKm: input.odometerKm,
      $liters: input.liters,
      $totalCostInr: input.totalCostInr,
      $notes: input.notes ?? ""
    }
  );
}

async function migrateNullableOdometerIfNeeded(db) {
  const columns = await db.getAllAsync("PRAGMA table_info(fill_ups)");
  const odometerColumn = columns.find((column) => column.name === "odometer_km");

  if (!odometerColumn || Number(odometerColumn.notnull) !== 1) {
    return;
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      CREATE TABLE fill_ups_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        odometer_km REAL,
        liters REAL NOT NULL,
        total_cost_inr REAL NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO fill_ups_next (
        id,
        date,
        odometer_km,
        liters,
        total_cost_inr,
        notes,
        created_at,
        updated_at
      )
      SELECT
        id,
        date,
        odometer_km,
        liters,
        total_cost_inr,
        notes,
        created_at,
        updated_at
      FROM fill_ups;

      DROP TABLE fill_ups;
      ALTER TABLE fill_ups_next RENAME TO fill_ups;
      CREATE INDEX IF NOT EXISTS fill_ups_odometer_idx ON fill_ups (odometer_km);
      CREATE INDEX IF NOT EXISTS fill_ups_date_idx ON fill_ups (date);
    `);
  });
}

function rowToFillUp(row) {
  return {
    id: row.id,
    date: row.date,
    odometerKm: row.odometer_km === null || row.odometer_km === undefined ? null : Number(row.odometer_km),
    liters: Number(row.liters),
    totalCostInr: Number(row.total_cost_inr),
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

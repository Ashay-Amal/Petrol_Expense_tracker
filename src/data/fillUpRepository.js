export async function migrateDbIfNeeded(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS fill_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      odometer_km REAL NOT NULL,
      liters REAL NOT NULL,
      total_cost_inr REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS fill_ups_odometer_idx ON fill_ups (odometer_km);
    CREATE INDEX IF NOT EXISTS fill_ups_date_idx ON fill_ups (date);
  `);
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
    ORDER BY odometer_km ASC, date ASC, id ASC
  `);

  return rows.map(rowToFillUp);
}

export async function createFillUp(db, input) {
  const result = await db.runAsync(
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

function rowToFillUp(row) {
  return {
    id: row.id,
    date: row.date,
    odometerKm: Number(row.odometer_km),
    liters: Number(row.liters),
    totalCostInr: Number(row.total_cost_inr),
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

import { compareIsoDates, getTodayIsoDate, isValidIsoDate, normalizeFillUpInput, sortFillUps } from "./fuelMath.js";

export const CSV_COLUMNS = ["date", "odometerKm", "liters", "totalCostInr", "notes"];

const HEADER_ALIASES = {
  date: "date",
  fillupdate: "date",
  odometer: "odometerKm",
  odometerkm: "odometerKm",
  odometerreading: "odometerKm",
  odometerreadingkm: "odometerKm",
  liters: "liters",
  litres: "liters",
  fuel: "liters",
  fuelliters: "liters",
  fuellitres: "liters",
  totalcost: "totalCostInr",
  totalcostinr: "totalCostInr",
  cost: "totalCostInr",
  amount: "totalCostInr",
  amountinr: "totalCostInr",
  notes: "notes",
  note: "notes"
};

export function fillUpsToCsv(fillUps) {
  const lines = [CSV_COLUMNS.join(",")];

  for (const entry of sortFillUps(fillUps)) {
    lines.push(
      [
        entry.date,
        entry.odometerKm === null || entry.odometerKm === undefined ? "" : entry.odometerKm,
        entry.liters,
        entry.totalCostInr,
        entry.notes ?? ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

export function parseFillUpsCsv(csvText) {
  const rows = parseCsvRows(csvText);
  const errors = [];

  if (rows.length < 2) {
    return {
      fillUps: [],
      errors: ["CSV must include a header row and at least one fill-up row."]
    };
  }

  const headers = rows[0].map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? null);
  const missingColumns = CSV_COLUMNS.filter((column) => column !== "notes" && !headers.includes(column));
  if (missingColumns.length) {
    return {
      fillUps: [],
      errors: [`CSV is missing required column(s): ${missingColumns.join(", ")}.`]
    };
  }

  const fillUps = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => !String(cell ?? "").trim())) {
      continue;
    }

    const rawEntry = {};
    headers.forEach((header, columnIndex) => {
      if (header) {
        rawEntry[header] = row[columnIndex] ?? "";
      }
    });

    const normalized = normalizeFillUpInput(rawEntry);
    const rowNumber = index + 1;

    if (!normalized.date) {
      errors.push(`Row ${rowNumber}: date is required.`);
    } else if (!isValidIsoDate(normalized.date)) {
      errors.push(`Row ${rowNumber}: date must use YYYY-MM-DD format.`);
    } else if (compareIsoDates(normalized.date, getTodayIsoDate()) > 0) {
      errors.push(`Row ${rowNumber}: future dates are not allowed.`);
    }

    if (
      rawEntry.odometerKm !== undefined &&
      String(rawEntry.odometerKm).trim() &&
      (!Number.isFinite(normalized.odometerKm) || normalized.odometerKm <= 0)
    ) {
      errors.push(`Row ${rowNumber}: odometerKm must be positive or blank.`);
    }

    if (!Number.isFinite(normalized.liters) || normalized.liters <= 0) {
      errors.push(`Row ${rowNumber}: liters must be greater than 0.`);
    }

    if (!Number.isFinite(normalized.totalCostInr) || normalized.totalCostInr <= 0) {
      errors.push(`Row ${rowNumber}: totalCostInr must be greater than 0.`);
    }

    fillUps.push(normalized);
  }

  if (!fillUps.length) {
    errors.push("CSV does not contain any fill-up rows.");
  }

  validateOdometerSequence(fillUps, errors);

  return {
    fillUps: errors.length ? [] : sortFillUps(fillUps),
    errors
  };
}

function validateOdometerSequence(fillUps, errors) {
  const readings = sortFillUps(fillUps).filter((entry) => Number.isFinite(entry.odometerKm));
  const seenReadings = new Set();
  let previousReading = null;

  for (const entry of readings) {
    const readingKey = String(entry.odometerKm);
    if (seenReadings.has(readingKey)) {
      errors.push(`Duplicate odometer reading found: ${entry.odometerKm} km.`);
    }
    seenReadings.add(readingKey);

    if (previousReading && entry.odometerKm <= previousReading.odometerKm) {
      errors.push(
        `Odometer reading ${entry.odometerKm} km on ${entry.date} must be greater than ${previousReading.odometerKm} km on ${previousReading.date}.`
      );
    }

    previousReading = entry;
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let isQuoted = false;
  const input = String(text ?? "").replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === "\"") {
      if (isQuoted && nextChar === "\"") {
        cell += "\"";
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
    } else if (char === "," && !isQuoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !isQuoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, "\"\"")}"`;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

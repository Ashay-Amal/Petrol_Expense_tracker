const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayIsoDate() {
  return formatLocalIsoDate(new Date());
}

export function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parsePositiveNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  if (!normalized) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseOptionalPositiveNumber(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  return parsePositiveNumber(normalized);
}

export function normalizeFillUpInput(input) {
  return {
    date: String(input.date ?? "").trim(),
    odometerKm: parseOptionalPositiveNumber(input.odometerKm),
    liters: parsePositiveNumber(input.liters),
    totalCostInr: parsePositiveNumber(input.totalCostInr),
    notes: String(input.notes ?? "").trim()
  };
}

export function isValidIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(String(value))) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function compareIsoDates(left, right) {
  return String(left).localeCompare(String(right));
}

export function sortFillUps(fillUps) {
  return [...fillUps].sort((left, right) => {
    const dateDelta = compareIsoDates(left.date, right.date);
    if (dateDelta !== 0) {
      return dateDelta;
    }

    const leftOdometer = Number(left.odometerKm);
    const rightOdometer = Number(right.odometerKm);
    if (Number.isFinite(leftOdometer) && Number.isFinite(rightOdometer)) {
      const odometerDelta = leftOdometer - rightOdometer;
      if (odometerDelta !== 0) {
        return odometerDelta;
      }
    }

    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}

export function round(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function enrichFillUps(fillUps) {
  const sorted = sortFillUps(fillUps);
  let previousOdometerEntry = null;
  let litersSincePreviousOdometer = 0;

  return sorted.map((entry) => {
    const odometerKm =
      entry.odometerKm === null || entry.odometerKm === undefined || entry.odometerKm === ""
        ? null
        : Number(entry.odometerKm);
    const liters = Number(entry.liters);
    const totalCostInr = Number(entry.totalCostInr);

    let distanceSinceLastFill = null;
    let mileageKmPerLiter = null;
    let fuelUsedForMileage = null;

    if (odometerKm !== null && Number.isFinite(odometerKm)) {
      if (previousOdometerEntry && odometerKm > previousOdometerEntry.odometerKm) {
        distanceSinceLastFill = round(odometerKm - previousOdometerEntry.odometerKm, 2);
        fuelUsedForMileage = round(litersSincePreviousOdometer, 2);
        mileageKmPerLiter =
          fuelUsedForMileage !== null && fuelUsedForMileage > 0
            ? round(distanceSinceLastFill / fuelUsedForMileage, 2)
            : null;
      }

      previousOdometerEntry = { ...entry, odometerKm };
      litersSincePreviousOdometer = 0;
    }

    if (Number.isFinite(liters)) {
      litersSincePreviousOdometer += liters;
    }

    return {
      ...entry,
      odometerKm,
      liters,
      totalCostInr,
      pricePerLiter: liters > 0 ? round(totalCostInr / liters, 2) : null,
      distanceSinceLastFill,
      fuelUsedForMileage,
      mileageKmPerLiter
    };
  });
}

export function calculateStats(fillUps) {
  const enriched = enrichFillUps(fillUps);
  const mileageRows = enriched.filter((entry) => entry.mileageKmPerLiter !== null);
  const totalSpendInr = round(
    enriched.reduce((sum, entry) => sum + Number(entry.totalCostInr || 0), 0),
    2
  );
  const totalLiters = round(
    enriched.reduce((sum, entry) => sum + Number(entry.liters || 0), 0),
    2
  );
  const totalDistanceKm = round(
    mileageRows.reduce((sum, entry) => sum + Number(entry.distanceSinceLastFill || 0), 0),
    2
  );
  const latestMileageKmPerLiter = mileageRows.length
    ? mileageRows[mileageRows.length - 1].mileageKmPerLiter
    : null;
  const averageMileageKmPerLiter = mileageRows.length
    ? round(
        mileageRows.reduce((sum, entry) => sum + Number(entry.mileageKmPerLiter || 0), 0) / mileageRows.length,
        2
      )
    : null;
  const averagePricePerLiter = totalLiters > 0 ? round(totalSpendInr / totalLiters, 2) : null;

  return {
    entryCount: enriched.length,
    totalSpendInr,
    totalLiters,
    totalDistanceKm,
    latestMileageKmPerLiter,
    averageMileageKmPerLiter,
    averagePricePerLiter,
    monthlyExpenseTrend: buildMonthlyExpenseTrend(enriched),
    mileageTrend: mileageRows.map((entry) => ({
      id: entry.id,
      date: entry.date,
      odometerKm: entry.odometerKm,
      mileageKmPerLiter: entry.mileageKmPerLiter
    }))
  };
}

export function buildMonthlyExpenseTrend(fillUps) {
  const totals = new Map();

  for (const entry of fillUps) {
    const key = String(entry.date).slice(0, 7);
    if (!ISO_DATE_PATTERN.test(String(entry.date))) {
      continue;
    }
    totals.set(key, round((totals.get(key) ?? 0) + Number(entry.totalCostInr || 0), 2));
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, totalCostInr]) => ({
      month,
      label: formatMonthLabel(month),
      totalCostInr
    }));
}

export function validateFillUpInput(existingFillUps, rawInput, editingId = null) {
  const input = normalizeFillUpInput(rawInput);
  const errors = {};

  if (!input.date) {
    errors.date = "Date is required.";
  } else if (!isValidIsoDate(input.date)) {
    errors.date = "Enter a valid date in YYYY-MM-DD format.";
  } else if (compareIsoDates(input.date, getTodayIsoDate()) > 0) {
    errors.date = "Future fill-up dates are not allowed.";
  }

  if (input.odometerKm !== null && (!Number.isFinite(input.odometerKm) || input.odometerKm <= 0)) {
    errors.odometerKm = "Enter an odometer reading greater than 0 km, or leave it blank.";
  }

  if (!Number.isFinite(input.liters) || input.liters <= 0) {
    errors.liters = "Enter liters greater than 0.";
  }

  if (!Number.isFinite(input.totalCostInr) || input.totalCostInr <= 0) {
    errors.totalCostInr = "Enter a cost greater than INR 0.";
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors, input };
  }

  const otherFillUps = existingFillUps.filter((entry) => String(entry.id) !== String(editingId));
  const duplicateOdometer = otherFillUps.find(
    (entry) => input.odometerKm !== null && Number(entry.odometerKm) === input.odometerKm
  );
  if (input.odometerKm !== null && duplicateOdometer) {
    errors.odometerKm = `A fill-up already uses ${formatNumber(input.odometerKm)} km.`;
  }

  const readings = sortFillUps(otherFillUps).filter((entry) => entry.odometerKm !== null && entry.odometerKm !== undefined);
  const latestReading = readings[readings.length - 1];
  if (
    input.odometerKm !== null &&
    !errors.odometerKm &&
    !editingId &&
    latestReading &&
    input.odometerKm <= Number(latestReading.odometerKm)
  ) {
    errors.odometerKm = `Enter an odometer reading above the latest ${formatNumber(latestReading.odometerKm)} km entry.`;
  }

  const lowerReading =
    input.odometerKm === null ? null : [...readings].reverse().find((entry) => Number(entry.odometerKm) < input.odometerKm);
  const higherReading =
    input.odometerKm === null ? null : readings.find((entry) => Number(entry.odometerKm) > input.odometerKm);

  if (lowerReading && compareIsoDates(input.date, lowerReading.date) < 0) {
    errors.date = `Use ${formatDisplayDate(lowerReading.date)} or later for a reading above ${formatNumber(
      lowerReading.odometerKm
    )} km.`;
  }

  if (higherReading && compareIsoDates(input.date, higherReading.date) > 0) {
    errors.date = `Use ${formatDisplayDate(higherReading.date)} or earlier for a reading below ${formatNumber(
      higherReading.odometerKm
    )} km.`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    input
  };
}

export function formatNumber(value, maximumFractionDigits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits
  }).format(Number(value));
}

export function formatInr(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value));
}

export function formatDisplayDate(value) {
  if (!isValidIsoDate(value)) {
    return String(value ?? "--");
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatShortDate(value) {
  if (!isValidIsoDate(value)) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatMonthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) {
    return String(month ?? "--");
  }

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

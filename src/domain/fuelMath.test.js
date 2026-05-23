import assert from "node:assert/strict";
import test from "node:test";

import { fillUpsToCsv, parseFillUpsCsv } from "./fillUpCsv.js";
import {
  calculateStats,
  buildMonthlyExpenseTrend,
  enrichFillUps,
  formatDisplayDate,
  formatLocalIsoDate,
  formatMonthLabel,
  formatShortDate,
  validateFillUpInput
} from "./fuelMath.js";

const baseline = [
  {
    id: 1,
    date: "2026-05-01",
    odometerKm: 1000,
    liters: 10,
    totalCostInr: 1000
  },
  {
    id: 2,
    date: "2026-05-10",
    odometerKm: 1450,
    liters: 30,
    totalCostInr: 3000
  },
  {
    id: 3,
    date: "2026-05-20",
    odometerKm: 1850,
    liters: 25,
    totalCostInr: 2500
  }
];

test("first fill-up is a baseline and does not calculate mileage", () => {
  const enriched = enrichFillUps(baseline);

  assert.equal(enriched[0].distanceSinceLastFill, null);
  assert.equal(enriched[0].mileageKmPerLiter, null);
});

test("later fill-ups calculate distance and mileage from odometer readings", () => {
  const enriched = enrichFillUps(baseline);

  assert.equal(enriched[1].distanceSinceLastFill, 450);
  assert.equal(enriched[1].mileageKmPerLiter, 15);
  assert.equal(enriched[2].distanceSinceLastFill, 400);
  assert.equal(enriched[2].mileageKmPerLiter, 16);
});

test("review scenario calculates 300 km and 12 km/L", () => {
  const enriched = enrichFillUps([
    {
      id: 1,
      date: "2026-05-01",
      odometerKm: 1000,
      liters: 20,
      totalCostInr: 2000
    },
    {
      id: 2,
      date: "2026-05-10",
      odometerKm: 1300,
      liters: 25,
      totalCostInr: 2500
    }
  ]);

  assert.equal(enriched[0].mileageKmPerLiter, null);
  assert.equal(enriched[1].distanceSinceLastFill, 300);
  assert.equal(enriched[1].mileageKmPerLiter, 12);
});

test("odometer is optional and mileage waits for the next available reading", () => {
  const enriched = enrichFillUps([
    {
      id: 1,
      date: "2026-05-01",
      odometerKm: 1000,
      liters: 20,
      totalCostInr: 2000
    },
    {
      id: 2,
      date: "2026-05-05",
      odometerKm: null,
      liters: 10,
      totalCostInr: 1000
    },
    {
      id: 3,
      date: "2026-05-10",
      odometerKm: 1300,
      liters: 25,
      totalCostInr: 2500
    }
  ]);

  assert.equal(enriched[1].mileageKmPerLiter, null);
  assert.equal(enriched[2].distanceSinceLastFill, 300);
  assert.equal(enriched[2].fuelUsedForMileage, 35);
  assert.equal(enriched[2].mileageKmPerLiter, 8.57);
});

test("stats summarize spend, fuel, latest mileage, and average valid mileage", () => {
  const stats = calculateStats(baseline);

  assert.equal(stats.totalSpendInr, 6500);
  assert.equal(stats.totalLiters, 65);
  assert.equal(stats.totalDistanceKm, 850);
  assert.equal(stats.latestMileageKmPerLiter, 16);
  assert.equal(stats.averageMileageKmPerLiter, 15.5);
  assert.equal(stats.averagePricePerLiter, 100);
});

test("validation rejects duplicate odometer readings", () => {
  const result = validateFillUpInput(baseline, {
    date: "2026-05-22",
    odometerKm: 1450,
    liters: 20,
    totalCostInr: 2100
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors.odometerKm, /already uses/);
});

test("validation accepts blank odometer readings", () => {
  const result = validateFillUpInput(baseline, {
    date: "2026-05-22",
    odometerKm: "",
    liters: 20,
    totalCostInr: 2100
  });

  assert.equal(result.isValid, true);
  assert.equal(result.input.odometerKm, null);
});

test("validation rejects new entries below the latest odometer reading", () => {
  const result = validateFillUpInput(baseline, {
    date: "2026-05-22",
    odometerKm: 1700,
    liters: 20,
    totalCostInr: 2100
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors.odometerKm, /above the latest/);
});

test("validation rejects dates that contradict the odometer sequence", () => {
  const result = validateFillUpInput(baseline, {
    date: "2026-05-02",
    odometerKm: 1700,
    liters: 20,
    totalCostInr: 2100
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors.date, /or later/);
});

test("validation rejects zero and negative numeric fields", () => {
  const result = validateFillUpInput([], {
    date: "2026-05-01",
    odometerKm: -1,
    liters: 0,
    totalCostInr: -100
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.odometerKm);
  assert.ok(result.errors.liters);
  assert.ok(result.errors.totalCostInr);
});

test("validation rejects empty and future dates", () => {
  const emptyDate = validateFillUpInput([], {
    date: "",
    odometerKm: 1000,
    liters: 10,
    totalCostInr: 1000
  });
  const futureDate = validateFillUpInput([], {
    date: "2999-01-01",
    odometerKm: 1000,
    liters: 10,
    totalCostInr: 1000
  });

  assert.equal(emptyDate.isValid, false);
  assert.match(emptyDate.errors.date, /required/);
  assert.equal(futureDate.isValid, false);
  assert.match(futureDate.errors.date, /Future/);
});

test("monthly expense trend groups costs by calendar month", () => {
  const trend = buildMonthlyExpenseTrend([
    { date: "2026-05-01", totalCostInr: 1000 },
    { date: "2026-05-20", totalCostInr: 2500 },
    { date: "2026-06-01", totalCostInr: 3000 }
  ]);

  assert.deepEqual(
    trend.map((item) => [item.month, item.totalCostInr]),
    [
      ["2026-05", 3500],
      ["2026-06", 3000]
    ]
  );
});

test("CSV export and import preserves optional odometer and notes", () => {
  const csv = fillUpsToCsv([
    {
      date: "2026-05-01",
      odometerKm: 1000,
      liters: 20,
      totalCostInr: 2000,
      notes: "Baseline"
    },
    {
      date: "2026-05-05",
      odometerKm: null,
      liters: 10.5,
      totalCostInr: 1050,
      notes: "No reading, pump A"
    }
  ]);
  const parsed = parseFillUpsCsv(csv);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.fillUps.length, 2);
  assert.equal(parsed.fillUps[0].odometerKm, 1000);
  assert.equal(parsed.fillUps[1].odometerKm, null);
  assert.equal(parsed.fillUps[1].notes, "No reading, pump A");
});

test("CSV import reports invalid numeric fields", () => {
  const parsed = parseFillUpsCsv("date,odometerKm,liters,totalCostInr,notes\n2026-05-01,,0,-10,bad\n");

  assert.equal(parsed.fillUps.length, 0);
  assert.ok(parsed.errors.some((error) => error.includes("liters")));
  assert.ok(parsed.errors.some((error) => error.includes("totalCostInr")));
});

test("local calendar dates do not roll over through UTC conversion", () => {
  assert.equal(formatLocalIsoDate(new Date(2026, 4, 1, 0, 15)), "2026-05-01");
  assert.match(formatDisplayDate("2026-05-01"), /01 May 2026/);
  assert.match(formatShortDate("2026-05-01"), /01 May/);
  assert.match(formatMonthLabel("2026-05"), /May 2026/);
});

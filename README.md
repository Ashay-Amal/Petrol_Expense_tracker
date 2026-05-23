# Petrol Expense Tracker

A local-only Expo mobile app for tracking petrol fill-ups, fuel spending, and mileage.

## Run

```bash
npm install
npm start
```

Then open the Expo QR code on Android or iOS.

## Test

```bash
npm test
```

## Notes

- Data is stored on the device with `expo-sqlite`.
- Backup and restore use local CSV files that can be shared to another phone without cloud sync.
- Odometer readings are optional. Mileage appears when at least two odometer readings are available.
- Default units are INR, kilometers, and liters.

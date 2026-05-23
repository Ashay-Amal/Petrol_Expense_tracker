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
- The first fill-up is treated as the odometer baseline, so mileage starts from the second fill-up.
- Default units are INR, kilometers, and liters.

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

## Verify Android Bundle

```bash
npx expo-doctor
npx expo export --platform android --output-dir .expo-bundle-check
```

The export command checks that Metro can compile the Android JavaScript bundle.

## Build Android APK

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview --non-interactive
```

The `preview` profile builds an internal Android APK. EAS prints the install/download link when the build finishes.

## Mileage Calculation Logic

Mileage is calculated only when the app has a previous odometer reading and a later higher odometer reading.

```text
distance = current odometer - previous odometer
fuel used = liters entered after the previous odometer reading and before the current odometer reading
mileage = distance / fuel used
```

Rules:

- The first odometer reading is only a baseline, so it has no mileage.
- Liters entered with an odometer reading are used for the next distance interval.
- Liters entered with the current odometer reading are not used for the mileage that ends at that same reading.
- Blank odometer entries after a baseline add their liters to the current interval.
- Blank odometer entries before the first odometer reading are not used for mileage because there is no starting distance.
- Mileage stays blank until there are at least two increasing odometer readings and fuel in the interval.
- Duplicate or lower odometer readings are rejected during input/import validation.

Example:

```text
01 May: odometer 1000 km, petrol 20 L
05 May: odometer blank, petrol 10 L
10 May: odometer 1300 km, petrol 25 L

distance = 1300 - 1000 = 300 km
fuel used = 20 + 10 = 30 L
mileage = 300 / 30 = 10 km/L

The 25 L entered on 10 May starts the next interval after 1300 km.
```

## Notes

- Data is stored on the device with `expo-sqlite`.
- Backup and restore use local CSV files that can be shared to another phone without cloud sync.
- Odometer readings are optional. Mileage appears when at least two odometer readings are available.
- Mileage uses the liters entered after the previous odometer reading. Liters entered with the current odometer reading start the next distance interval.
- Default units are INR, kilometers, and liters.

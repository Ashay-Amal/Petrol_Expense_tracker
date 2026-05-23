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

## Notes

- Data is stored on the device with `expo-sqlite`.
- Backup and restore use local CSV files that can be shared to another phone without cloud sync.
- Odometer readings are optional. Mileage appears when at least two odometer readings are available.
- Default units are INR, kilometers, and liters.

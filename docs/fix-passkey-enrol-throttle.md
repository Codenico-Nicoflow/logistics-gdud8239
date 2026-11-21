# Passkey enrol no longer blocked by the password-change limit

Adding a device shared the `account` tier (5 requests / 15 min, 15 min block) with change-password. One enrol is 2 requests and a cancelled Face ID prompt still spends them, so fixing a failed enrol produced "יותר מדי בקשות. נסו שוב בעוד N שניות" for up to 15 minutes.

Adding/removing a passkey now uses its own `device` tier: 40 per 15 min per user (`THROTTLE_DEVICE_PER_15MIN`), 1 minute block. Change-password keeps the strict `account` tier, since it checks the current password and is a guessing oracle for a stolen session.

const DEVICE_ID_KEY = "dichotomy_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("The device ID is only available in the browser.");
  }

  const existingId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existingId) return existingId;

  const deviceId = window.crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
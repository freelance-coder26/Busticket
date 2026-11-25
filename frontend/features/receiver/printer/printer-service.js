import { BleClient } from "@capacitor-community/bluetooth-le";
import { Capacitor } from "@capacitor/core";
import { buildTestPrintBytes, buildTicketBytes } from "./escpos.js";

const PREFERENCE_KEY = "gorohitech-receiver-printer";
const SCAN_DURATION_MS = 7000;
const BLE_WRITE_CHUNK_SIZE = 20;

let initialized = false;
let activeDevice = null;
/** @type {Array<{ serviceUuid: string, characteristicUuid: string, writeMode: string }>} */
let writableTargets = [];
let selectedTarget = null;
/** @type {{ state: string, deviceName: string | null, target: { serviceUuid: string, characteristicUuid: string, writeMode: string } | null, message: string | null }} */
let status = { state: "DISCONNECTED", deviceName: null, target: null, message: null };
const listeners = new Set();

/** @param {Partial<typeof status>} patch */
function publish(patch) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener({ ...status });
}

function assertAndroid() {
  if (Capacitor.getPlatform() !== "android") {
    throw new Error("L’impression Bluetooth est disponible dans l’application Android.");
  }
}

async function prepareBluetooth() {
  assertAndroid();
  if (!initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
  if (!await BleClient.isEnabled()) await BleClient.requestEnable();
}

function readPreference() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PREFERENCE_KEY);
  if (!raw) return null;
  const preference = JSON.parse(raw);
  if (
    typeof preference.deviceId !== "string" ||
    typeof preference.deviceName !== "string" ||
    typeof preference.serviceUuid !== "string" ||
    typeof preference.characteristicUuid !== "string"
  ) {
    throw new Error("La configuration locale de l’imprimante est invalide.");
  }
  return preference;
}

function savePreference(device, target) {
  window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify({
    deviceId: device.deviceId,
    deviceName: device.name,
    serviceUuid: target.serviceUuid,
    characteristicUuid: target.characteristicUuid,
    writeMode: target.writeMode,
  }));
}

function normalizeError(error, fallback) {
  return error instanceof Error ? error : new Error(fallback);
}

async function scanPrinters() {
  publish({ state: "SCANNING", message: null });
  const devices = new Map();
  let scanning = false;
  let failed = false;
  try {
    await prepareBluetooth();
    await BleClient.requestLEScan({}, (result) => {
      if (!result.device.deviceId) return;
      devices.set(result.device.deviceId, {
        deviceId: result.device.deviceId,
        name: result.localName || result.device.name || "Imprimante BLE sans nom",
      });
    });
    scanning = true;
    await new Promise((resolve) => setTimeout(resolve, SCAN_DURATION_MS));
    return [...devices.values()].sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    const failure = normalizeError(error, "Recherche Bluetooth impossible.");
    failed = true;
    publish({ state: "ERROR", message: failure.message });
    throw failure;
  } finally {
    if (scanning) {
      try {
        await BleClient.stopLEScan();
      } catch (error) {
        const failure = normalizeError(error, "Arrêt de la recherche Bluetooth impossible.");
        publish({ state: "ERROR", message: failure.message });
        throw failure;
      }
    }
    if (!failed) {
      publish({
        state: activeDevice ? "CONNECTED" : "DISCONNECTED",
        deviceName: activeDevice?.name ?? status.deviceName,
        message: null,
      });
    }
  }
}

async function connect(device) {
  publish({ state: "CONNECTING", deviceName: device.name, message: null });
  try {
    await prepareBluetooth();
    if (activeDevice) await BleClient.disconnect(activeDevice.deviceId);

    await BleClient.connect(device.deviceId, () => {
      activeDevice = null;
      selectedTarget = null;
      publish({
        state: "DISCONNECTED",
        message: "Connexion imprimante perdue. Reconnectez-vous avant la prochaine impression.",
      });
    });
    const services = await BleClient.getServices(device.deviceId);
    writableTargets = services.flatMap((service) => service.characteristics
      .filter((characteristic) => characteristic.properties.write || characteristic.properties.writeWithoutResponse)
      .map((characteristic) => ({
        serviceUuid: service.uuid,
        characteristicUuid: characteristic.uuid,
        writeMode: characteristic.properties.write ? "WITH_RESPONSE" : "WITHOUT_RESPONSE",
      })));

    if (!writableTargets.length) {
      await BleClient.disconnect(device.deviceId);
      throw new Error("Cette imprimante BLE n’expose aucune caractéristique d’écriture.");
    }

    const preference = readPreference();
    selectedTarget = writableTargets.find((target) =>
      target.serviceUuid === preference?.serviceUuid &&
      target.characteristicUuid === preference?.characteristicUuid) ?? writableTargets[0];
    activeDevice = device;
    savePreference(device, selectedTarget);
    publish({
      state: "CONNECTED",
      deviceName: device.name,
      target: selectedTarget,
      message: null,
    });
    return writableTargets;
  } catch (error) {
    const failure = normalizeError(error, "Connexion à l’imprimante impossible.");
    activeDevice = null;
    selectedTarget = null;
    publish({ state: "ERROR", deviceName: device.name, target: null, message: failure.message });
    throw failure;
  }
}

async function reconnect() {
  const preference = readPreference();
  if (!preference) throw new Error("Aucune imprimante enregistrée. Recherchez d’abord une imprimante BLE.");
  return connect({ deviceId: preference.deviceId, name: preference.deviceName });
}

async function disconnect() {
  if (activeDevice) await BleClient.disconnect(activeDevice.deviceId);
  activeDevice = null;
  selectedTarget = null;
  publish({ state: "DISCONNECTED", target: null, message: null });
}

function selectTarget(target) {
  const match = writableTargets.find((candidate) =>
    candidate.serviceUuid === target.serviceUuid &&
    candidate.characteristicUuid === target.characteristicUuid);
  if (!activeDevice || !match) throw new Error("Caractéristique d’impression non disponible.");
  selectedTarget = match;
  savePreference(activeDevice, selectedTarget);
  publish({ target: selectedTarget });
}

async function writeBytes(bytes) {
  if (!activeDevice || !selectedTarget || status.state !== "CONNECTED") {
    throw new Error("Aucune imprimante connectée. Reconnectez l’imprimante avant d’imprimer.");
  }
  const device = activeDevice;
  const target = selectedTarget;
  publish({ state: "PRINTING", message: null });
  try {
    for (let offset = 0; offset < bytes.length; offset += BLE_WRITE_CHUNK_SIZE) {
      const chunk = bytes.slice(offset, offset + BLE_WRITE_CHUNK_SIZE);
      const data = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const write = target.writeMode === "WITH_RESPONSE"
        ? BleClient.write
        : BleClient.writeWithoutResponse;
      await write.call(BleClient, device.deviceId, target.serviceUuid, target.characteristicUuid, data);
    }
    publish({ state: "CONNECTED", message: null });
  } catch (error) {
    const failure = normalizeError(error, "Envoi du ticket à l’imprimante impossible.");
    publish({ state: "ERROR", message: failure.message });
    throw failure;
  }
}

export const printerService = Object.freeze({
  isAvailable: () => Capacitor.getPlatform() === "android",
  getState: () => ({ ...status }),
  getSavedPrinter: () => readPreference(),
  /** @param {(nextState: typeof status) => void} listener */
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  scan: scanPrinters,
  connect,
  reconnect,
  disconnect,
  selectTarget,
  testPrint: (widthMm) => writeBytes(buildTestPrintBytes(widthMm)),
  printTicket: (ticket, options) => writeBytes(buildTicketBytes(ticket, options)),
});

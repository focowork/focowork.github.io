const STORAGE_KEYS = {
  STATE: "timeapp_state",
  CLIENTS: "timeapp_clients",
  BLOCKS: "timeapp_blocks"
};

function load(key, defaultValue) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : defaultValue;
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadState() {
  return load(STORAGE_KEYS.STATE, {
    currentClientId: null,
    currentBlockId: null
  });
}

export function saveState(state) {
  save(STORAGE_KEYS.STATE, state);
}

export function loadClients() {
  return load(STORAGE_KEYS.CLIENTS, []);
}

export function saveClients(clients) {
  save(STORAGE_KEYS.CLIENTS, clients);
}

export function loadBlocks() {
  return load(STORAGE_KEYS.BLOCKS, []);
}

export function saveBlocks(blocks) {
  save(STORAGE_KEYS.BLOCKS, blocks);
}
const LICENSE_KEY = "focowork_license";

export function loadLicense() {
  return localStorage.getItem(LICENSE_KEY) || "trial";
}

export function saveLicense(value) {
  localStorage.setItem(LICENSE_KEY, value);
    }

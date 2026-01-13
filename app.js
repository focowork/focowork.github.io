/*************************************************
 * FOCOWORK – app.js (V3.1 CORREGIDO)
 * - Todas las funciones básicas restauradas
 * - Sistema de tareas funcional
 * - Workpad funcional
 * - Licencias, backups y Google Drive
 *************************************************/

/* ================= CONFIG ================= */
const WHATSAPP_PHONE = "34649383847";
const APP_VERSION = "3.1";
const LICENSE_SECRET = "FW2025-SECURE-KEY-X7Y9Z";
const GOOGLE_CLIENT_ID = '339892728740-ghh878p6g57relsi79cprbti5vac1hd4.apps.googleusercontent.com';

/* ================= ACTIVITIES ================= */
const ACTIVITIES = {
  WORK: "work",
  PHONE: "phone",
  CLIENT: "client",
  VISIT: "visit",
  OTHER: "other"
};

function activityLabel(act) {
  switch (act) {
    case ACTIVITIES.WORK: return "Trabajo";
    case ACTIVITIES.PHONE: return "Teléfono";
    case ACTIVITIES.CLIENT: return "Cliente";
    case ACTIVITIES.VISIT: return "Visitando";
    case ACTIVITIES.OTHER: return "Otros";
    default: return act;
  }
}

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isWithinFocusSchedule(date = new Date()) {
  if (!state.focusSchedule || !state.focusSchedule.enabled) return true;

  const [sh, sm] = state.focusSchedule.start.split(":").map(Number);
  const [eh, em] = state.focusSchedule.end.split(":").map(Number);

  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const minutesStart = sh * 60 + sm;
  const minutesEnd = eh * 60 + em;

  return minutesNow >= minutesStart && minutesNow <= minutesEnd;
}

/* ================= MODALES ================= */
function openModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add('hidden');
}

function showAlert(title, message, icon = 'ℹ️') {
  $('alertTitle').textContent = title;
  $('alertText').textContent = message;
  $('alertIcon').textContent = icon;
  openModal('modalAlert');
}

/* ================= USER ================= */
let userName = localStorage.getItem("focowork_user_name") || "Usuario";

/* ================= STATE ================= */
let state = JSON.parse(localStorage.getItem("focowork_state")) || {
  isFull: false,
  license: null,
  day: todayKey(),
  currentClientId: null,
  currentActivity: null,
  lastTick: null,
  sessionElapsed: 0,
  clients: {},
  focus: {},
  focusSchedule: { enabled: false, start: "09:00", end: "17:00" },
  autoDriveBackup: false
};

function save() {
  localStorage.setItem("focowork_state", JSON.stringify(state));
  if (state.currentClientId) scheduleAutoBackup();
}

/* ================= AUTO-BACKUP ================= */
let autoBackupTimeout = null;

function scheduleAutoBackup() {
  clearTimeout(autoBackupTimeout);
  autoBackupTimeout = setTimeout(() => {
    if (state.currentClientId && state.clients[state.currentClientId]) performAutoBackup();
  }, 300000);
}

function performAutoBackup() {
  const client = state.clients[state.currentClientId];
  if (!client) return;

  const backup = {
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    client: client
  };

  try {
    localStorage.setItem(`focowork_autobackup_${client.id}`, JSON.stringify(backup));
  } catch (e) {
    console.warn('Auto-backup falló:', e);
  }
}

/* ================= BACKUPS AUTOMÁTICOS A MEDIANOCHE ================= */
function performFullAutoBackup() {
  const backup = {
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    userName: userName,
    state: JSON.parse(JSON.stringify(state)),
    type: 'full_backup'
  };

  try {
    localStorage.setItem('focowork_full_autobackup', JSON.stringify(backup));
  } catch (e) {
    console.warn('Backup completo automático fallido:', e);
  }

  if (state.autoDriveBackup) exportAllToDrive(true);

  setTimeout(performFullAutoBackup, 24 * 60 * 60 * 1000);
}

function scheduleFullAutoBackup() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  setTimeout(performFullAutoBackup, nextMidnight - now);
}

/* ================= GOOGLE DRIVE (GIS MODERNO) ================= */
let googleTokenClient = null;
let googleAccessToken = null;
let googleInitialized = false;

function initGoogleDrive() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    console.log('Google Identity Services aún no disponible');
    googleInitialized = false;
    return;
  }

  try {
    console.log('Inicializando Google Drive...');
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          googleAccessToken = tokenResponse.access_token;
          console.log('✅ Token de acceso obtenido');
          googleInitialized = true;
          
          if (window.pendingDriveUpload) {
            uploadToDriveNow(window.pendingDriveUpload.autoMode);
            window.pendingDriveUpload = null;
          }
        } else if (tokenResponse.error) {
          console.error('❌ Error obteniendo token:', tokenResponse);
          if (!window.pendingDriveUpload?.autoMode) {
            showAlert('Error de autenticación', 'No se pudo conectar con Google Drive. Intenta de nuevo.', '❌');
          }
        }
      }
    });
    
    googleInitialized = true;
    console.log('✅ Google Drive inicializado correctamente');
  } catch (error) {
    console.error('❌ Error en initGoogleDrive:', error);
    googleInitialized = false;
  }
}

async function exportAllToDrive(autoMode = false) {
  if (!googleInitialized) {
    console.log('Reintentando inicialización de Google Drive...');
    try {
      await loadGoogleScript();
      initGoogleDrive();
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error('Error cargando Google:', e);
    }
  }

  if (!googleTokenClient || !googleInitialized) {
    if (!autoMode) {
      showAlert('Error', 'Google Drive no está disponible.\n\nVerifica tu conexión a internet y recarga la app.', '❌');
    }
    return;
  }

  if (!googleAccessToken) {
    window.pendingDriveUpload = { autoMode };
    
    if (!autoMode) {
      showAlert('Autorizando...', 'Se abrirá una ventana para autorizar el acceso a Google Drive.', 'ℹ️');
      setTimeout(() => {
        try {
          googleTokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (e) {
          console.error('Error al solicitar token:', e);
          showAlert('Error', 'No se pudo solicitar autorización. Intenta de nuevo.', '❌');
        }
      }, 500);
    }
    return;
  }

  uploadToDriveNow(autoMode);
}

async function uploadToDriveNow(autoMode = false) {
  const exportData = {
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    userName: userName,
    state: state,
    license: state.license,
    type: 'full_backup'
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });

  const metadata = {
    name: `focowork_completo_${todayKey()}.focowork`,
    mimeType: 'application/json'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  try {
    console.log('📤 Subiendo archivo a Drive...');
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      body: form
    });

    const responseData = await res.json();

    if (!res.ok) {
      console.error('❌ Error de Drive:', responseData);
      throw new Error(responseData.error?.message || 'Error subiendo a Drive');
    }

    console.log('✅ Archivo subido exitosamente:', responseData);
    if (!autoMode) {
      showAlert('✅ Exportado a Drive', `Backup subido correctamente a Google Drive\n\nArchivo: ${metadata.name}`, '✅');
    }
  } catch (err) {
    console.error('❌ Error en subida a Drive:', err);
    if (!autoMode) {
      showAlert('Error Drive', `No se pudo subir a Drive:\n${err.message}\n\nIntenta de nuevo o usa la exportación local.`, '❌');
    }
  }
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('Google script cargado');
      setTimeout(() => resolve(), 500);
    };
    
    script.onerror = () => {
      console.error('Error cargando Google script');
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    
    document.head.appendChild(script);
  });
}

/* ================= CONFIGURACIÓN DE BACKUPS ================= */
function openBackupConfigModal() {
  const checkbox = $('autoDriveBackupCheckbox');
  if (checkbox) checkbox.checked = state.autoDriveBackup;
  openModal('modalBackupConfig');
}

function saveBackupConfig() {
  const checkbox = $('autoDriveBackupCheckbox');
  if (checkbox) {
    state.autoDriveBackup = checkbox.checked;
    save();
    closeModal('modalBackupConfig');
    showAlert('Configuración guardada', state.autoDriveBackup ? 'Backups automáticos en Drive activados' : 'Backups automáticos en Drive desactivados', '✅');
  }
}

/* ================= DAILY RESET ================= */
function resetDayIfNeeded() {
  if (state.day !== todayKey()) {
    state.day = todayKey();
    state.focus = {};
    save();
  }
}

/* ================= SISTEMA DE LICENCIAS ================= */
async function loadLicenseFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.focowork,.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const license = JSON.parse(text);

      if (!license.signature || !license.clientId) {
        showAlert('Archivo inválido', 'Este no es un archivo de licencia válido', '❌');
        return;
      }

      if (license.expiryDate) {
        const expiry = new Date(license.expiryDate);
        if (expiry < new Date()) {
          showAlert('Licencia caducada', 'Esta licencia ha expirado el ' + expiry.toLocaleDateString(), '⏰');
          return;
        }
      }

      state.isFull = true;
      state.license = license;
      save();
      updateUI();

      const expiryText = license.expiryDate
        ? `Válida hasta: ${new Date(license.expiryDate).toLocaleDateString()}`
        : 'Sin límite de tiempo';

      showAlert(
        '¡Licencia activada!',
        `FocoWork completo activado\n\nCliente: ${license.clientName}\n${expiryText}\n\n¡Disfruta de clientes ilimitados!`,
        '🎉'
      );
    } catch (err) {
      showAlert('Error', 'No se pudo leer el archivo de licencia', '❌');
    }
  };

  input.click();
}

function requestLicense() {
  const msg = `Hola, necesito una licencia de FocoWork completo`;
  window.open(`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`);
}

/* ================= EXPORTACIÓN/IMPORTACIÓN ================= */
function exportCurrentWork() {
  const client = state.clients[state.currentClientId];
  if (!client) {
    showAlert('Sin cliente', 'Selecciona un cliente primero', '⚠️');
    return;
  }

  const workData = {
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    client: client,
    userName: userName
  };

  const dataStr = JSON.stringify(workData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `trabajo_${client.name.replace(/[^a-z0-9]/gi, '_')}_${todayKey()}.focowork`;
  a.click();

  URL.revokeObjectURL(url);

  showAlert('Trabajo guardado', 'El archivo se ha descargado correctamente.\n\n¡Guárdalo en lugar seguro!', '💾');
}

function importWork() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.focowork,.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const fileData = JSON.parse(text);

      if (fileData.type === 'full_backup') {
        handleBackupFile(fileData);
        return;
      }

      if (!fileData.client || !fileData.version) {
        showAlert('Archivo inválido', 'Este archivo no es un trabajo válido de FocoWork', '❌');
        return;
      }

      $('importClientName').textContent = fileData.client.name;
      $('importClientTime').textContent = formatTime(fileData.client.total);
      $('importClientPhotos').textContent = fileData.client.photos.length;
      $('importClientNotes').textContent = fileData.client.notes ? '✓ Sí' : '— No';

      window.pendingImport = fileData;

      openModal('modalImportWork');
    } catch (err) {
      showAlert('Error', 'No se pudo leer el archivo', '❌');
    }
  };

  input.click();
}

function confirmImport() {
  if (!window.pendingImport) return;

  const workData = window.pendingImport;
  const newId = uid();

  state.clients[newId] = {
    ...workData.client,
    id: newId,
    active: true
  };

  state.currentClientId = newId;
  state.currentActivity = ACTIVITIES.WORK;
  state.sessionElapsed = 0;
  state.lastTick = Date.now();
  isWorkpadInitialized = false;
  areTasksInitialized = false;

  save();
  updateUI();
  closeModal('modalImportWork');

  showAlert('Trabajo importado', `Cliente "${workData.client.name}" importado correctamente\n\nTiempo: ${formatTime(workData.client.total)}\nFotos: ${workData.client.photos.length}`, '✅');

  window.pendingImport = null;
}

/* ================= BACKUP COMPLETO ================= */
function exportAllData() {
  const dataSize = getStorageSize();

  const exportData = {
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    userName: userName,
    state: state,
    license: state.license,
    type: 'full_backup'
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `focowork_completo_${todayKey()}.focowork`;
  a.click();

  URL.revokeObjectURL(url);

  showAlert('Backup completo', `Todos tus datos han sido exportados.\n\nTamaño: ${dataSize}\n\n¡Guarda este archivo en lugar seguro!`, '💾');
}

function handleBackupFile(backupData) {
  if (!backupData.state || !backupData.version) {
    showAlert('Archivo inválido', 'Este archivo de backup está corrupto', '❌');
    return;
  }

  const clientCount = Object.keys(backupData.state.clients).length;
  const activeCount = Object.values(backupData.state.clients).filter(c => c.active).length;

  $('importBackupClients').textContent = clientCount;
  $('importBackupActive').textContent = activeCount;
  $('importBackupDate').textContent = new Date(backupData.exportDate).toLocaleDateString();
  $('importBackupLicense').textContent = backupData.license ? '✓ Sí' : '— No';

  window.pendingBackup = backupData;

  openModal('modalImportBackup');
}

function confirmImportBackup() {
  if (!window.pendingBackup) return;

  const backupData = window.pendingBackup;

  if (backupData.state) state = backupData.state;
  if (backupData.userName) {
    userName = backupData.userName;
    localStorage.setItem("focowork_user_name", userName);
  }
  if (backupData.license) {
    state.license = backupData.license;
    state.isFull = true;
  }

  isWorkpadInitialized = false;
  areTasksInitialized = false;

  save();
  updateUI();
  closeModal('modalImportBackup');

  const clientCount = Object.keys(state.clients).length;
  showAlert('Backup restaurado', `✅ Backup completo restaurado correctamente\n\n${clientCount} clientes recuperados\nLicencia: ${state.license ? 'Activada' : 'No incluida'}`, '🎉');

  window.pendingBackup = null;

  setTimeout(() => location.reload(), 2000);
}

/* ================= UTILIDADES DE ALMACENAMIENTO ================= */
function getStorageSize() {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }

  if (total < 1024) return total + ' bytes';
  if (total < 1024 * 1024) return (total / 1024).toFixed(2) + ' KB';
  return (total / (1024 * 1024)).toFixed(2) + ' MB';
}

function showStorageInfo() {
  const size = getStorageSize();
  const clientCount = Object.keys(state.clients).length;
  const activeCount = Object.values(state.clients).filter(c => c.active).length;
  const closedCount = clientCount - activeCount;

  let totalPhotos = 0;
  Object.values(state.clients).forEach(c => totalPhotos += c.photos.length);

  const avgPhotoSize = totalPhotos > 0 ? '~' + (parseFloat(size) / totalPhotos).toFixed(0) + ' KB/foto' : 'N/A';

  showAlert(
    'Uso de almacenamiento',
    `📊 Espacio usado: ${size}\n\n` +
    `👥 Clientes totales: ${clientCount}\n` +
    `   • Activos: ${activeCount}\n` +
    `   • Cerrados: ${closedCount}\n\n` +
    `📷 Fotos totales: ${totalPhotos}\n` +
    `   ${avgPhotoSize}\n\n` +
    `💡 Consejo: Exporta y borra clientes cerrados para liberar espacio`,
    '📊'
  );
}

function resetTodayFocus() {
  state.focus = {};
  state.day = todayKey();
  save();
  showAlert('Enfoque reseteado', 'Los datos de enfoque de hoy han sido reseteados.\n\nAhora solo contabilizará tiempo dentro del horario configurado.', '✅');
}

/* ================= TIME ENGINE ================= */
function tick() {
  resetDayIfNeeded();

  const client = state.clients[state.currentClientId];
  if (!client || !client.active || !state.currentActivity || !state.lastTick) {
    state.lastTick = Date.now();
    return;
  }

  const now = Date.now();
  const elapsed = Math.floor((now - state.lastTick) / 1000);
  if (elapsed <= 0) return;

  state.lastTick = now;
  state.sessionElapsed += elapsed;
  client.total += elapsed;

  client.activities[state.currentActivity] = (client.activities[state.currentActivity] || 0) + elapsed;

  // Contabilizar tiempo facturable
  if (state.focusSchedule.enabled) {
    if (isWithinFocusSchedule()) {
      client.billableTime = (client.billableTime || 0) + elapsed;
      state.focus[state.currentActivity] = (state.focus[state.currentActivity] || 0) + elapsed;
    }
  } else {
    client.billableTime = (client.billableTime || 0) + elapsed;
    state.focus[state.currentActivity] = (state.focus[state.currentActivity] || 0) + elapsed;
  }

  save();
  updateUI();
}

setInterval(tick, 1000);

/* ================= ACTIVIDADES ================= */
function setActivity(activity) {
  const client = state.clients[state.currentClientId];
  if (!client || !client.active) {
    showAlert('Sin cliente', 'Primero selecciona un cliente activo', '⚠️');
    return;
  }

  state.currentActivity = activity;
  state.sessionElapsed = 0;
  state.lastTick = Date.now();
  save();
  updateUI();
}

/* ================= WORKPAD ================= */
let workpadTimeout = null;
let isWorkpadInitialized = false;

function updateWorkpad() {
  const workpadArea = $('clientWorkpad');
  const client = state.clients[state.currentClientId];

  if (!workpadArea || !client) {
    if (workpadArea) {
      workpadArea.style.display = 'none';
      isWorkpadInitialized = false;
    }
    return;
  }

  workpadArea.style.display = 'block';

  const savedNote = client.notes || '';
  if (workpadArea.value !== savedNote && !isWorkpadInitialized) {
    workpadArea.value = savedNote;
  }

  if (!isWorkpadInitialized) {
    workpadArea.oninput = handleWorkpadInput;
    isWorkpadInitialized = true;
  }
}

function handleWorkpadInput(e) {
  const client = state.clients[state.currentClientId];
  if (!client) return;

  client.notes = e.target.value;
  clearTimeout(workpadTimeout);
  workpadTimeout = setTimeout(save, 1000);
}

/* ================= TASKS ================= */
let taskTimeouts = { urgent: null, important: null, later: null };
let areTasksInitialized = false;

function updateTasks() {
  const client = state.clients[state.currentClientId];
  
  const urgentArea = $('taskUrgent');
  const importantArea = $('taskImportant');
  const laterArea = $('taskLater');

  if (!urgentArea || !importantArea || !laterArea) return;

  if (!client) {
    urgentArea.style.display = 'none';
    importantArea.style.display = 'none';
    laterArea.style.display = 'none';
    areTasksInitialized = false;
    return;
  }

  urgentArea.style.display = 'block';
  importantArea.style.display = 'block';
  laterArea.style.display = 'block';

  if (!client.tasks) {
    client.tasks = { urgent: "", important: "", later: "" };
  }

  if (!areTasksInitialized) {
    // Área de urgentes con fecha de entrega
    let urgentText = client.tasks.urgent || '';
    
    // Si hay fecha de entrega, mostrarla al principio
    if (client.deliveryDate) {
      const deliveryDate = new Date(client.deliveryDate);
      const dateStr = deliveryDate.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const delivery = new Date(deliveryDate);
      delivery.setHours(0, 0, 0, 0);
      
      const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
      
      let urgencyPrefix = '';
      if (diffDays < 0) {
        urgencyPrefix = `⚠️ VENCIDO (${Math.abs(diffDays)}d) - ${dateStr}\n`;
      } else if (diffDays === 0) {
        urgencyPrefix = `🔴 HOY - ${dateStr}\n`;
      } else if (diffDays === 1) {
        urgencyPrefix = `🟡 MAÑANA - ${dateStr}\n`;
      } else if (diffDays <= 3) {
        urgencyPrefix = `🟡 ${diffDays} DÍAS - ${dateStr}\n`;
      } else {
        urgencyPrefix = `📅 Entrega: ${dateStr}\n`;
      }
      
      urgentText = urgencyPrefix + (urgentText.replace(/^[⚠️🔴🟡📅].*\n/, ''));
    }
    
    urgentArea.value = urgentText;
    importantArea.value = client.tasks.important || '';
    laterArea.value = client.tasks.later || '';

    urgentArea.oninput = (e) => handleTaskInput('urgent', e);
    importantArea.oninput = (e) => handleTaskInput('important', e);
    laterArea.oninput = (e) => handleTaskInput('later', e);

    areTasksInitialized = true;
  }
}

function handleTaskInput(taskType, e) {
  const client = state.clients[state.currentClientId];
  if (!client || !client.tasks) return;

  client.tasks[taskType] = e.target.value;

  clearTimeout(taskTimeouts[taskType]);
  taskTimeouts[taskType] = setTimeout(save, 1000);
}

function setDeliveryDate() {
  const client = state.clients[state.currentClientId];
  if (!client) {
    showAlert('Sin cliente', 'Selecciona un cliente primero', '⚠️');
    return;
  }

  const currentDate = client.deliveryDate 
    ? new Date(client.deliveryDate).toISOString().split('T')[0] 
    : '';

  $('inputDeliveryDate').value = currentDate;
  openModal('modalDeliveryDate');

  setTimeout(() => $('inputDeliveryDate').focus(), 300);
}

function saveDeliveryDate() {
  const client = state.clients[state.currentClientId];
  if (!client) return;

  const dateValue = $('inputDeliveryDate').value;
  
  if (dateValue) {
    client.deliveryDate = dateValue;
    showAlert('Fecha guardada', `Fecha de entrega establecida para el ${new Date(dateValue).toLocaleDateString('es-ES')}`, '✅');
  } else {
    client.deliveryDate = null;
    showAlert('Fecha eliminada', 'Se ha eliminado la fecha de entrega', 'ℹ️');
  }

  areTasksInitialized = false; // Forzar actualización de tareas
  save();
  updateUI();
  closeModal('modalDeliveryDate');
}

/* ================= UI ================= */
function updateUI() {
  const client = state.currentClientId ? state.clients[state.currentClientId] : null;

  $("clientName").textContent = client ? `Cliente: ${client.name}${client.active ? "" : " (cerrado)"}` : "Sin cliente activo";

  $("activityName").textContent = state.currentActivity ? activityLabel(state.currentActivity) : "—";

  $("timer").textContent = client && client.active ? formatTime(state.sessionElapsed) : "00:00:00";

  if ($("clientTotal")) {
    $("clientTotal").textContent = client ? `Total cliente: ${formatTime(client.total)}` : "";
  }

  // Mostrar tiempo facturable si hay horario configurado
  if (client && state.focusSchedule.enabled) {
    const billableBox = $("billableTimeBox");
    if (billableBox) {
      const billableTime = client.billableTime || 0;
      billableBox.textContent = `💰 Facturable: ${formatTime(billableTime)}`;
      billableBox.style.display = "block";
    }
  } else if ($("billableTimeBox")) {
    $("billableTimeBox").style.display = "none";
  }

  // Mostrar fecha de entrega si existe
  if (client && client.deliveryDate) {
    updateDeliveryDateDisplay(client);
  } else if ($("deliveryDateBox")) {
    $("deliveryDateBox").style.display = "none";
  }

  document.querySelectorAll(".activity").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.activity === state.currentActivity);
  });

  $("cameraBtn").style.display = client && client.active ? "block" : "none";

  const deleteBtn = $("deleteClientBtn");
  if (deleteBtn) deleteBtn.style.display = client && !client.active ? "block" : "none";

  $("versionBox").style.display = state.isFull ? "none" : "block";

  if (state.isFull && state.license) updateLicenseInfo();

  updateFocusScheduleStatus();
  updateWorkpad();
  updateTasks();
  renderPhotoGallery();
}

function updateDeliveryDateDisplay(client) {
  const deliveryBox = $("deliveryDateBox");
  if (!deliveryBox) {
    console.warn('deliveryDateBox no encontrado');
    return;
  }

  if (!client || !client.deliveryDate) {
    deliveryBox.style.display = "none";
    deliveryBox.classList.add("hidden");
    return;
  }

  const deliveryDate = new Date(client.deliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(deliveryDate);
  delivery.setHours(0, 0, 0, 0);

  const diffTime = delivery - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let message = "";
  let className = "delivery-info";

  if (diffDays < 0) {
    message = `⚠️ Entrega vencida (${Math.abs(diffDays)} días)`;
    className = "delivery-overdue";
  } else if (diffDays === 0) {
    message = "🔴 ¡Entrega HOY!";
    className = "delivery-today";
  } else if (diffDays === 1) {
    message = "🟡 Entrega MAÑANA";
    className = "delivery-tomorrow";
  } else if (diffDays <= 3) {
    message = `🟡 Entrega en ${diffDays} días`;
    className = "delivery-soon";
  } else {
    message = `📅 Entrega: ${deliveryDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    className = "delivery-normal";
  }

  deliveryBox.textContent = message;
  deliveryBox.className = className;
  deliveryBox.classList.remove("hidden");
  deliveryBox.style.display = "block";
}

function updateLicenseInfo() {
  const infoEl = $("licenseInfo");
  if (!infoEl || !state.license) return;

  const expiryText = state.license.expiryDate
    ? `Válida hasta: ${new Date(state.license.expiryDate).toLocaleDateString()}`
    : 'Sin límite';

  infoEl.textContent = `✓ Licencia activa - ${state.license.clientName} - ${expiryText}`;
  infoEl.style.display = 'block';
}

function updateFocusScheduleStatus() {
  const statusEl = $("focusScheduleStatus");
  if (!statusEl) return;

  if (state.focusSchedule.enabled && !isWithinFocusSchedule()) {
    statusEl.textContent = "⏳ Fuera de horario de enfoque";
    statusEl.style.display = "block";
  } else {
    statusEl.style.display = "none";
  }
}

/* ================= CLIENTES ================= */
function newClient() {
  const activeClients = Object.values(state.clients).filter(c => c.active);
  if (!state.isFull && activeClients.length >= 2) {
    showAlert('Versión demo', 'Máximo 2 clientes activos.\n\nActiva la versión completa para clientes ilimitados.', '🔒');
    return;
  }

  $('inputNewClient').value = '';
  openModal('modalNewClient');

  setTimeout(() => $('inputNewClient').focus(), 300);
}

function confirmNewClient() {
  const name = $('inputNewClient').value.trim();
  if (!name) return;

  const id = uid();
  state.clients[id] = {
    id,
    name,
    active: true,
    total: 0,
    billableTime: 0,
    activities: {},
    photos: [],
    notes: "",
    deliveryDate: null,
    extraHours: [],
    tasks: {
      urgent: "",
      important: "",
      later: ""
    }
  };

  state.currentClientId = id;
  state.currentActivity = ACTIVITIES.WORK;
  state.sessionElapsed = 0;
  state.lastTick = Date.now();
  isWorkpadInitialized = false;
  areTasksInitialized = false;

  save();
  updateUI();
  closeModal('modalNewClient');
}

function changeClient() {
  const actives = Object.values(state.clients).filter(c => c.active);
  if (!actives.length) {
    showAlert('Sin clientes', 'No hay clientes activos', '⚠️');
    return;
  }

  const list = $('activeClientsList');
  list.innerHTML = '';

  actives.forEach(client => {
    const item = document.createElement('div');
    item.className = 'client-item';
    
    let deliveryInfo = '';
    if (client.deliveryDate) {
      const deliveryDate = new Date(client.deliveryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const delivery = new Date(deliveryDate);
      delivery.setHours(0, 0, 0, 0);
      
      const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        deliveryInfo = ` • <span style="color: #ef4444;">⚠️ Vencido</span>`;
      } else if (diffDays === 0) {
        deliveryInfo = ` • <span style="color: #ef4444;">🔴 HOY</span>`;
      } else if (diffDays <= 3) {
        deliveryInfo = ` • <span style="color: #f59e0b;">🟡 ${diffDays}d</span>`;
      } else {
        deliveryInfo = ` • 📅 ${deliveryDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`;
      }
    }
    
    item.innerHTML = `
      <div class="client-name">${client.name}</div>
      <div class="client-time">Total: ${formatTime(client.total)}${deliveryInfo}</div>
    `;
    item.onclick = () => selectClient(client.id);
    list.appendChild(item);
  });

  openModal('modalChangeClient');
}

function selectClient(clientId) {
  state.currentClientId = clientId;
  state.currentActivity = ACTIVITIES.WORK;
  state.sessionElapsed = 0;
  state.lastTick = Date.now();
  isWorkpadInitialized = false;
  areTasksInitialized = false;

  save();
  updateUI();
  closeModal('modalChangeClient');
}

function closeClient() {
  const client = state.clients[state.currentClientId];
  if (!client) return;

  if (client.photos.length > 0 || (client.notes && client.notes.trim())) {
    $('exportBeforeCloseText').textContent =
      `Este cliente tiene ${client.photos.length} fotos y notas.\n\n¿Deseas exportar el trabajo antes de cerrar?`;

    window.clientToClose = client.id;
    openModal('modalExportBeforeClose');
    return;
  }

  $('closeClientText').textContent =
    `Cliente: ${client.name}\nTiempo total: ${formatTime(client.total)}`;

  openModal('modalCloseClient');
}

function confirmCloseClient() {
  const clientId = window.clientToClose || state.currentClientId;
  const client = state.clients[clientId];
  if (!client) return;

  client.active = false;

  state.currentClientId = null;
  state.currentActivity = null;
  state.lastTick = null;
  isWorkpadInitialized = false;
  areTasksInitialized = false;

  save();
  updateUI();
  closeModal('modalCloseClient');
  closeModal('modalExportBeforeClose');

  showAlert('Cliente cerrado', `${client.name}\nTiempo total: ${formatTime(client.total)}`, '✅');

  window.clientToClose = null;
}

function exportAndClose() {
  exportCurrentWork();
  setTimeout(confirmCloseClient, 500);
}

/* ================= HISTÓRICO ================= */
function showHistory() {
  const closed = Object.values(state.clients).filter(c => !c.active);
  if (!closed.length) {
    showAlert('Sin histórico', 'No hay clientes cerrados', 'ℹ️');
    return;
  }

  renderHistoryList(closed);
  openModal('modalHistory');
}

function renderHistoryList(clients) {
  const list = $('historyClientsList');
  list.innerHTML = '';

  if (!clients.length) {
    list.innerHTML = '<p class="modal-text" style="opacity: 0.6; text-align: center;">Sin resultados</p>';
    return;
  }

  clients.forEach(client => {
    const item = document.createElement('div');
    item.className = 'client-item';

    const notesPreview = client.notes && client.notes.trim()
      ? ` • ${client.notes.slice(0, 30)}${client.notes.length > 30 ? '...' : ''}`
      : '';

    item.innerHTML = `
      <div class="client-name">${client.name}</div>
      <div class="client-time">Total: ${formatTime(client.total)} • ${client.photos.length} fotos${notesPreview}</div>
    `;
    item.onclick = () => selectHistoryClient(client.id);
    list.appendChild(item);
  });
}

function selectHistoryClient(clientId) {
  state.currentClientId = clientId;
  state.currentActivity = null;
  state.sessionElapsed = 0;
  state.lastTick = null;
  isWorkpadInitialized = false;
  areTasksInitialized = false;

  updateUI();
  closeModal('modalHistory');
}

/* ================= BORRAR CLIENTE ================= */
function deleteCurrentClient() {
  const client = state.clients[state.currentClientId];
  if (!client || client.active) return;

  $('deleteClientText').textContent =
    `Cliente: ${client.name}\nTiempo: ${formatTime(client.total)}\nFotos: ${client.photos.length}\n\nEsta acción no se puede deshacer.`;

  $('inputDeleteConfirm').value = '';
  openModal('modalDeleteClient');

  setTimeout(() => $('inputDeleteConfirm').focus(), 300);
}

function confirmDeleteClient() {
  const confirm = $('inputDeleteConfirm').value.trim().toUpperCase();

  if (confirm !== 'BORRAR') {
    showAlert('Error', 'Debes escribir BORRAR para confirmar', '⚠️');
    return;
  }

  delete state.clients[state.currentClientId];
  state.currentClientId = null;
  state.currentActivity = null;
  state.lastTick = null;
  isWorkpadInitialized = false;
  areTasksInitialized = false;

  save();
  updateUI();
  closeModal('modalDeleteClient');

  showAlert('Cliente eliminado', 'El cliente ha sido eliminado definitivamente', '🗑️');
}

/* ================= FOTOS ================= */
let photoToDelete = null;

function addPhotoToClient() {
  const client = state.clients[state.currentClientId];
  if (!client) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;

        if (width > MAX) {
          height *= MAX / width;
          width = MAX;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        client.photos.push({
          id: uid(),
          date: new Date().toISOString(),
          data: canvas.toDataURL("image/jpeg", 0.7)
        });

        save();
        renderPhotoGallery();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  input.click();
}

function renderPhotoGallery() {
  const gallery = $("photoGallery");
  if (!gallery) return;
  gallery.innerHTML = "";

  const client = state.clients[state.currentClientId];
  if (!client || !client.photos.length) return;

  [...client.photos]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach(p => {
      const img = document.createElement("img");
      img.src = p.data;
      img.className = "photo-thumb";

      img.onclick = () => {
        const w = window.open();
        if (w) w.document.write(`<img src="${p.data}" style="width:100%;background:#000">`);
      };

      img.oncontextmenu = (e) => {
        e.preventDefault();
        photoToDelete = p.id;
        openModal('modalDeletePhoto');
      };

      gallery.appendChild(img);
    });
}

function confirmDeletePhoto() {
  if (!photoToDelete) return;

  const client = state.clients[state.currentClientId];
  if (!client) return;

  client.photos = client.photos.filter(f => f.id !== photoToDelete);
  photoToDelete = null;

  save();
  renderPhotoGallery();
  closeModal('modalDeletePhoto');
}

/* ================= ENFOQUE ================= */
function showFocus() {
  const total = Object.values(state.focus).reduce((a, b) => a + b, 0);
  if (!total) {
    showAlert('Sin datos', 'Aún no hay datos de enfoque hoy', 'ℹ️');
    return;
  }

  const trabajo = state.focus[ACTIVITIES.WORK] || 0;
  const pct = Math.round((trabajo / total) * 100);

  $('modalUserName').textContent = userName;
  $('modalTotalTime').textContent = formatTime(total);

  const list = $('modalActivityList');
  list.innerHTML = '';

  for (const act in state.focus) {
    const seconds = state.focus[act];
    const actPct = Math.round((seconds / total) * 100);

    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <span class="activity-name">${activityLabel(act)}</span>
      <div class="activity-stats">
        <span class="activity-time">${formatTime(seconds)}</span>
        <span class="activity-percent">${actPct}%</span>
      </div>
    `;
    list.appendChild(item);
  }

  const focusState = $('modalFocusState');
  if (pct >= 64) {
    focusState.className = 'focus-state enfocado';
    focusState.innerHTML = '🟢 Enfocado';
  } else if (pct >= 40) {
    focusState.className = 'focus-state atencion';
    focusState.innerHTML = '🟡 Atención';
  } else {
    focusState.className = 'focus-state disperso';
    focusState.innerHTML = '🔴 Disperso';
  }

  openModal('modalEnfoque');
}

/* ================= CSV ================= */
function exportTodayCSV() {
  let csv = "Usuario,Cliente,Tiempo,Notas\n";
  Object.values(state.clients).forEach(c => {
    const notes = (c.notes || '').replace(/[\n\r]/g, ' ').replace(/"/g, '""');
    csv += `${userName},"${c.name}",${formatTime(c.total)},"${notes}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `focowork_${todayKey()}.csv`;
  a.click();

  showAlert('CSV exportado', 'El archivo se ha descargado correctamente', '📄');
}

/* ================= HORAS EXTRAS ================= */
function addExtraHours() {
  const client = state.clients[state.currentClientId];
  if (!client) {
    showAlert('Sin cliente', 'Selecciona un cliente primero', '⚠️');
    return;
  }

  $('inputExtraHours').value = '';
  $('inputExtraDescription').value = '';
  openModal('modalExtraHours');

  setTimeout(() => $('inputExtraHours').focus(), 300);
}

function saveExtraHours() {
  const client = state.clients[state.currentClientId];
  if (!client) return;

  const hours = parseFloat($('inputExtraHours').value);
  const description = $('inputExtraDescription').value.trim();

  if (!hours || hours <= 0) {
    showAlert('Error', 'Introduce un número de horas válido', '⚠️');
    return;
  }

  if (!client.extraHours) client.extraHours = [];

  const extraEntry = {
    id: uid(),
    date: new Date().toISOString(),
    hours: hours,
    seconds: Math.round(hours * 3600),
    description: description || 'Horas extra',
    billable: true
  };

  client.extraHours.push(extraEntry);
  client.billableTime = (client.billableTime || 0) + extraEntry.seconds;

  save();
  closeModal('modalExtraHours');
  showAlert('Horas añadidas', `${hours}h añadidas correctamente\n\n"${extraEntry.description}"`, '✅');
}

function showExtraHours() {
  const client = state.clients[state.currentClientId];
  if (!client) {
    showAlert('Sin cliente', 'Selecciona un cliente primero', '⚠️');
    return;
  }

  if (!client.extraHours || !client.extraHours.length) {
    showAlert('Sin horas extra', 'Este cliente no tiene horas extra registradas', 'ℹ️');
    return;
  }

  const list = $('extraHoursList');
  list.innerHTML = '';

  let totalExtra = 0;
  client.extraHours.forEach(entry => {
    totalExtra += entry.seconds;
    
    const item = document.createElement('div');
    item.className = 'extra-hour-item';
    item.innerHTML = `
      <div class="extra-hour-header">
        <span class="extra-hour-amount">⏱️ ${entry.hours}h</span>
        <span class="extra-hour-date">${new Date(entry.date).toLocaleDateString('es-ES')}</span>
      </div>
      <div class="extra-hour-description">${entry.description}</div>
      <button class="btn-danger-small" onclick="deleteExtraHour('${entry.id}')">🗑️ Eliminar</button>
    `;
    list.appendChild(item);
  });

  $('extraHoursTotal').textContent = formatTime(totalExtra);

  openModal('modalViewExtraHours');
}

function deleteExtraHour(entryId) {
  const client = state.clients[state.currentClientId];
  if (!client || !client.extraHours) return;

  const entry = client.extraHours.find(e => e.id === entryId);
  if (!entry) return;

  if (!confirm(`¿Eliminar ${entry.hours}h de horas extra?\n\n"${entry.description}"`)) return;

  client.extraHours = client.extraHours.filter(e => e.id !== entryId);
  client.billableTime = (client.billableTime || 0) - entry.seconds;

  save();
  closeModal('modalViewExtraHours');
  showAlert('Hora eliminada', 'La entrada de horas extra ha sido eliminada', '🗑️');
}

/* ================= REPORT MEJORADO ================= */
function generateReport() {
  const client = state.clients[state.currentClientId];
  if (!client) {
    showAlert('Sin cliente', 'Selecciona un cliente primero', '⚠️');
    return;
  }

  // Calcular tiempo facturable
  const billableTime = client.billableTime || 0;
  const extraHoursTotal = (client.extraHours || []).reduce((sum, e) => sum + e.seconds, 0);
  const totalBillable = billableTime;

  // Desglose de actividades facturables
  let activitiesBreakdown = '';
  const billableActivities = {};
  
  // Solo mostrar actividades si hay horario configurado
  if (state.focusSchedule.enabled) {
    activitiesBreakdown = '\n📊 DESGLOSE DE ACTIVIDADES FACTURABLES:\n';
    for (const act in client.activities) {
      const time = client.activities[act];
      activitiesBreakdown += `   • ${activityLabel(act)}: ${formatTime(time)}\n`;
    }
  }

  // Horas extra
  let extraHoursSection = '';
  if (client.extraHours && client.extraHours.length > 0) {
    extraHoursSection = '\n⏱️ HORAS EXTRA:\n';
    client.extraHours.forEach(entry => {
      const date = new Date(entry.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      extraHoursSection += `   • ${date}: ${entry.hours}h - ${entry.description}\n`;
    });
    extraHoursSection += `   TOTAL EXTRA: ${formatTime(extraHoursTotal)}\n`;
  }

  // Notas
  const notesSection = client.notes && client.notes.trim() 
    ? `\n📝 NOTAS:\n${client.notes}\n` 
    : '';

  // Fecha de entrega
  let deliverySection = '';
  if (client.deliveryDate) {
    const deliveryDate = new Date(client.deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delivery = new Date(deliveryDate);
    delivery.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
    
    let status = '';
    if (diffDays < 0) status = '⚠️ VENCIDA';
    else if (diffDays === 0) status = '🔴 HOY';
    else if (diffDays <= 3) status = `🟡 ${diffDays} días`;
    else status = '📅';
    
    deliverySection = `\n📅 FECHA DE ENTREGA: ${deliveryDate.toLocaleDateString('es-ES')} ${status}\n`;
  }

  // Configuración horaria
  const scheduleInfo = state.focusSchedule.enabled 
    ? `\n⏰ HORARIO FACTURABLE: ${state.focusSchedule.start} - ${state.focusSchedule.end}\n` 
    : '\n⏰ Sin horario facturable configurado (todo el tiempo cuenta)\n';

  const reportText = 
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `       📋 INFORME DE PROYECTO\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 CLIENTE: ${client.name}\n` +
    `📅 Fecha: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}\n` +
    `👨‍💼 Responsable: ${userName}\n` +
    deliverySection +
    scheduleInfo +
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱️ TIEMPO TOTAL TRABAJADO: ${formatTime(client.total)}\n` +
    `💰 TIEMPO FACTURABLE: ${formatTime(totalBillable)}\n` +
    `${extraHoursSection}` +
    activitiesBreakdown +
    `\n📷 FOTOGRAFÍAS: ${client.photos.length}\n` +
    notesSection +
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Generado con FocoWork v${APP_VERSION}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  $('reportContent').textContent = reportText;
  openModal('modalReport');
}

function copyReport() {
  const reportText = $('reportContent').textContent;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(reportText)
      .then(() => {
        showAlert('Copiado', 'Informe copiado al portapapeles', '✅');
      })
      .catch(() => {
        fallbackCopy(reportText);
      });
  } else {
    fallbackCopy(reportText);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    document.execCommand('copy');
    showAlert('Copiado', 'Informe copiado al portapapeles', '✅');
  } catch (err) {
    showAlert('Error', 'No se pudo copiar. Copia manualmente desde el modal.', '⚠️');
  }
  
  document.body.removeChild(textarea);
}

async function shareReport() {
  const reportText = $('reportContent').textContent;
  const client = state.clients[state.currentClientId];
  if (!client) return;

  // Convertir fotos base64 a File
  const files = [];
  for (let i = 0; i < client.photos.length; i++) {
    const p = client.photos[i];
    const res = await fetch(p.data);
    const blob = await res.blob();
    const file = new File(
      [blob],
      `foto_${i + 1}.jpg`,
      { type: blob.type }
    );
    files.push(file);
  }

  // Comprovar si el navegador pot compartir fitxers
  if (
    navigator.share &&
    (!files.length || navigator.canShare({ files }))
  ) {
    try {
      await navigator.share({
        title: `Informe - ${client.name}`,
        text: reportText,
        files: files
      });
    } catch (err) {
      copyReport();
    }
  } else {
    copyReport();
  }
}


/* ================= CONFIGURACIÓN DE HORARIO ================= */
function openScheduleModal() {
  const checkbox = $('scheduleEnabled');
  const config = $('scheduleConfig');
  const startInput = $('scheduleStart');
  const endInput = $('scheduleEnd');

  checkbox.checked = state.focusSchedule.enabled;
  startInput.value = state.focusSchedule.start;
  endInput.value = state.focusSchedule.end;

  config.style.display = checkbox.checked ? 'block' : 'none';

  updateSchedulePreview();

  checkbox.onchange = () => {
    config.style.display = checkbox.checked ? 'block' : 'none';
  };

  startInput.oninput = updateSchedulePreview;
  endInput.oninput = updateSchedulePreview;

  openModal('modalSchedule');
}

function updateSchedulePreview() {
  const start = $('scheduleStart').value;
  const end = $('scheduleEnd').value;

  $('schedulePreview').textContent = `${start} - ${end}`;

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const totalMinutes = endMinutes - startMinutes;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  $('scheduleDuration').textContent = `${hours}h ${minutes}m`;
}

function applyPreset(start, end) {
  $('scheduleStart').value = start;
  $('scheduleEnd').value = end;
  updateSchedulePreview();
}

function saveScheduleConfig() {
  const enabled = $('scheduleEnabled').checked;
  const start = $('scheduleStart').value;
  const end = $('scheduleEnd').value;

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  if ((eh * 60 + em) <= (sh * 60 + sm)) {
    showAlert('Error', 'La hora de fin debe ser posterior a la hora de inicio', '⚠️');
    return;
  }

  state.focusSchedule.enabled = enabled;
  state.focusSchedule.start = start;
  state.focusSchedule.end = end;

  save();
  closeModal('modalSchedule');

  const message = enabled
    ? `Horario activado: ${start} - ${end}\n\nEl enfoque solo contabilizará tiempo dentro de este horario.`
    : 'Horario desactivado\n\nEl enfoque contabilizará todo el tiempo trabajado.';

  showAlert('Configuración guardada', message, '✅');
}

/* ================= EVENT LISTENERS ================= */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadGoogleScript();
    initGoogleDrive();
  } catch (e) {
    console.error('Error inicializando Google Drive:', e);
  }

  $('newClient').onclick = newClient;
  $('changeClient').onclick = changeClient;
  $('historyBtn').onclick = showHistory;
  $('closeClient').onclick = closeClient;
  $('focusBtn').onclick = showFocus;
  $('scheduleBtn').onclick = openScheduleModal;
  $('todayBtn').onclick = exportTodayCSV;
  $('cameraBtn').onclick = addPhotoToClient;
  $('deleteClientBtn').onclick = deleteCurrentClient;

  if ($('setDeliveryDateBtn')) $('setDeliveryDateBtn').onclick = setDeliveryDate;
  if ($('addExtraHoursBtn')) $('addExtraHoursBtn').onclick = addExtraHours;
  if ($('viewExtraHoursBtn')) $('viewExtraHoursBtn').onclick = showExtraHours;
  if ($('generateReportBtn')) $('generateReportBtn').onclick = generateReport;
  if ($('exportWorkBtn')) $('exportWorkBtn').onclick = exportCurrentWork;
  if ($('importWorkBtn')) $('importWorkBtn').onclick = importWork;
  if ($('exportAllBtn')) $('exportAllBtn').onclick = exportAllData;
  if ($('loadLicenseBtn')) $('loadLicenseBtn').onclick = loadLicenseFile;
  if ($('requestLicenseBtn')) $('requestLicenseBtn').onclick = requestLicense;
  if ($('exportToDriveBtn')) $('exportToDriveBtn').onclick = () => exportAllToDrive(false);
  if ($('backupConfigBtn')) $('backupConfigBtn').onclick = openBackupConfigModal;

  let focusLongPressTimer;
  $('focusBtn').addEventListener('mousedown', () => {
    focusLongPressTimer = setTimeout(() => {
      if (confirm('¿Resetear datos de enfoque de hoy?\n\nEsto NO afecta a los tiempos de clientes, solo a las estadísticas de enfoque diario.')) {
        resetTodayFocus();
      }
    }, 2000);
  });
  $('focusBtn').addEventListener('mouseup', () => clearTimeout(focusLongPressTimer));
  $('focusBtn').addEventListener('touchstart', () => {
    focusLongPressTimer = setTimeout(() => {
      if (confirm('¿Resetear datos de enfoque de hoy?\n\nEsto NO afecta a los tiempos de clientes, solo a las estadísticas de enfoque diario.')) {
        resetTodayFocus();
      }
    }, 2000);
  });
  $('focusBtn').addEventListener('touchend', () => clearTimeout(focusLongPressTimer));

  document.querySelectorAll('.activity').forEach(btn => {
    btn.onclick = () => setActivity(btn.dataset.activity);
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  if ($('inputNewClient')) $('inputNewClient').addEventListener('keypress', e => {
    if (e.key === 'Enter') confirmNewClient();
  });

  if ($('inputDeleteConfirm')) $('inputDeleteConfirm').addEventListener('keypress', e => {
    if (e.key === 'Enter') confirmDeleteClient();
  });

  if ($('searchHistory')) $('searchHistory').addEventListener('input', e => {
    const query = e.target.value.toLowerCase();
    const closed = Object.values(state.clients).filter(c => !c.active);
    const filtered = closed.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.notes || '').toLowerCase().includes(query)
    );
    renderHistoryList(filtered);
  });

  if (state.license && state.license.expiryDate) {
    const expiry = new Date(state.license.expiryDate);
    if (expiry < new Date()) {
      state.isFull = false;
      state.license = null;
      save();
      showAlert('Licencia caducada', 'Tu licencia ha expirado. Contacta para renovarla.', '⏰');
    }
  }

  scheduleFullAutoBackup();
  updateUI();
});

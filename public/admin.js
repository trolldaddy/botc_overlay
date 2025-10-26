const storageNotice = document.getElementById('storageNotice');
const scriptListEl = document.getElementById('scriptList');
const customJsonBlock = document.getElementById('customJsonBlock');
const customNameEl = document.getElementById('customName');
const customJsonEl = document.getElementById('customJson');
const saveCustomButton = document.getElementById('saveCustomButton');
const deleteCustomButton = document.getElementById('deleteCustomButton');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
const LOCAL_SCRIPTS_KEY = 'botc_saved_custom_scripts_v1';
const LOCAL_OPTION_PREFIX = 'local:';
const CUSTOM_NEW_OPTION = '__custom__';
const LOCAL_LAST_CUSTOM_JSON_KEY = 'botc_last_custom_json_v1';
const LOCAL_LAST_CONFIG_KEY = 'botc_last_overlay_config_v1';
const MAX_COMPRESSED_CHUNK_SIZE = window.CompressionHelper?.MAX_CHUNK_SIZE || 4500;
const COMPRESSION_MODE = window.CompressionHelper?.COMPRESSION_MODE || 'lz-string/base64';
const LEGACY_LZMA_MODE = window.CompressionHelper?.LEGACY_LZMA_MODE || 'lzma/base64';
const TWITCH_SEGMENT_LIMIT = 4800;
const MAX_SEGMENT_COUNT = 2;

const decompressCache = new Map();

let builtinScripts = [];
let savedCustomScripts = {};
let twitchAuth = { channelId: null, clientId: null, token: null, userId: null };
let twitchAuthorized = false;

const STATUS_COLORS = {
  success: 'lightgreen',
  error: '#ff8080',
  info: '#9ec5fe'
};

if (storageNotice) {
  storageNotice.innerHTML = [
    '✅ 儲存設定時會更新 Twitch 擴充設定，並同步一份資料到目前瀏覽器，方便再次編輯。',
    '<br />',
    '📌 Twitch 觀眾會直接讀取擴充設定中的劇本資料，不需要 Cookie。'
  ].join('');
}

function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.style.color = STATUS_COLORS[type] || STATUS_COLORS.success;
}

function persistLastCustomJson(value) {
  try {
    if (typeof value === 'string' && value.trim()) {
      window.localStorage?.setItem(LOCAL_LAST_CUSTOM_JSON_KEY, value);
    } else {
      window.localStorage?.removeItem(LOCAL_LAST_CUSTOM_JSON_KEY);
    }
  } catch (err) {
    console.warn('儲存最近自訂劇本內容時發生錯誤:', err);
  }
}

function loadLastCustomJson() {
  try {
    return window.localStorage?.getItem(LOCAL_LAST_CUSTOM_JSON_KEY) || '';
  } catch (err) {
    console.warn('載入最近自訂劇本內容時發生錯誤:', err);
    return '';
  }
}

function persistLastConfig(config) {
  try {
    if (!config) {
      window.localStorage?.removeItem(LOCAL_LAST_CONFIG_KEY);
      return;
    }

    window.localStorage?.setItem(LOCAL_LAST_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('儲存最近的覆蓋設定時失敗:', err);
  }
}

function loadLastConfig() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_LAST_CONFIG_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (err) {
    console.warn('載入最近的覆蓋設定時失敗:', err);
    return null;
  }
}

function computeScriptHash(text) {
  if (typeof text !== 'string' || !text) {
    return '0';
  }

  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  }

  return hash.toString(16);
}

function chunkCompressedText(text) {
  if (typeof text !== 'string' || !text) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += MAX_COMPRESSED_CHUNK_SIZE) {
    chunks.push(text.slice(index, index + MAX_COMPRESSED_CHUNK_SIZE));
  }

  return chunks;
}

async function decompressBase64WithCache(base64, mode = COMPRESSION_MODE) {
  if (typeof base64 !== 'string' || !base64) {
    return '';
  }

  const cacheKey = `${mode || 'default'}:${base64}`;

  if (decompressCache.has(cacheKey)) {
    const cached = decompressCache.get(cacheKey);
    return typeof cached === 'string' ? cached : cached;
  }

  const request = window.CompressionHelper?.decompressFromBase64
    ? window.CompressionHelper.decompressFromBase64(base64, mode)
        .then(result => {
          decompressCache.set(cacheKey, result);
          return result;
        })
        .catch(err => {
          decompressCache.delete(cacheKey);
          throw err;
        })
    : Promise.reject(new Error('瀏覽器不支援解壓縮功能'));

  decompressCache.set(cacheKey, request);
  return request;
}

async function compressCustomJson(normalizedJson) {
  if (!window.CompressionHelper?.compressToBase64) {
    return null;
  }

  const result = await window.CompressionHelper.compressToBase64(normalizedJson);
  if (!result || typeof result.base64 !== 'string') {
    return null;
  }

  return {
    base64: result.base64,
    originalLength: typeof result.originalLength === 'number' ? result.originalLength : normalizedJson.length,
    compressedLength: typeof result.compressedLength === 'number' ? result.compressedLength : result.base64.length
  };
}

async function reconstructCustomJsonFromConfig(config) {
  if (!config || typeof config !== 'object') {
    return '';
  }

  if (typeof config.customJson === 'string' && config.customJson.trim()) {
    return config.customJson;
  }

  const compressionMode = config.compression || COMPRESSION_MODE;

  if (typeof config.chunk0 === 'string' && config.chunk0.trim()) {
    const chunkCount = typeof config.chunkCount === 'number' ? config.chunkCount : 1;
    if (chunkCount > 1) {
      const extraChunk = typeof config.extraChunkData === 'string' ? config.extraChunkData : '';
      if (!extraChunk) {
        throw new Error('缺少自訂劇本的額外資料區塊');
      }

      try {
        return await decompressBase64WithCache(config.chunk0 + extraChunk, compressionMode);
      } catch (err) {
        console.error('解壓縮分段自訂劇本失敗:', err);
        throw err;
      }
    }

    try {
      return await decompressBase64WithCache(config.chunk0, compressionMode);
    } catch (err) {
      console.error('解壓縮自訂劇本失敗:', err);
    }
  }

  if (Array.isArray(config.compressedChunks) && config.compressedChunks.length > 0) {
    try {
      return await decompressBase64WithCache(config.compressedChunks.join(''), compressionMode);
    } catch (err) {
      console.error('解壓縮自訂劇本失敗:', err);
    }
  }

  if (typeof config.compressedBase64 === 'string' && config.compressedBase64.trim()) {
    try {
      return await decompressBase64WithCache(config.compressedBase64, compressionMode);
    } catch (err) {
      console.error('解壓縮自訂劇本失敗:', err);
    }
  }

  if (Array.isArray(config.customChunks) && config.customChunks.length > 0) {
    return config.customChunks.join('');
  }

  return '';
}

function sanitizeConfigForStorage(config) {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const stored = {
    selectedScript: config.selectedScript || '',
    customName: config.customName || '',
    scriptVersion: config.scriptVersion || config._timestamp || null,
    scriptHash: config.scriptHash || null,
    customJsonLength: typeof config.customJsonLength === 'number'
      ? config.customJsonLength
      : (typeof config.customJson === 'string' ? config.customJson.length : null),
    compression: config.compression || null,
    compressedLength: typeof config.compressedLength === 'number'
      ? config.compressedLength
      : (Array.isArray(config.compressedChunks)
        ? config.compressedChunks.join('').length
        : (typeof config.compressedBase64 === 'string'
          ? config.compressedBase64.length
          : (typeof config.chunk0 === 'string'
            ? (config.chunk0.length + (typeof config.extraChunkData === 'string' ? config.extraChunkData.length : 0))
            : null))),
    compressedByteLength: typeof config.compressedByteLength === 'number'
      ? config.compressedByteLength
      : null,
    chunkCount: typeof config.chunkCount === 'number' ? config.chunkCount : null,
    chunk0: typeof config.chunk0 === 'string' ? config.chunk0 : null,
    extraChunkId: typeof config.extraChunkId === 'string' ? config.extraChunkId : null,
    extraChunkData: typeof config.extraChunkData === 'string' ? config.extraChunkData : null,
    compressedBase64: typeof config.compressedBase64 === 'string' ? config.compressedBase64 : null,
    compressedChunks: Array.isArray(config.compressedChunks) ? [...config.compressedChunks] : null,
    customJson: typeof config.customJson === 'string' ? config.customJson : null,
    customChunks: Array.isArray(config.customChunks) ? [...config.customChunks] : null,
    _timestamp: config._timestamp || null
  };

  Object.keys(stored).forEach(key => {
    if (stored[key] === null || typeof stored[key] === 'undefined') {
      delete stored[key];
    }
  });

  if (stored.selectedScript !== CUSTOM_NEW_OPTION) {
    delete stored.customName;
    delete stored.scriptHash;
    delete stored.customJsonLength;
    delete stored.customJson;
    delete stored.customChunks;
    delete stored.compression;
    delete stored.compressedLength;
    delete stored.compressedByteLength;
    delete stored.compressedBase64;
    delete stored.compressedChunks;
    delete stored.chunkCount;
    delete stored.chunk0;
    delete stored.extraChunkId;
    delete stored.extraChunkData;
  }

  return stored;
}

function parseAndNormalizeScriptJson(rawJson) {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    throw new Error('自訂劇本內容不可為空');
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error('自訂劇本必須是有效的 JSON 格式');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('自訂劇本必須是 JSON 陣列');
  }

  const invalidIndex = parsed.findIndex(item => !item || typeof item !== 'object' || !item.id);
  if (invalidIndex !== -1) {
    throw new Error(`第 ${invalidIndex + 1} 筆資料缺少 id 欄位`);
  }

  return {
    parsed,
    normalized: JSON.stringify(parsed, null, 2)
  };
}

function loadSavedCustomScripts() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_SCRIPTS_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === 'string')
    );
  } catch (err) {
    console.warn('載入本機自訂劇本失敗:', err);
    return {};
  }
}

function persistSavedCustomScripts() {
  try {
    window.localStorage?.setItem(LOCAL_SCRIPTS_KEY, JSON.stringify(savedCustomScripts));
  } catch (err) {
    console.warn('儲存自訂劇本到本機時發生錯誤:', err);
    showStatus('⚠️ 無法將自訂劇本儲存在本機，請確認瀏覽器允許儲存功能', 'error');
  }
}

function getLocalOptionValue(name) {
  return `${LOCAL_OPTION_PREFIX}${encodeURIComponent(name)}`;
}

function parseScriptSelection(value) {
  if (!value) {
    return { type: 'none' };
  }

  if (value === CUSTOM_NEW_OPTION) {
    return { type: 'customNew' };
  }

  if (value.startsWith(LOCAL_OPTION_PREFIX)) {
    const name = decodeURIComponent(value.slice(LOCAL_OPTION_PREFIX.length));
    return { type: 'customSaved', name };
  }

  return { type: 'builtin', value };
}

function renderScriptOptions(selectedValue) {
  const builtinOptions = builtinScripts
    .map(fileName => `<option value="${fileName}">${fileName}</option>`)
    .join('');

  const savedNames = Object.keys(savedCustomScripts)
    .sort((a, b) => a.localeCompare(b, 'zh-Hant')); // provide consistent order for Chinese names

  const savedOptions = savedNames
    .map(name => `<option value="${getLocalOptionValue(name)}">📝 ${name}</option>`)
    .join('');

  const savedGroup = savedOptions
    ? `<optgroup label="已儲存的自訂劇本">${savedOptions}</optgroup>`
    : '';

  scriptListEl.innerHTML = [
    '<option value="">-- 請選擇劇本 --</option>',
    builtinOptions,
    `<option value="${CUSTOM_NEW_OPTION}">✏️ 新增自訂劇本</option>`,
    savedGroup
  ].join('');

  if (selectedValue && Array.from(scriptListEl.options).some(opt => opt.value === selectedValue)) {
    scriptListEl.value = selectedValue;
  } else {
    scriptListEl.value = '';
  }
}

function clearLoadedCustomMetadata() {
  delete customNameEl.dataset.loadedName;
  delete customJsonEl.dataset.loadedName;
  delete customJsonEl.dataset.loadedValue;
}

function updateCustomButtonsState(selection) {
  const isCustom = selection.type === 'customNew' || selection.type === 'customSaved';
  customJsonBlock.style.display = isCustom ? 'block' : 'none';
  saveCustomButton.disabled = !isCustom;
  deleteCustomButton.disabled = selection.type !== 'customSaved';
}

function handleScriptSelectionChange() {
  const selection = parseScriptSelection(scriptListEl.value);
  updateCustomButtonsState(selection);

  if (selection.type === 'customSaved') {
    const savedJson = savedCustomScripts[selection.name];
    if (typeof savedJson !== 'string') {
      showStatus(`❌ 找不到名為「${selection.name}」的自訂劇本，請重新選擇`, 'error');
      scriptListEl.value = CUSTOM_NEW_OPTION;
      handleScriptSelectionChange();
      return;
    }

    customNameEl.value = selection.name;
    customJsonEl.value = savedJson;
    customNameEl.dataset.loadedName = selection.name;
    customJsonEl.dataset.loadedName = selection.name;
    customJsonEl.dataset.loadedValue = savedJson;
    persistLastCustomJson(savedJson);
    return;
  }

  if (selection.type === 'customNew') {
    const cachedJson = loadLastCustomJson();
    if (!customJsonEl.value && cachedJson) {
      customJsonEl.value = cachedJson;
      persistLastCustomJson(cachedJson);
    }
    clearLoadedCustomMetadata();
    return;
  }

  // built-in or no selection
  customNameEl.value = '';
  customJsonEl.value = '';
  clearLoadedCustomMetadata();
}

async function updateFormFromConfig(config) {
  if (config && typeof config === 'object' && Object.keys(config).length > 0) {
    const sanitized = sanitizeConfigForStorage(config);
    if (sanitized) {
      persistLastConfig(sanitized);
    }

    const { selectedScript = '', customName = '' } = config;

    if (selectedScript && selectedScript !== CUSTOM_NEW_OPTION) {
      if (Array.from(scriptListEl.options).some(opt => opt.value === selectedScript)) {
        scriptListEl.value = selectedScript;
      } else {
        showStatus(`⚠️ 找不到劇本「${selectedScript}」，請重新選擇`, 'error');
        scriptListEl.value = '';
      }
      handleScriptSelectionChange();
      return;
    }

    scriptListEl.value = CUSTOM_NEW_OPTION;
    customNameEl.value = customName || '';

    let effectiveJson = '';
    try {
      effectiveJson = await reconstructCustomJsonFromConfig(config);
    } catch (err) {
      console.warn('解壓縮自訂劇本失敗，改用本機快取:', err);
      effectiveJson = loadLastCustomJson();
    }

    if (!effectiveJson) {
      effectiveJson = loadLastCustomJson();
    }

    if (effectiveJson) {
      customJsonEl.value = effectiveJson;
      persistLastCustomJson(effectiveJson);
    } else {
      customJsonEl.value = '';
    }

    if (customName && savedCustomScripts[customName] === customJsonEl.value) {
      scriptListEl.value = getLocalOptionValue(customName);
    }

    handleScriptSelectionChange();
    return;
  }

  const fallbackConfig = loadLastConfig();
  if (fallbackConfig) {
    await updateFormFromConfig(fallbackConfig);
    return;
  }

  const cachedCustomJson = loadLastCustomJson();
  if (cachedCustomJson) {
    scriptListEl.value = CUSTOM_NEW_OPTION;
    customJsonEl.value = cachedCustomJson;
    handleScriptSelectionChange();
  }
}

function readConfigFromTwitch() {
  const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
  if (!configStr) {
    return null;
  }

  try {
    const parsed = JSON.parse(configStr);
    if (parsed && typeof parsed === 'object' && parsed.extraChunkId) {
      const globalStr = window.Twitch?.ext?.configuration?.global?.content;
      if (globalStr) {
        try {
          const globalPayload = JSON.parse(globalStr);
          if (globalPayload
            && typeof globalPayload === 'object'
            && globalPayload.id === parsed.extraChunkId
            && (globalPayload.channelId === undefined
              || !twitchAuth.channelId
              || globalPayload.channelId === twitchAuth.channelId)
            && typeof globalPayload.chunk === 'string') {
            parsed.extraChunkData = globalPayload.chunk;
          }
        } catch (err) {
          console.warn('解析 Twitch 全域設定失敗:', err);
        }
      }
    }

    return parsed;
  } catch (err) {
    console.error('解析 Twitch 設定失敗:', err);
    return null;
  }
}

function setupTwitchListeners() {
  const twitchExt = window.Twitch?.ext;
  if (!twitchExt) {
    return false;
  }

  const applyCurrentConfig = async () => {
    const config = readConfigFromTwitch();
    if (config) {
      await updateFormFromConfig(config);
    } else {
      await updateFormFromConfig(loadLastConfig());
    }
  };

  twitchExt.onAuthorized(auth => {
    twitchAuthorized = true;
    twitchAuth = {
      channelId: auth?.channelId || null,
      clientId: auth?.clientId || null,
      token: auth?.token || null,
      userId: auth?.userId || null
    };
    applyCurrentConfig().catch(err => {
      console.error('套用 Twitch 授權設定時發生錯誤:', err);
    });
  });

  twitchExt.configuration?.onChanged?.(() => {
    applyCurrentConfig().catch(err => {
      console.error('套用 Twitch 設定變更時發生錯誤:', err);
    });
  });

  applyCurrentConfig().catch(err => {
    console.error('初始化 Twitch 設定時發生錯誤:', err);
  });
  return true;
}

async function initializeConfigForm() {
  savedCustomScripts = loadSavedCustomScripts();

  try {
    const loadedScripts = await fetch('Allscript/scripts.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      });

    builtinScripts = Array.isArray(loadedScripts) ? loadedScripts : [];
  } catch (err) {
    console.error('載入劇本清單時發生錯誤:', err);
    showStatus('❌ 無法載入劇本清單，請稍後再試', 'error');
    builtinScripts = [];
  }

  renderScriptOptions(scriptListEl.value);
  handleScriptSelectionChange();

  if (!setupTwitchListeners()) {
    await updateFormFromConfig(loadLastConfig());
  }
}

function handleCustomNameInput(event) {
  const selection = parseScriptSelection(scriptListEl.value);
  if (selection.type === 'customSaved') {
    const newValue = event.target.value;
    scriptListEl.value = CUSTOM_NEW_OPTION;
    handleScriptSelectionChange();
    customNameEl.value = newValue;
  }
}

function handleCustomJsonInput(event) {
  const selection = parseScriptSelection(scriptListEl.value);
  if (selection.type === 'customSaved') {
    const newValue = event.target.value;
    scriptListEl.value = CUSTOM_NEW_OPTION;
    handleScriptSelectionChange();
    customJsonEl.value = newValue;
  }

  if (parseScriptSelection(scriptListEl.value).type === 'customNew') {
    persistLastCustomJson(event.target.value);
  }
}

function saveCustomScript() {
  const selection = parseScriptSelection(scriptListEl.value);
  if (selection.type !== 'customNew' && selection.type !== 'customSaved') {
    showStatus('❌ 請先選擇「新增自訂劇本」或載入已儲存的自訂劇本', 'error');
    return;
  }

  const name = customNameEl.value.trim();
  const customJson = customJsonEl.value.trim();

  if (!name) {
    showStatus('❌ 請為自訂劇本輸入名稱', 'error');
    return;
  }

  let normalizedJson;
  try {
    ({ normalized: normalizedJson } = parseAndNormalizeScriptJson(customJson));
  } catch (err) {
    showStatus(`❌ ${err.message}`, 'error');
    return;
  }

  savedCustomScripts[name] = normalizedJson;
  persistSavedCustomScripts();
  persistLastCustomJson(normalizedJson);

  const optionValue = getLocalOptionValue(name);
  renderScriptOptions(optionValue);
  scriptListEl.value = optionValue;
  handleScriptSelectionChange();

  customJsonEl.dataset.loadedValue = normalizedJson;
  customJsonEl.dataset.loadedName = name;
  customNameEl.dataset.loadedName = name;
  customJsonEl.value = normalizedJson;

  showStatus(`✅ 已儲存自訂劇本「${name}」`, 'success');
}

function deleteCustomScript() {
  const selection = parseScriptSelection(scriptListEl.value);
  if (selection.type !== 'customSaved') {
    return;
  }

  const { name } = selection;
  const storedJson = savedCustomScripts[name];
  if (typeof storedJson !== 'string') {
    showStatus(`❌ 找不到名為「${name}」的自訂劇本`, 'error');
    return;
  }

  const nextScripts = { ...savedCustomScripts };
  delete nextScripts[name];
  savedCustomScripts = nextScripts;
  persistSavedCustomScripts();

  if (customJsonEl.dataset.loadedName === name) {
    clearLoadedCustomMetadata();
  }

  if (customNameEl.value.trim() === name) {
    customNameEl.value = '';
  }

  if (customJsonEl.dataset.loadedValue === storedJson) {
    customJsonEl.value = '';
    persistLastCustomJson('');
  }

  renderScriptOptions(CUSTOM_NEW_OPTION);
  scriptListEl.value = CUSTOM_NEW_OPTION;
  customNameEl.value = '';
  customJsonEl.value = '';
  handleScriptSelectionChange();

  showStatus(`🗑️ 已刪除自訂劇本「${name}」`, 'info');
}

scriptListEl.addEventListener('change', handleScriptSelectionChange);
customNameEl.addEventListener('input', handleCustomNameInput);
customJsonEl.addEventListener('input', handleCustomJsonInput);
saveCustomButton.addEventListener('click', saveCustomScript);
deleteCustomButton.addEventListener('click', deleteCustomScript);

saveButton.addEventListener('click', async () => {
  const selection = parseScriptSelection(scriptListEl.value);

  if (selection.type === 'none') {
    showStatus('❌ 請先選擇或輸入一份劇本', 'error');
    return;
  }

  const timestamp = Date.now();
  let payload;
  let storageConfig = null;
  let normalizedJson = '';

  if (selection.type === 'builtin') {
    storageConfig = {
      selectedScript: selection.value,
      _timestamp: timestamp,
      scriptVersion: timestamp
    };
    payload = { ...storageConfig };
    persistLastCustomJson('');
  } else {
    const customName = customNameEl.value.trim();
    const customJson = customJsonEl.value.trim();

    if (!customName) {
      showStatus('❌ 請輸入自訂劇本名稱', 'error');
      return;
    }

    try {
      ({ normalized: normalizedJson } = parseAndNormalizeScriptJson(customJson));
    } catch (err) {
      showStatus(`❌ ${err.message}`, 'error');
      return;
    }

    persistLastCustomJson(normalizedJson);
    customJsonEl.value = normalizedJson;
    customJsonEl.dataset.loadedValue = normalizedJson;
    customJsonEl.dataset.loadedName = customName;
    customNameEl.dataset.loadedName = customName;

    const scriptVersion = timestamp;
    const scriptHash = computeScriptHash(normalizedJson);

    saveButton.disabled = true;

    let compressed = null;
    let segments = [];

    try {
      showStatus('🗜️ 正在壓縮自訂劇本...', 'info');
      compressed = await compressCustomJson(normalizedJson);
      if (compressed && typeof compressed.base64 === 'string' && compressed.base64) {
        segments = chunkCompressedText(compressed.base64);
      }
    } catch (err) {
      console.warn('壓縮自訂劇本時發生錯誤，將改用未壓縮模式:', err);
    }

    storageConfig = {
      selectedScript: CUSTOM_NEW_OPTION,
      customName,
      _timestamp: timestamp,
      scriptVersion,
      scriptHash,
      customJsonLength: normalizedJson.length
    };

    const hasCompressedData = compressed && typeof compressed.base64 === 'string' && compressed.base64;

    if (hasCompressedData && segments.length > 0) {
      if (segments.length > MAX_SEGMENT_COUNT) {
        showStatus('❌ 壓縮後的自訂劇本仍超過 Twitch 允許的兩個儲存區塊（約 9KB），請刪減內容', 'error');
        saveButton.disabled = false;
        return;
      }

      const mode = compressed.mode || COMPRESSION_MODE;
      storageConfig.compression = mode;
      storageConfig.compressedByteLength = typeof compressed.compressedByteLength === 'number'
        ? compressed.compressedByteLength
        : (compressed.compressedLength || compressed.base64.length);
      storageConfig.compressedLength = compressed.base64.length;

      if (segments.length === 1) {
        storageConfig.compressedBase64 = compressed.base64;
      } else {
        if (!twitchAuth.channelId) {
          showStatus('❌ 需要在 Twitch 擴充環境中授權後才能儲存大型自訂劇本', 'error');
          saveButton.disabled = false;
          return;
        }

        const extraChunkId = `${twitchAuth.channelId}:${scriptVersion}`;
        storageConfig.chunkCount = segments.length;
        storageConfig.chunk0 = segments[0];
        storageConfig.extraChunkId = extraChunkId;
        storageConfig.extraChunkData = segments[1];
      }
    } else {
      const customChunks = chunkCompressedText(normalizedJson);
      if (customChunks.length > MAX_SEGMENT_COUNT) {
        showStatus('❌ 自訂劇本過大且無法壓縮，請刪減內容後重試', 'error');
        saveButton.disabled = false;
        return;
      }

      if (customChunks.length <= 1) {
        storageConfig.customJson = normalizedJson;
      } else {
        storageConfig.customChunks = customChunks;
      }

      showStatus('⚠️ 無法使用壓縮，已改用分段儲存', 'info');
    }

    payload = { ...storageConfig };
    if (payload.extraChunkData) {
      delete payload.extraChunkData;
    }
    if (!payload.customJson) {
      delete payload.customJson;
    }
    if (!payload.customChunks) {
      delete payload.customChunks;
    }
    if (!payload.compressedBase64) {
      delete payload.compressedBase64;
    }
  }

  saveButton.disabled = true;
  showStatus('💾 儲存中...', 'info');

  try {
    const sanitizedStorage = sanitizeConfigForStorage(storageConfig || payload);
    if (sanitizedStorage) {
      persistLastConfig(sanitizedStorage);
    }

    if (!window.Twitch?.ext?.configuration) {
      showStatus('⚠️ 無法存取 Twitch Extension API，已將設定保存在本機', 'error');
      return;
    }

    let globalPayloadString = null;
    const requiresGlobal = Boolean(storageConfig?.extraChunkData && storageConfig?.extraChunkId);

    if (requiresGlobal) {
      const globalPayload = {
        id: storageConfig.extraChunkId,
        chunk: storageConfig.extraChunkData,
        compression: storageConfig.compression || COMPRESSION_MODE,
        version: storageConfig.scriptVersion,
        channelId: twitchAuth.channelId || null,
        updatedAt: timestamp
      };
      globalPayloadString = JSON.stringify(globalPayload);

      if (globalPayloadString.length > TWITCH_SEGMENT_LIMIT) {
        showStatus('❌ 分段資料仍超過 5KB 限制，請刪減劇本內容', 'error');
        return;
      }
    } else if (typeof window.Twitch?.ext?.configuration?.global?.content === 'string') {
      const clearedPayload = {
        id: '',
        chunk: '',
        channelId: twitchAuth.channelId || null,
        clearedAt: timestamp
      };
      globalPayloadString = JSON.stringify(clearedPayload);
    }

    const payloadString = JSON.stringify(payload || storageConfig);
    if (payloadString.length > TWITCH_SEGMENT_LIMIT) {
      showStatus('❌ 儲存內容超過 5KB 限制，請刪減劇本或縮短描述', 'error');
      return;
    }

    if (globalPayloadString) {
      window.Twitch.ext.configuration.set('global', '1', globalPayloadString);
    }

    window.Twitch.ext.configuration.set('broadcaster', '1', payloadString);
    if (window.Twitch.ext.send) {
      try {
        window.Twitch.ext.send('broadcast', 'application/json', payloadString);
      } catch (sendErr) {
        console.warn('透過 Twitch 廣播更新設定時失敗:', sendErr);
      }
    }

    showStatus('✅ 設定已儲存並同步到 Twitch 擴充功能！');
  } catch (err) {
    console.error('儲存設定失敗:', err);
    showStatus('❌ 儲存設定失敗，請稍後再試', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

initializeConfigForm();

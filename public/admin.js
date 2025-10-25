const storageNotice = document.getElementById('storageNotice');
const scriptListEl = document.getElementById('scriptList');
const customJsonBlock = document.getElementById('customJsonBlock');
const customNameEl = document.getElementById('customName');
const customJsonEl = document.getElementById('customJson');
const saveCustomButton = document.getElementById('saveCustomButton');
const deleteCustomButton = document.getElementById('deleteCustomButton');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
const CUSTOM_JSON_COOKIE = 'botc_custom_json';
const OVERLAY_CONFIG_COOKIE = 'botc_overlay_config_v1';
const OVERLAY_SCRIPT_COOKIE = 'botc_overlay_script_v1';
const COOKIE_TTL_DAYS = 30;
const LOCAL_SCRIPTS_KEY = 'botc_saved_custom_scripts_v1';
const LOCAL_OPTION_PREFIX = 'local:';
const CUSTOM_NEW_OPTION = '__custom__';

let builtinScripts = [];
let savedCustomScripts = {};

const STATUS_COLORS = {
  success: 'lightgreen',
  error: '#ff8080',
  info: '#9ec5fe'
};

if (storageNotice) {
  storageNotice.innerHTML = [
    '✅ 儲存設定時會同時更新 Twitch 擴充設定與瀏覽器 Cookie。',
    '<br />',
    '📌 設定資訊儲存在 <code>botc_overlay_config_v1</code>，劇本內容儲存在 <code>botc_overlay_script_v1</code>，覆蓋頁面會讀取這兩個 Cookie 以顯示最新劇本。'
  ].join('');
}

function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.style.color = STATUS_COLORS[type] || STATUS_COLORS.success;
}

function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `; expires=${date.toUTCString()}`;
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/`;
}

function getCookie(name) {
  const match = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));

  if (!match) {
    return '';
  }

  return decodeURIComponent(match.substring(name.length + 1));
}

function persistCustomJson(value) {
  setCookie(CUSTOM_JSON_COOKIE, value, COOKIE_TTL_DAYS);
}

function loadCustomJsonFromCookie() {
  return getCookie(CUSTOM_JSON_COOKIE);
}

function sanitizeConfigForCookie(config) {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const sanitized = {};

  if (config.selectedScript) {
    sanitized.selectedScript = config.selectedScript;
  }

  if (config.selectedScript === CUSTOM_NEW_OPTION && config.customName) {
    sanitized.customName = config.customName;
  }

  if (config._timestamp) {
    sanitized._timestamp = config._timestamp;
  }

  if (config.scriptVersion) {
    sanitized.scriptVersion = config.scriptVersion;
  }

  return sanitized;
}

function persistOverlayConfig(content) {
  const sanitized = sanitizeConfigForCookie(content);

  try {
    if (!sanitized || Object.keys(sanitized).length === 0) {
      setCookie(OVERLAY_CONFIG_COOKIE, '', -1);
      return;
    }

    setCookie(OVERLAY_CONFIG_COOKIE, JSON.stringify(sanitized), COOKIE_TTL_DAYS);
  } catch (err) {
    console.warn('儲存 Overlay 設定到 Cookie 時失敗:', err);
  }
}

function loadOverlayConfigFromCookie() {
  const raw = getCookie(OVERLAY_CONFIG_COOKIE);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('解析 Overlay 設定 Cookie 失敗:', err);
    return null;
  }
}

function persistOverlayScript(content) {
  try {
    const normalized = typeof content === 'string' ? content : JSON.stringify(content);
    const encoded = encodeURIComponent(normalized);

    if (encoded.length > 3800) {
      throw new Error('自訂劇本內容超過瀏覽器單一 Cookie 容量限制，請刪減內容或改用較小的劇本');
    }

    setCookie(OVERLAY_SCRIPT_COOKIE, normalized, COOKIE_TTL_DAYS);
    return true;
  } catch (err) {
    console.warn('儲存劇本到 Cookie 時失敗:', err);
    showStatus(`❌ ${err.message || '無法儲存劇本到 Cookie'}`, 'error');
    return false;
  }
}

function clearOverlayScriptCookie() {
  setCookie(OVERLAY_SCRIPT_COOKIE, '', -1);
}

function loadOverlayScriptFromCookie() {
  return getCookie(OVERLAY_SCRIPT_COOKIE);
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
    persistCustomJson(savedJson);
    return;
  }

  if (selection.type === 'customNew') {
    const cachedJson = loadCustomJsonFromCookie();
    if (!customJsonEl.value && cachedJson) {
      customJsonEl.value = cachedJson;
    }
    clearLoadedCustomMetadata();
    return;
  }

  // built-in or no selection
  customNameEl.value = '';
  customJsonEl.value = '';
  clearLoadedCustomMetadata();
}

function updateFormFromConfig(config) {
  if (config && typeof config === 'object') {
    if (Object.keys(config).length > 0) {
      persistOverlayConfig(config);
    }

    const { selectedScript = '', customJson = '', customName = '' } = config;

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

    if (customName) {
      customNameEl.value = customName;
    }

    let effectiveJson = '';

    if (customJson) {
      effectiveJson = customJson;
      persistOverlayScript(customJson);
    } else {
      effectiveJson = loadOverlayScriptFromCookie() || '';
    }

    if (effectiveJson) {
      customJsonEl.value = effectiveJson;
      persistCustomJson(effectiveJson);
    }

    if (customName && savedCustomScripts[customName] === effectiveJson) {
      scriptListEl.value = getLocalOptionValue(customName);
    }

    handleScriptSelectionChange();
    return;
  }

  const cachedCustomJson = loadOverlayScriptFromCookie() || loadCustomJsonFromCookie();
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
    return JSON.parse(configStr);
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

  const applyCurrentConfig = () => {
    const config = readConfigFromTwitch();
    if (config) {
      updateFormFromConfig(config);
    } else {
      updateFormFromConfig(loadOverlayConfigFromCookie());
    }
  };

  twitchExt.onAuthorized(() => {
    applyCurrentConfig();
  });

  twitchExt.configuration?.onChanged?.(() => {
    applyCurrentConfig();
  });

  applyCurrentConfig();
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
    updateFormFromConfig(loadOverlayConfigFromCookie());
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
    persistCustomJson(event.target.value);
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
  persistCustomJson(normalizedJson);

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
  if (!(name in savedCustomScripts)) {
    showStatus(`❌ 找不到名為「${name}」的自訂劇本`, 'error');
    return;
  }

  if (!window.confirm(`確定要刪除自訂劇本「${name}」嗎？`)) {
    return;
  }

  delete savedCustomScripts[name];
  persistSavedCustomScripts();

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
  let cookieConfig;
  let twitchConfig;

  if (selection.type === 'builtin') {
    cookieConfig = { selectedScript: selection.value, _timestamp: timestamp };
    twitchConfig = { ...cookieConfig };
    clearOverlayScriptCookie();
  } else {
    const customName = customNameEl.value.trim();
    const customJson = customJsonEl.value.trim();

    if (!customName) {
      showStatus('❌ 請輸入自訂劇本名稱', 'error');
      return;
    }

    let normalizedJson;
    try {
      ({ normalized: normalizedJson } = parseAndNormalizeScriptJson(customJson));
    } catch (err) {
      showStatus(`❌ ${err.message}`, 'error');
      return;
    }

    persistCustomJson(normalizedJson);
    customJsonEl.value = normalizedJson;
    customJsonEl.dataset.loadedValue = normalizedJson;
    customJsonEl.dataset.loadedName = customName;
    customNameEl.dataset.loadedName = customName;

    if (!persistOverlayScript(normalizedJson)) {
      saveButton.disabled = false;
      return;
    }

    const scriptVersion = timestamp;
    cookieConfig = {
      selectedScript: CUSTOM_NEW_OPTION,
      customName,
      _timestamp: timestamp,
      scriptVersion
    };
    twitchConfig = {
      ...cookieConfig,
      customJson: normalizedJson
    };
  }

  saveButton.disabled = true;
  showStatus('💾 儲存中...', 'info');

  try {
    persistOverlayConfig(cookieConfig);
    if (window.Twitch?.ext?.configuration) {
      const payload = JSON.stringify(twitchConfig || cookieConfig);
      window.Twitch.ext.configuration.set('broadcaster', '1', payload);
      if (window.Twitch.ext.send) {
        try {
          window.Twitch.ext.send('broadcast', 'application/json', payload);
        } catch (sendErr) {
          console.warn('透過 Twitch 廣播更新設定時失敗:', sendErr);
        }
      }
    }
    showStatus('✅ 設定已儲存並寫入 Cookie！請切換 Overlay 測試結果');
  } catch (err) {
    console.error('儲存設定失敗:', err);
    showStatus('❌ 儲存設定失敗，請稍後再試', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

initializeConfigForm();

const apiTargetNotice = document.getElementById('apiTargetNotice');
const scriptListEl = document.getElementById('scriptList');
const customJsonBlock = document.getElementById('customJsonBlock');
const customNameEl = document.getElementById('customName');
const customJsonEl = document.getElementById('customJson');
const saveCustomButton = document.getElementById('saveCustomButton');
const deleteCustomButton = document.getElementById('deleteCustomButton');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');

const urlParams = new URLSearchParams(window.location.search);
const rawApiBase = urlParams.get('apiBase') || urlParams.get('server') || '';
const rawAssetsBase = urlParams.get('assetsBase') || '';

let apiBaseUrl;
try {
  apiBaseUrl = rawApiBase
    ? new URL(rawApiBase, window.location.href)
    : new URL(window.location.origin);
} catch (err) {
  console.warn('指定的 apiBase 無法解析，將改用預設來源:', err);
  apiBaseUrl = new URL(window.location.origin);
}

let assetBaseUrl = null;
if (rawAssetsBase) {
  try {
    assetBaseUrl = new URL(rawAssetsBase, window.location.href);
  } catch (err) {
    console.warn('指定的 assetsBase 無法解析，將改用預設來源:', err);
    assetBaseUrl = null;
  }
} else if (rawApiBase) {
  assetBaseUrl = apiBaseUrl;
}

if (apiTargetNotice) {
  const normalizeBase = (urlObj) => {
    if (!urlObj) {
      return '';
    }

    const path = urlObj.pathname.endsWith('/') && urlObj.pathname !== '/'
      ? urlObj.pathname.slice(0, -1)
      : urlObj.pathname;
    return `${urlObj.origin}${path}`;
  };

  const apiBaseText = rawApiBase
    ? normalizeBase(apiBaseUrl)
    : '目前頁面所在的伺服器';
  const assetBaseText = assetBaseUrl
    ? normalizeBase(assetBaseUrl)
    : '目前頁面所在的伺服器';

  const baseLines = [
    `API 儲存目標：<strong>${apiBaseText}</strong>`,
    rawAssetsBase || rawApiBase
      ? `<br />劇本檔案讀取來源：<strong>${assetBaseText}</strong>`
      : ''
  ];

  if (!rawApiBase) {
    baseLines.push('<br />如需指定其他伺服器，請在網址後加上 <code>?apiBase=https://example.com</code>。');
  }

  if (!rawAssetsBase && rawApiBase) {
    baseLines.push('<br />若劇本檔案存放在不同位置，可再加上 <code>&amp;assetsBase=https://example.com/path/</code>。');
  }

  apiTargetNotice.innerHTML = baseLines.join('');
}

const CUSTOM_JSON_COOKIE = 'botc_custom_json';
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

function buildApiUrl(path) {
  try {
    return new URL(path, apiBaseUrl).toString();
  } catch (err) {
    console.warn('組合 API URL 時發生錯誤，將改用原始路徑:', err);
    return path;
  }
}

function buildAssetUrl(path) {
  const base = assetBaseUrl;
  if (!base) {
    return path;
  }

  try {
    return new URL(path, base).toString();
  } catch (err) {
    console.warn('組合資源 URL 時發生錯誤，將改用原始路徑:', err);
    return path;
  }
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
  if (config) {
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
    if (customJson) {
      customJsonEl.value = customJson;
      persistCustomJson(customJson);
    }

    if (customName && savedCustomScripts[customName] === customJson) {
      scriptListEl.value = getLocalOptionValue(customName);
    }

    handleScriptSelectionChange();
    return;
  }

  const cachedCustomJson = loadCustomJsonFromCookie();
  if (cachedCustomJson) {
    scriptListEl.value = CUSTOM_NEW_OPTION;
    customJsonEl.value = cachedCustomJson;
    handleScriptSelectionChange();
  }
}

async function saveConfigToServer(content) {
  const response = await fetch(buildApiUrl('/api/overlay-config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  });

  if (!response.ok) {
    throw new Error(`儲存伺服器設定失敗 (HTTP ${response.status})`);
  }
}

async function loadConfigFromServer() {
  try {
    const response = await fetch(buildApiUrl('/api/overlay-config'));
    if (!response.ok) {
      throw new Error(`讀取伺服器設定失敗 (HTTP ${response.status})`);
    }

    const config = await response.json();
    if (!config || Object.keys(config).length === 0) {
      return null;
    }
    return config;
  } catch (err) {
    console.warn('讀取伺服器設定時發生問題:', err);
    return null;
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
    updateFormFromConfig(config);
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
    const loadedScripts = await fetch(buildAssetUrl('/Allscript/scripts.json'))
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
    const serverConfig = await loadConfigFromServer();
    updateFormFromConfig(serverConfig);
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

  if (!customJson) {
    showStatus('❌ 自訂劇本內容不可為空', 'error');
    return;
  }

  savedCustomScripts[name] = customJson;
  persistSavedCustomScripts();
  persistCustomJson(customJson);

  const optionValue = getLocalOptionValue(name);
  renderScriptOptions(optionValue);
  scriptListEl.value = optionValue;
  handleScriptSelectionChange();

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
  let content;

  if (selection.type === 'builtin') {
    content = { selectedScript: selection.value, _timestamp: timestamp };
  } else {
    const customName = customNameEl.value.trim();
    const customJson = customJsonEl.value.trim();

    if (!customName) {
      showStatus('❌ 請輸入自訂劇本名稱', 'error');
      return;
    }

    if (!customJson) {
      showStatus('❌ 自訂劇本內容不可為空', 'error');
      return;
    }

    persistCustomJson(customJson);
    content = {
      selectedScript: CUSTOM_NEW_OPTION,
      customJson,
      customName,
      _timestamp: timestamp
    };
  }

  saveButton.disabled = true;
  showStatus('💾 儲存中...', 'info');

  try {
    if (window.Twitch?.ext?.configuration) {
      window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify(content));
      try {
        await saveConfigToServer(content);
      } catch (syncErr) {
        console.warn('已更新 Twitch 設定，但同步至伺服器時發生問題:', syncErr);
      }
    } else {
      await saveConfigToServer(content);
    }
    showStatus('✅ 設定已儲存！請切換 Overlay 測試結果');
  } catch (err) {
    console.error('儲存設定失敗:', err);
    showStatus('❌ 儲存設定失敗，請稍後再試', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

initializeConfigForm();

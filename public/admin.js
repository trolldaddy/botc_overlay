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
    '📌 Cookie 名稱為 <code>botc_overlay_config_v1</code>，覆蓋頁面會讀取此資料以顯示最新劇本。'
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

function persistOverlayConfig(content) {
  try {
    setCookie(OVERLAY_CONFIG_COOKIE, JSON.stringify(content), COOKIE_TTL_DAYS);
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
    const loadedScripts = await fetch('/Allscript/scripts.json')
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
    persistOverlayConfig(content);
    if (window.Twitch?.ext?.configuration) {
      window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify(content));
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

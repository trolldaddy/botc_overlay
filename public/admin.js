const scriptListEl = document.getElementById('scriptList');
const customJsonBlock = document.getElementById('customJsonBlock');
const customJsonEl = document.getElementById('customJson');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');

const STATUS_COLORS = {
  success: 'lightgreen',
  error: '#ff8080',
  info: '#9ec5fe'
};

function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.style.color = STATUS_COLORS[type] || STATUS_COLORS.success;
}

function toggleCustomJsonVisibility() {
  customJsonBlock.style.display = scriptListEl.value === '__custom__' ? 'block' : 'none';
}

function updateFormFromConfig(config) {
  if (!config) {
    return;
  }

  const { selectedScript = '', customJson = '' } = config;
  scriptListEl.value = selectedScript;
  customJsonEl.value = customJson;
  toggleCustomJsonVisibility();
}

async function saveConfigToServer(content) {
  const response = await fetch('/api/overlay-config', {
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
    const response = await fetch('/api/overlay-config');
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
  try {
    const loadedScripts = await fetch('/Allscript/scripts.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      });

    scriptListEl.innerHTML = `
      <option value="">-- 請選擇劇本 --</option>
      ${loadedScripts.map(f => `<option value="${f}">${f}</option>`).join('')}
      <option value="__custom__">自訂劇本</option>
    `;
  } catch (err) {
    console.error('載入劇本清單時發生錯誤:', err);
    showStatus('❌ 無法載入劇本清單，請稍後再試', 'error');
    return;
  }

  toggleCustomJsonVisibility();

  if (!setupTwitchListeners()) {
    const serverConfig = await loadConfigFromServer();
    updateFormFromConfig(serverConfig);
  }
}

scriptListEl.addEventListener('change', () => {
  toggleCustomJsonVisibility();
});

saveButton.addEventListener('click', async () => {
  const selectedScript = scriptListEl.value;
  const customJson = customJsonEl.value.trim();

  if (!selectedScript) {
    showStatus('❌ 請先選擇或輸入一份劇本', 'error');
    return;
  }

  const content = selectedScript === '__custom__'
    ? { selectedScript, customJson, _timestamp: Date.now() }
    : { selectedScript, _timestamp: Date.now() };

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

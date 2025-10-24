const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');
const toggleButton = document.getElementById('toggleButton');
const globalTooltip = document.getElementById('globalTooltip');

let isVisible = false;
let lastServerConfigSignature = null;
let serverPollTimer = null;
let hasActiveTwitchConfig = false;

const urlParams = new URLSearchParams(window.location.search);
const rawApiBase = urlParams.get('apiBase') || urlParams.get('server') || '';
const rawAssetsBase = urlParams.get('assetsBase') || '';

let apiBaseUrl = null;
if (rawApiBase) {
  try {
    apiBaseUrl = new URL(rawApiBase, window.location.href);
  } catch (err) {
    console.warn('指定的 apiBase 無法解析，將改用預設來源:', err);
    apiBaseUrl = null;
  }
}

let assetBaseUrl = null;
if (rawAssetsBase) {
  try {
    assetBaseUrl = new URL(rawAssetsBase, window.location.href);
  } catch (err) {
    console.warn('指定的 assetsBase 無法解析，將改用預設來源:', err);
    assetBaseUrl = null;
  }
} else if (apiBaseUrl) {
  assetBaseUrl = apiBaseUrl;
}

function resolveApiUrl(path) {
  if (!apiBaseUrl) {
    return path;
  }

  try {
    return new URL(path, apiBaseUrl).toString();
  } catch (err) {
    console.warn('組合 API URL 時發生錯誤，將改用原始路徑:', err);
    return path;
  }
}

function resolveAssetUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!assetBaseUrl) {
    return normalizedPath;
  }

  try {
    return new URL(normalizedPath, assetBaseUrl).toString();
  } catch (err) {
    console.warn('組合資源 URL 時發生錯誤，將改用原始路徑:', err);
    return normalizedPath;
  }
}

const DEFAULT_SCRIPT = 'trouble_brewing.json';
const SERVER_CONFIG_ENDPOINT = resolveApiUrl('/api/overlay-config');

function togglePanels() {
  isVisible = !isVisible;
  leftPanel.classList.toggle('show', isVisible);
  rightPanel.classList.toggle('show', isVisible);
}

toggleButton.addEventListener('click', togglePanels);

async function loadRolesFromList(roleList) {
  if (!Array.isArray(roleList)) {
    console.warn('角色資料格式不正確，將改用預設劇本');
    return loadDefaultScript();
  }

  const referenceListUrl = resolveAssetUrl('/EVERY_SINGLE_ROLE_with_chinese_abilities.json');
  const referenceList = await fetch(referenceListUrl).then(r => r.json());
  const referenceMap = Object.fromEntries(referenceList.map(r => [r.id, r]));

  const grids = {
    townsfolk: document.getElementById('townsfolkGrid'),
    outsider: document.getElementById('outsiderGrid'),
    minion: document.getElementById('minionGrid'),
    demon: document.getElementById('demonGrid')
  };

  Object.values(grids).forEach(grid => {
    grid.innerHTML = '';
  });

  roleList.forEach(role => {
    const ref = referenceMap[role.id];
    if (!ref) {
      return;
    }

    const displayName = ref.name_zh || ref.name || role.id;
    const imgUrl = ref.image || '';
    const ability = ref.ability || '';
    const tooltipDirection = ref.team === 'townsfolk' ? 'right' : 'left';

    const container = document.createElement('div');
    container.className = 'role';

    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = displayName;

    const label = document.createElement('div');
    label.textContent = displayName;

    container.appendChild(img);
    container.appendChild(label);

    container.addEventListener('mouseenter', () => {
      globalTooltip.textContent = ability;
      globalTooltip.style.display = 'block';
      const rect = container.getBoundingClientRect();
      const offsetX = tooltipDirection === 'left'
        ? Math.max(10, rect.left - globalTooltip.offsetWidth - 10)
        : Math.min(window.innerWidth - globalTooltip.offsetWidth - 10, rect.right + 10);
      const offsetY = rect.top + window.scrollY;
      globalTooltip.style.left = `${offsetX}px`;
      globalTooltip.style.top = `${offsetY}px`;
    });

    container.addEventListener('mouseleave', () => {
      globalTooltip.style.display = 'none';
    });

    if (grids[ref.team]) {
      grids[ref.team].appendChild(container);
    }
  });
}

function loadDefaultScript() {
  const defaultScriptUrl = resolveAssetUrl(`/Allscript/${DEFAULT_SCRIPT}`);
  return fetch(defaultScriptUrl)
    .then(r => r.json())
    .then(loadRolesFromList)
    .catch(err => {
      console.error('載入預設劇本失敗:', err);
    });
}

function loadScriptByName(scriptFileName) {
  const scriptUrl = resolveAssetUrl(`/Allscript/${scriptFileName}`);
  return fetch(scriptUrl)
    .then(r => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r.json();
    })
    .then(loadRolesFromList)
    .catch(err => {
      console.warn(`載入指定劇本失敗 (${scriptFileName})，改用預設劇本。`, err);
      return loadDefaultScript();
    });
}

function applyConfig(config) {
  if (!config || typeof config !== 'object') {
    return loadDefaultScript();
  }

  if (config.selectedScript === '__custom__') {
    if (!config.customJson) {
      console.warn('自訂劇本為空，改用預設劇本');
      return loadDefaultScript();
    }

    try {
      const customList = JSON.parse(config.customJson);
      return loadRolesFromList(customList);
    } catch (err) {
      console.error('解析自訂劇本失敗，改用預設劇本:', err);
      return loadDefaultScript();
    }
  }

  if (config.selectedScript) {
    return loadScriptByName(config.selectedScript);
  }

  return loadDefaultScript();
}

function ensureServerPolling() {
  if (serverPollTimer !== null) {
    return;
  }

  serverPollTimer = setInterval(() => {
    fetchAndApplyServerConfig();
  }, 5000);
}

async function fetchConfigFromServer() {
  const response = await fetch(SERVER_CONFIG_ENDPOINT);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchAndApplyServerConfig(force = false) {
  if (!force && hasActiveTwitchConfig) {
    return;
  }

  try {
    const config = await fetchConfigFromServer();
    const signature = JSON.stringify(config || {});
    if (!force && signature === lastServerConfigSignature) {
      return;
    }

    lastServerConfigSignature = signature;

    if (!config || Object.keys(config).length === 0) {
      await loadDefaultScript();
      return;
    }

    await applyConfig(config);
  } catch (err) {
    console.warn('讀取伺服器設定失敗，將使用預設劇本:', err);
    if (lastServerConfigSignature === null) {
      await loadDefaultScript();
      lastServerConfigSignature = '{}';
    }
  }
}

async function handleTwitchConfigChange() {
  const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
  if (!configStr) {
    hasActiveTwitchConfig = false;
    await fetchAndApplyServerConfig(true);
    return;
  }

  try {
    const config = JSON.parse(configStr);
    if (!config || Object.keys(config).length === 0) {
      hasActiveTwitchConfig = false;
      await fetchAndApplyServerConfig(true);
      return;
    }

    hasActiveTwitchConfig = true;
    await applyConfig(config);
  } catch (err) {
    console.error('解析 Twitch 設定錯誤，改用伺服器或預設劇本:', err);
    hasActiveTwitchConfig = false;
    await fetchAndApplyServerConfig(true);
  }
}

function setupTwitchIntegration() {
  const twitchExt = window.Twitch?.ext;
  if (!twitchExt) {
    return false;
  }

  const trigger = () => {
    handleTwitchConfigChange().catch(err => {
      console.error('處理 Twitch 設定時發生錯誤:', err);
    });
  };

  twitchExt.onAuthorized(trigger);
  twitchExt.configuration?.onChanged?.(trigger);
  return true;
}

async function init() {
  ensureServerPolling();
  const hasTwitch = setupTwitchIntegration();

  if (hasTwitch) {
    await handleTwitchConfigChange();
  } else {
    await fetchAndApplyServerConfig(true);
  }
}

init();

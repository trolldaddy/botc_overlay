const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');
const toggleButton = document.getElementById('toggleButton');
const globalTooltip = document.getElementById('globalTooltip');
const townsfolkTitleEl = document.getElementById('townsfolkTitle');
const outsiderTitleEl = document.getElementById('outsiderTitle');
const minionTitleEl = document.getElementById('minionTitle');
const demonTitleEl = document.getElementById('demonTitle');
const jinxTitleEl = document.getElementById('jinxTitle');
const townsfolkGrid = document.getElementById('townsfolkGrid');
const outsiderGrid = document.getElementById('outsiderGrid');
const minionGrid = document.getElementById('minionGrid');
const demonGrid = document.getElementById('demonGrid');
const jinxGrid = document.getElementById('jinxGrid');

const CATEGORY_DEFAULT_NAMES = {
  townsfolk: '鎮民',
  outsider: '外來者',
  minion: '爪牙',
  demon: '惡魔',
  'a jinxed': '相剋規則'
};

const categoryElements = {
  townsfolk: { title: townsfolkTitleEl, grid: townsfolkGrid },
  outsider: { title: outsiderTitleEl, grid: outsiderGrid },
  minion: { title: minionTitleEl, grid: minionGrid },
  demon: { title: demonTitleEl, grid: demonGrid },
  'a jinxed': { title: jinxTitleEl, grid: jinxGrid }
};

let isVisible = false;
let lastCookieSignature = null;
let cookiePollTimer = null;
let isUsingTwitchConfig = false;

const urlParams = new URLSearchParams(window.location.search);
const rawAssetsBase = urlParams.get('assetsBase') || '';

let assetBaseUrl = null;
if (rawAssetsBase) {
  try {
    assetBaseUrl = new URL(rawAssetsBase, window.location.href);
  } catch (err) {
    console.warn('指定的 assetsBase 無法解析，將改用預設來源:', err);
    assetBaseUrl = null;
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
const OVERLAY_CONFIG_COOKIE = 'botc_overlay_config_v1';
const OVERLAY_SCRIPT_COOKIE = 'botc_overlay_script_v1';
const COOKIE_POLL_INTERVAL = 5000;

let referenceDataPromise = null;

const TEAM_ALIASES = {
  townsfolk: 'townsfolk',
  townfolk: 'townsfolk',
  outsiders: 'outsider',
  outsider: 'outsider',
  minions: 'minion',
  minion: 'minion',
  demons: 'demon',
  demon: 'demon',
  'a jinxed': 'a jinxed',
  'a_jinxed': 'a jinxed',
  jinxed: 'a jinxed',
  jinx: 'a jinxed'
};

const CHINESE_TEAM_ALIASES = {
  鎮民: 'townsfolk',
  镇民: 'townsfolk',
  外來者: 'outsider',
  外来者: 'outsider',
  爪牙: 'minion',
  惡魔: 'demon',
  恶魔: 'demon',
  相剋: 'a jinxed',
  相克: 'a jinxed'
};

function normalizeTeam(rawTeam, rawChineseTeam) {
  if (rawTeam) {
    const key = String(rawTeam).trim().toLowerCase();
    if (key in TEAM_ALIASES) {
      return TEAM_ALIASES[key];
    }
  }

  if (rawChineseTeam) {
    const key = String(rawChineseTeam).trim();
    if (key in CHINESE_TEAM_ALIASES) {
      return CHINESE_TEAM_ALIASES[key];
    }
  }

  return null;
}

function normalizeImageUrl(raw) {
  if (!raw) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) {
    if (raw.startsWith('//')) {
      return `${window.location.protocol}${raw}`;
    }
    return raw;
  }

  return resolveAssetUrl(raw);
}

function getReferenceMap() {
  if (!referenceDataPromise) {
    const referenceListUrl = resolveAssetUrl('/EVERY_SINGLE_ROLE_with_chinese_abilities.json');
    referenceDataPromise = fetch(referenceListUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(list => {
        const map = new Map();
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (item && item.id) {
              map.set(item.id, item);
            }
          });
        }
        return map;
      })
      .catch(err => {
        console.error('載入角色資料參考表失敗:', err);
        return new Map();
      });
  }

  return referenceDataPromise;
}

function updateCategoryTitles(meta) {
  const metaNames = meta || {};
  const titleMap = {
    townsfolk: metaNames.townsfolkName || metaNames.townsfolk || CATEGORY_DEFAULT_NAMES.townsfolk,
    outsider: metaNames.outsidersName || metaNames.outsider || CATEGORY_DEFAULT_NAMES.outsider,
    minion: metaNames.minionsName || metaNames.minion || CATEGORY_DEFAULT_NAMES.minion,
    demon: metaNames.demonsName || metaNames.demon || CATEGORY_DEFAULT_NAMES.demon,
    'a jinxed': metaNames['a jinxedName'] || metaNames['a jinxed'] || CATEGORY_DEFAULT_NAMES['a jinxed']
  };

  Object.entries(categoryElements).forEach(([key, { title }]) => {
    if (title) {
      title.textContent = titleMap[key] || CATEGORY_DEFAULT_NAMES[key] || '';
    }
  });
}

function togglePanels() {
  isVisible = !isVisible;
  leftPanel.classList.toggle('show', isVisible);
  rightPanel.classList.toggle('show', isVisible);
}

toggleButton.addEventListener('click', togglePanels);

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

function loadConfigFromCookie() {
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

function loadScriptFromCookie() {
  const raw = getCookie(OVERLAY_SCRIPT_COOKIE);
  return raw || '';
}

async function loadRolesFromList(roleList) {
  if (!Array.isArray(roleList)) {
    throw new Error('角色資料格式不正確');
  }

  let meta = null;
  const playableRoles = [];

  roleList.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    if (entry.id === '_meta') {
      meta = entry;
      return;
    }

    if (entry.id) {
      playableRoles.push(entry);
    }
  });

  updateCategoryTitles(meta);

  const referenceMap = await getReferenceMap();

  Object.values(categoryElements).forEach(({ grid }) => {
    if (grid) {
      grid.innerHTML = '';
    }
  });

  playableRoles.forEach(role => {
    const reference = (role.id && referenceMap.get(role.id)) || null;
    const combined = { ...(reference || {}), ...role };
    const team = normalizeTeam(
      combined.team,
      role.sch_team || combined.sch_team || reference?.sch_team
    );

    if (!team || !categoryElements[team]) {
      return;
    }

    const displayName = combined.name ?? reference?.name_zh ?? reference?.name ?? role.id;
    const ability = (typeof combined.ability === 'string' && combined.ability.trim())
      ? combined.ability
      : (reference?.ability || '');
    const imageUrl = normalizeImageUrl(combined.image ?? reference?.image ?? '');
    const tooltipDirection = team === 'townsfolk' ? 'right' : 'left';

    const container = document.createElement('div');
    container.className = 'role';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = displayName;
    container.appendChild(img);

    const label = document.createElement('div');
    label.textContent = displayName;
    container.appendChild(label);

    const tooltipText = ability || '（沒有能力資訊）';
    container.addEventListener('mouseenter', () => {
      globalTooltip.textContent = tooltipText;
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

    categoryElements[team].grid.appendChild(container);
  });
}

async function loadDefaultScript() {
  const defaultScriptUrl = resolveAssetUrl(`/Allscript/${DEFAULT_SCRIPT}`);

  try {
    const data = await fetch(defaultScriptUrl).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    });
    await loadRolesFromList(data);
  } catch (err) {
    console.error('載入預設劇本失敗:', err);
  }
}

async function loadScriptByName(scriptFileName) {
  const scriptUrl = resolveAssetUrl(`/Allscript/${scriptFileName}`);

  try {
    const data = await fetch(scriptUrl).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    });
    await loadRolesFromList(data);
  } catch (err) {
    console.warn(`載入指定劇本失敗 (${scriptFileName})，改用預設劇本。`, err);
    await loadDefaultScript();
  }
}

async function applyConfig(config) {
  if (!config || typeof config !== 'object') {
    return loadDefaultScript();
  }

  if (config.selectedScript === '__custom__') {
    const scriptSource = typeof config.customJson === 'string' && config.customJson.trim()
      ? config.customJson
      : loadScriptFromCookie();

    if (!scriptSource) {
      console.warn('自訂劇本為空，改用預設劇本');
      return loadDefaultScript();
    }

    try {
      const customList = JSON.parse(scriptSource);
      await loadRolesFromList(customList);
      return;
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

async function applyCookieConfig(force = false) {
  if (!force && isUsingTwitchConfig) {
    return;
  }

  const config = loadConfigFromCookie();
  const scriptFromCookie = loadScriptFromCookie();
  const signature = JSON.stringify({ config: config || {}, script: scriptFromCookie });
  if (!force && signature === lastCookieSignature) {
    return;
  }

  lastCookieSignature = signature;

  if (config && typeof config === 'object' && Object.keys(config).length > 0) {
    await applyConfig(config);
  } else {
    await loadDefaultScript();
  }
}

function ensureCookiePolling() {
  if (cookiePollTimer !== null) {
    return;
  }

  cookiePollTimer = setInterval(() => {
    applyCookieConfig(false).catch(err => {
      console.warn('更新 Cookie 設定時發生錯誤:', err);
    });
  }, COOKIE_POLL_INTERVAL);
}

async function handleTwitchConfigChange() {
  const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
  if (!configStr) {
    isUsingTwitchConfig = false;
    await applyCookieConfig(true);
    return;
  }

  try {
    const config = JSON.parse(configStr);
    if (!config || Object.keys(config).length === 0) {
      isUsingTwitchConfig = false;
      await applyCookieConfig(true);
      return;
    }

    isUsingTwitchConfig = true;
    lastCookieSignature = JSON.stringify(loadConfigFromCookie() || {});
    await applyConfig(config);
  } catch (err) {
    console.error('解析 Twitch 設定錯誤，改用 Cookie 或預設劇本:', err);
    isUsingTwitchConfig = false;
    await applyCookieConfig(true);
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
  ensureCookiePolling();
  const hasTwitch = setupTwitchIntegration();

  if (hasTwitch) {
    await handleTwitchConfigChange();
  } else {
    await applyCookieConfig(true);
  }
}

init();

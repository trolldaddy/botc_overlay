(function() {
  'use strict';

  const ready = () => {
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const toggleButton = document.getElementById('toggleButton');
    const globalTooltip = document.getElementById('globalTooltip');

    if (!leftPanel || !rightPanel || !toggleButton || !globalTooltip) {
      return;
    }

    let isVisible = false;
    let referencePromise;

    const getReferenceData = () => {
      if (!referencePromise) {
        referencePromise = fetch('/EVERY_SINGLE_ROLE_with_chinese_abilities.json')
          .then(r => r.json())
          .catch(err => {
            console.error('載入角色資料失敗', err);
            referencePromise = undefined;
            throw err;
          });
      }
      return referencePromise;
    };

    const renderRoles = async (roleList) => {
      if (!Array.isArray(roleList)) {
        return;
      }

      const referenceList = await getReferenceData();
      const referenceMap = Object.fromEntries(referenceList.map(role => [role.id, role]));

      const grids = {
        townsfolk: document.getElementById('townsfolkGrid'),
        outsider: document.getElementById('outsiderGrid'),
        minion: document.getElementById('minionGrid'),
        demon: document.getElementById('demonGrid')
      };

      Object.values(grids).forEach(grid => {
        if (grid) {
          grid.innerHTML = '';
        }
      });

      roleList.forEach(role => {
        const ref = referenceMap[role.id];
        if (!ref) {
          return;
        }

        const container = document.createElement('div');
        container.className = 'role';

        const img = document.createElement('img');
        img.src = ref.image || '';
        img.alt = ref.name_zh || ref.name || role.id;

        const label = document.createElement('div');
        label.textContent = ref.name_zh || ref.name || role.id;

        container.appendChild(img);
        container.appendChild(label);

        container.addEventListener('mouseenter', () => {
          globalTooltip.textContent = ref.ability || '';
          globalTooltip.style.display = 'block';

          const rect = container.getBoundingClientRect();
          const alignLeft = ref.team !== 'townsfolk';
          const offsetX = alignLeft
            ? Math.max(10, rect.left - globalTooltip.offsetWidth - 10)
            : Math.min(window.innerWidth - globalTooltip.offsetWidth - 10, rect.right + 10);
          const offsetY = rect.top + window.scrollY;
          globalTooltip.style.left = `${offsetX}px`;
          globalTooltip.style.top = `${offsetY}px`;
        });

        container.addEventListener('mouseleave', () => {
          globalTooltip.style.display = 'none';
        });

        const grid = grids[ref.team];
        if (grid) {
          grid.appendChild(container);
        }
      });
    };

    const resolveScriptUrl = (name) => {
      if (!name) {
        return '/Allscript/trouble_brewing.json';
      }
      if (name.startsWith('http://') || name.startsWith('https://')) {
        return name;
      }
      if (name.startsWith('/')) {
        return name;
      }
      if (name.startsWith('Allscript/')) {
        return `/${name}`;
      }
      return `/Allscript/${name}`;
    };

    const loadScriptByName = (name) => {
      return fetch(resolveScriptUrl(name))
        .then(r => r.json())
        .then(renderRoles);
    };

    const loadDefaultScript = () => {
      loadScriptByName('trouble_brewing.json').catch(err => {
        console.error('載入預設劇本失敗', err);
      });
    };

    const applyConfig = (config) => {
      if (!config || !config.selectedScript) {
        loadDefaultScript();
        return;
      }

      if (config.selectedScript === '__custom__' && config.customJson) {
        const decompressed = LZString.decompressFromBase64(config.customJson);
        if (decompressed) {
          try {
            const parsed = JSON.parse(decompressed);
            renderRoles(parsed);
            return;
          } catch (err) {
            console.error('自訂劇本解析失敗', err);
          }
        } else {
          console.warn('自訂劇本解壓縮失敗');
        }
      }

      loadScriptByName(config.selectedScript).catch(err => {
        console.error('載入指定劇本失敗', err);
        loadDefaultScript();
      });
    };

    const handleConfigChange = () => {
      const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
      if (!configStr) {
        loadDefaultScript();
        return;
      }

      try {
        const config = JSON.parse(configStr);
        applyConfig(config);
      } catch (err) {
        console.error('解析設定錯誤', err);
        loadDefaultScript();
      }
    };

    toggleButton.addEventListener('click', () => {
      isVisible = !isVisible;
      leftPanel.classList.toggle('show', isVisible);
      rightPanel.classList.toggle('show', isVisible);
    });

    if (window.Twitch?.ext) {
      window.Twitch.ext.onAuthorized(handleConfigChange);
      window.Twitch.ext.configuration?.onChanged(handleConfigChange);
      handleConfigChange();
    } else {
      loadDefaultScript();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();

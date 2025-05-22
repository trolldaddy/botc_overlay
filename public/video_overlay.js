 <script>
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const toggleButton = document.getElementById('toggleButton');
    const globalTooltip = document.getElementById('globalTooltip');
    let isVisible = false;

    toggleButton.addEventListener('click', () => {
      isVisible = !isVisible;
      leftPanel.classList.toggle('show', isVisible);
      rightPanel.classList.toggle('show', isVisible);
    });

    
    async function loadRolesFromList(roleList) {
      const referenceList = await fetch('/EVERY_SINGLE_ROLE_with_chinese_abilities.json').then(r => r.json());
      const referenceMap = Object.fromEntries(referenceList.map(r => [r.id, r]));

      document.getElementById('townsfolkGrid').innerHTML = '';
      document.getElementById('outsiderGrid').innerHTML = '';
      document.getElementById('minionGrid').innerHTML = '';
      document.getElementById('demonGrid').innerHTML = '';

      const grids = {
        townsfolk: document.getElementById('townsfolkGrid'),
        outsider: document.getElementById('outsiderGrid'),
        minion: document.getElementById('minionGrid'),
        demon: document.getElementById('demonGrid')
      };

      roleList.forEach(role => {
        const ref = referenceMap[role.id];
        if (!ref) return;

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
          let offsetX = tooltipDirection === 'left'
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

    
function handleConfigChange() {
  console.log("🔁 手動觸發重新載入");
  const configStr = window.Twitch.ext.configuration.broadcaster?.content;
  if (!configStr) return;
  try {
    const config = JSON.parse(configStr);
    if (config.selectedScript === '__custom__' && config.customJson) {
      const customList = JSON.parse(config.customJson);
      loadRolesFromList(customList);
    } else if (config.selectedScript) {
      fetch(`/Allscript/${config.selectedScript}`)
        .then(r => r.json())
        .then(loadRolesFromList)
        .catch(() => fetch('/Allscript/trouble_brewing.json').then(r => r.json()).then(loadRolesFromList));
    } else {
      fetch('/Allscript/trouble_brewing.json').then(r => r.json()).then(loadRolesFromList);
    }
  } catch (e) {
    console.error('解析設定錯誤:', e);
    fetch('/Allscript/trouble-brewing.json').then(r => r.json()).then(loadRolesFromList);
  }
}

   async function init() {
      if (window.Twitch && window.Twitch.ext) {
        window.Twitch.ext.onAuthorized(() => {
          const cfgStr = window.Twitch.ext.configuration?.broadcaster?.content;
          try {
            const cfg = JSON.parse(cfgStr || '{}');
            if (cfg.customJson) {
              const parsed = JSON.parse(cfg.customJson);
              loadRolesFromList(parsed);
            } else if (cfg.selectedScript) {
              fetch(`/${cfg.selectedScript}`)
                .then(r => r.json())
                .then(loadRolesFromList);
            } else {
              fetch('/Allscript/trouble_brewing.json')
                .then(r => r.json())
                .then(loadRolesFromList);
            }
          } catch (e) {
            console.error('解析設定失敗，使用 fallback：', e);
            fetch('/Allscript/trouble_brewing.json')
              .then(r => r.json())
              .then(loadRolesFromList);
          }
        });
      } else {
        fetch('/Allscript/trouble_brewing.json')
          .then(r => r.json())
          .then(loadRolesFromList);
      }
    }

    init();
   
     </script>

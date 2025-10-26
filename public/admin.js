(function() {
  'use strict';

  const ready = () => {
    const scriptListEl = document.getElementById('scriptList');
    const customJsonBlock = document.getElementById('customJsonBlock');
    const customJsonEl = document.getElementById('customJson');
    const saveButton = document.getElementById('saveButton');
    const statusMessage = document.getElementById('statusMessage');

    if (!scriptListEl || !customJsonBlock || !customJsonEl || !saveButton || !statusMessage) {
      return;
    }

    const showStatus = (message, isError = false) => {
      statusMessage.textContent = message;
      statusMessage.classList.toggle('status-message--error', isError);
    };

    const toggleCustomBlock = () => {
      const shouldShow = scriptListEl.value === '__custom__';
      customJsonBlock.style.display = shouldShow ? 'block' : 'none';
    };

    scriptListEl.innerHTML = `<option value="">-- 請選擇劇本 --</option><option value="__custom__">自訂劇本</option>`;

    const fetchScriptList = async () => {
      try {
        const res = await fetch('/Allscript/scripts.json');
        const scripts = await res.json();
        const options = [`<option value="">-- 請選擇劇本 --</option>`]
          .concat(scripts.map(name => `<option value="${name}">${name}</option>`))
          .concat('<option value="__custom__">自訂劇本</option>');
        scriptListEl.innerHTML = options.join('');
      } catch (err) {
        console.error('載入劇本清單失敗', err);
        showStatus('⚠️ 無法取得劇本清單，請稍後再試', true);
      }
    };

    const parseCustomJson = (raw) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error('自訂劇本內容不可為空');
      }
      return JSON.parse(trimmed);
    };

    const handleConfigChange = () => {
      const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
      if (!configStr) {
        return;
      }

      try {
        const config = JSON.parse(configStr);
        scriptListEl.value = config.selectedScript || '';
        toggleCustomBlock();

        if (config.selectedScript === '__custom__' && config.customJson) {
          const decompressed = LZString.decompressFromBase64(config.customJson);
          if (decompressed) {
            customJsonEl.value = JSON.stringify(JSON.parse(decompressed), null, 2);
          } else {
            customJsonEl.value = '';
            showStatus('⚠️ 無法解壓自訂劇本內容，請重新儲存', true);
          }
        } else {
          customJsonEl.value = '';
        }
      } catch (err) {
        console.error('解析設定失敗', err);
        showStatus('⚠️ 無法解析現有設定', true);
      }
    };

    saveButton.addEventListener('click', () => {
      const selectedScript = scriptListEl.value;
      const timestamp = Date.now();
      let content;

      if (selectedScript === '__custom__') {
        try {
          const parsed = parseCustomJson(customJsonEl.value);
          const compressed = LZString.compressToBase64(JSON.stringify(parsed));

          if (!compressed) {
            throw new Error('壓縮結果為空');
          }

          if (compressed.length > 4800) {
            showStatus('⚠️ 壓縮後仍超過 5KB Twitch 限制，請縮小內容', true);
            return;
          }

          content = { selectedScript, customJson: compressed, _timestamp: timestamp };
        } catch (err) {
          console.error('自訂劇本錯誤', err);
          showStatus('❌ 自訂劇本 JSON 格式錯誤，請確認語法', true);
          return;
        }
      } else {
        content = { selectedScript, _timestamp: timestamp };
      }

      if (window.Twitch?.ext?.configuration) {
        window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify(content));
        showStatus('✅ 設定已儲存！請切換 Overlay 檢視結果');
      } else {
        showStatus('❌ 無法存取 Twitch Extension API', true);
      }
    });

    scriptListEl.addEventListener('change', toggleCustomBlock);

    if (window.Twitch?.ext?.configuration) {
      window.Twitch.ext.configuration.onChanged(handleConfigChange);
      handleConfigChange();
    }

    fetchScriptList().then(toggleCustomBlock);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();

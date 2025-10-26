    const scriptListEl = document.getElementById('scriptList');
    const customJsonBlock = document.getElementById('customJsonBlock');
    const customJsonEl = document.getElementById('customJson');
    const saveButton = document.getElementById('saveButton');

  fetch('/Allscript/scripts.json')
      .then(res => res.json())
      .then(scripts => {
        scriptListEl.innerHTML = `<option value="">-- 請選擇劇本 --</option>` +
          scripts.map(f => `<option value="${f}">${f}</option>`).join('') +
          `<option value="__custom__">自訂劇本</option>`;
      });

    scriptListEl.addEventListener('change', () => {
      customJsonBlock.style.display = scriptListEl.value === '__custom__' ? 'block' : 'none';
    });

saveButton.addEventListener('click', () => {
    const selectedScript = scriptListEl.value;
    const customJson = customJsonEl.value.trim();

    // 基本結構
    let content;

    if (selectedScript === '__custom__') {
        try {
            // 驗證 JSON 格式
            const parsed = JSON.parse(customJson);

            // 壓縮成 Base64
            const compressed = LZString.compressToBase64(JSON.stringify(parsed));
            console.log('原始長度:', customJson.length, '→ 壓縮後長度:', compressed.length);

            if (compressed.length > 4800) {
                alert('⚠️ 壓縮後仍超過 5KB Twitch 限制，請縮小內容');
                return;
            }

            // 存入壓縮後版本
            content = { selectedScript, compressedJson: compressed, _timestamp: Date.now() };
        } catch (err) {
            alert('❌ JSON 格式錯誤，請確認語法');
            console.error(err);
            return;
        }
    } else {
        // 預設劇本不需壓縮
        content = { selectedScript, _timestamp: Date.now() };
    }

    // 上傳到 Twitch Config
    if (window.Twitch?.ext?.configuration) {
        window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify(content));
        document.getElementById('statusMessage').textContent =
            '✅ 設定已壓縮並儲存！請切換 Overlay 測試結果';
    } else {
        document.getElementById('statusMessage').textContent =
            '❌ 無法存取 Twitch Extension API';
    }
});



    if (window.Twitch?.ext) {
      window.Twitch.ext.configuration.onChanged(() => {
        const configStr = window.Twitch.ext.configuration.broadcaster?.content;
        try {
          const config = JSON.parse(configStr || '{}');
          scriptListEl.value = config.selectedScript || '';
          customJsonEl.value = config.customJson || '';
          customJsonBlock.style.display = config.selectedScript === '__custom__' ? 'block' : 'none';
        } catch {}
      });
    }

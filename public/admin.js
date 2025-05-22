  <script>
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

  const content = selectedScript === '__custom__'
    ? { selectedScript, customJson ,_timestamp: Date.now() }
    : { selectedScript,_timestamp: Date.now() };

  if (window.Twitch?.ext?.configuration) {
    window.Twitch.ext.configuration.set('broadcaster', '1', JSON.stringify(content));
    document.getElementById('statusMessage').textContent = '✅ 設定已儲存！請切換 Overlay 測試結果';
  } else {
    document.getElementById('statusMessage').textContent = '❌ 無法存取 Twitch Extension API';
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
  </script>

const tooltip = document.getElementById('tooltip');
const scriptOverview = document.getElementById('script-overview');
const showScriptButton = document.getElementById('show-script');

let characterData = {};

// 載入角色資料
fetch('characters.json')
  .then(response => response.json())
  .then(data => characterData = data);

// 顯示滑鼠提示
document.querySelectorAll('.seat').forEach(seat => {
  seat.addEventListener('mouseenter', (e) => {
    const charId = seat.dataset.character;
    const info = characterData[charId];
    if (info) {
      tooltip.innerHTML = `<strong>${info.name}</strong><br>${info.ability}`;
      tooltip.style.display = 'block';
      tooltip.style.top = e.clientY + 'px';
      tooltip.style.left = e.clientX + 'px';
    }
  });

  seat.addEventListener('mousemove', (e) => {
    tooltip.style.top = e.clientY + 'px';
    tooltip.style.left = e.clientX + 'px';
  });

  seat.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
});

// 展開劇本角色總覽
showScriptButton.addEventListener('click', () => {
  if (scriptOverview.classList.contains('hidden')) {
    scriptOverview.innerHTML = Object.values(characterData).map(c =>
      `<p><strong>${c.name}</strong>: ${c.ability}</p>`
    ).join('');
    scriptOverview.classList.remove('hidden');
  } else {
    scriptOverview.classList.add('hidden');
  }
});

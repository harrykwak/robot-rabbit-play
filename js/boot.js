// Keep startup failures actionable, including browsers without WebGL2.
(async () => { try {
  await import('./main.js');
} catch (error) {
  console.error('Robot Rabbit startup failed:', error);
  const loading = document.getElementById('loading');
  loading.classList.remove('done');
  loading.classList.add('load-failed');
  const heading = document.createElement('strong');
  heading.className = 'rr-ribbon rr-red';
  heading.textContent = '시작하지 못했어요';
  const help = document.createElement('p');
  help.className = 'rr-card';
  help.textContent = '앱을 다시 열어 주세요. Android에서는 시스템 WebView와 Chrome을 업데이트해 주세요. 웹에서는 WebGL2를 지원하는 최신 Safari 또는 Chrome이 필요합니다.';
  const retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'btn big rr-shine'; retry.textContent = '다시 열기';
  retry.addEventListener('click', () => location.reload());
  loading.replaceChildren(heading, help, retry);
} })();

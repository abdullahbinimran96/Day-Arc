document.addEventListener('DOMContentLoaded', () => {
  const connBadge = document.getElementById('conn-badge');
  const sessionCard = document.getElementById('session-card');
  const sessionTitle = document.getElementById('session-title');
  const sessionDesc = document.getElementById('session-desc');
  const allowedList = document.getElementById('allowed-list');
  const urlsContainer = document.getElementById('urls-container');
  const securityStatus = document.getElementById('security-status');

  chrome.storage.local.get(['isConnected', 'activeSession', 'privateBlocklist', 'blockAdultContent'], (data) => {
    // 1. Connection status
    if (data.isConnected) {
      connBadge.textContent = 'Connected';
      connBadge.className = 'badge connected';
    } else {
      connBadge.textContent = 'Offline';
      connBadge.className = 'badge disconnected';
    }

    // 2. Active Session
    if (data.activeSession) {
      sessionCard.className = 'card active';
      sessionTitle.textContent = data.activeSession.taskName || 'Focus Session Active';
      sessionTitle.style.color = '#4FD6C4';
      sessionDesc.textContent = data.activeSession.isStrict ? 'Strict Mode: Other tabs will be blocked.' : 'Focus Mode active.';

      if (data.activeSession.allowedUrls && data.activeSession.allowedUrls.length > 0) {
        allowedList.style.display = 'block';
        urlsContainer.innerHTML = '';
        data.activeSession.allowedUrls.forEach(url => {
          const li = document.createElement('li');
          li.textContent = url;
          urlsContainer.appendChild(li);
        });
      } else {
        allowedList.style.display = 'none';
      }
    } else {
      sessionCard.className = 'card empty';
      sessionTitle.textContent = 'No Active Session';
      sessionTitle.style.color = '#EDEDF3';
      sessionDesc.textContent = 'Start a task in Day Arc to enforce focus URLs.';
      allowedList.style.display = 'none';
    }

    // 3. Security Status
    const count = (data.privateBlocklist || []).length;
    const adult = data.blockAdultContent ? ' + Adult Blocker ON' : '';
    securityStatus.textContent = `${count} custom blocked sites${adult}`;
  });
});

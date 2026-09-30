// Day Arc YouTube Video Lock Content Script
// Automatically intercepts clicks on suggestion videos and redirects back to the assigned task URL.

(function() {
  let assignedVideoId = null;
  let assignedUrl = null;

  function extractVideoId(url) {
    if (!url) return null;
    try {
      const u = new URL(url, window.location.origin);
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/live/')) return u.pathname.split('/')[2];
      if (u.hostname === 'youtu.be') return u.pathname.replace(/^\/+/, '');
    } catch (e) {}
    return null;
  }

  function syncSession() {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SESSION' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.activeSession) {
            assignedVideoId = null;
            assignedUrl = null;
            return;
          }

          const session = response.activeSession;
          if (session.allowedVideoIds && session.allowedVideoIds.length > 0) {
            assignedVideoId = session.allowedVideoIds[0];
            assignedUrl = session.allowedUrls[0] || `https://www.youtube.com/watch?v=${assignedVideoId}`;
            checkAndEnforceCurrentPage();
          } else {
            assignedVideoId = null;
            assignedUrl = null;
          }
        });
      }
    } catch (e) {}
  }

  function checkAndEnforceCurrentPage() {
    if (!assignedVideoId || !assignedUrl) return;
    const currentVid = extractVideoId(window.location.href);
    if (currentVid && currentVid !== assignedVideoId) {
      console.log(`[DayArc Guard] Video mismatch detected (${currentVid} vs ${assignedVideoId}). Restoring assigned URL.`);
      window.location.replace(assignedUrl);
    }
  }

  // Intercept in-page click events on suggestion links
  document.addEventListener('click', (e) => {
    if (!assignedVideoId || !assignedUrl) return;
    const anchor = e.target.closest('a');
    if (!anchor || !anchor.href) return;

    const targetVid = extractVideoId(anchor.href);
    if (targetVid && targetVid !== assignedVideoId) {
      console.log(`[DayArc Guard] Intercepted click on suggestion video: ${targetVid}. Redirecting to assigned video.`);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.location.replace(assignedUrl);
    }
  }, true);

  // Listen to YouTube SPA navigation start event
  window.addEventListener('yt-navigate-start', (e) => {
    if (!assignedVideoId || !assignedUrl) return;
    const targetUrl = (e.detail && e.detail.url) || '';
    const targetVid = extractVideoId(targetUrl);
    if (targetVid && targetVid !== assignedVideoId) {
      console.log(`[DayArc Guard] Intercepted yt-navigate-start to ${targetVid}. Restoring assigned video.`);
      if (e.preventDefault) e.preventDefault();
      window.location.replace(assignedUrl);
    }
  }, true);

  // Periodic safety check
  setInterval(checkAndEnforceCurrentPage, 800);

  // Initial sync and poll on focus
  syncSession();
  window.addEventListener('focus', syncSession);
})();

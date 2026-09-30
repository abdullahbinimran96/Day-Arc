// Day Arc Chrome Extension Service Worker (v1.1.0)
// Architectural Robust Design: Authoritative session state, safe URL matching,
// YouTube ID case-preservation, auth/consent support, debounced restoration, and tab management.

const WS_PORT = 48123;
let socket = null;
let isConnected = false;

// Authoritative Session State
let activeSession = null;
// Structure:
// {
//   taskId: string,
//   taskName: string,
//   allowedUrls: string[],
//   allowedVideoIds: string[],
//   allowedChannels: string[],
//   allowedPlaylists: string[],
//   allowedOrigins: string[],
//   isStrict: boolean,
//   taskTabId: number | null,
//   taskWindowId: number | null,
//   startTime: number,
//   endTime: number
// }

let privateBlocklist = [];
let blockAdultContent = false;
const isRestoringMap = new Map(); // tabId -> timestamp

const adultDomainKeywords = [
  'porn', 'xxx', 'xvideos', 'xnxx', 'xhamster', 'hentai', 'erotic', 'nsfw',
  'chaturbate', 'onlyfans', 'redtube', 'spankbang', 'brazzers', 'rule34',
  'gelbooru', 'danbooru', 'beeg', 'fapello', 'redgifs', 'motherless', 'heavy-r',
  'tblop', 'adultwork', 'livejasmin', 'bongacams', 'stripchat', 'camsoda',
  'eporner', 'hqporner', 'daftsex', 'thumbzilla', 'naughtyamerica', 'realitykings',
  'bangbros', 'mofos', 'twistys', 'playboy', 'penthouse', 'erome', 'e-hentai',
  'nhentai', 'tsumino', 'hitomi', 'hanime', 'hentaihaven', 'luscious', 'hentai2read',
  'pururin', 'simply-hentai', 'fakku', 'manyvids', 'clips4sale', 'coomer', 'kemono',
  'bdsmlr', 'fetlife', 'eroprofile', 'fuq', 'tnaflix', 'sunporno', 'empflix',
  'drtuber', 'nuvid', 'pornmd', 'extremetube', 'keezmovies', 'alphaporno', 'tubehd',
  'txxx', 'upornia', 'voyeurweb', 'hotmovs', 'tubepornclassic', 'adultfriendfinder'
];

// --- 1. WebSocket Connection to Day Arc Desktop App ---
function connectToDayArc() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);

    socket.onopen = () => {
      isConnected = true;
      console.log('[DayArc Ext] Connected to Day Arc desktop server.');
      chrome.storage.local.set({ isConnected: true });
      socket.send(JSON.stringify({ type: 'EXTENSION_HELLO', version: '1.1.0' }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('[DayArc Ext] Message parse error:', err);
      }
    };

    socket.onclose = () => {
      isConnected = false;
      chrome.storage.local.set({ isConnected: false });
      console.log('[DayArc Ext] Disconnected. Reconnecting in 3s...');
      setTimeout(connectToDayArc, 3000);
    };

    socket.onerror = () => {
      isConnected = false;
      chrome.storage.local.set({ isConnected: false });
    };
  } catch (e) {
    isConnected = false;
    setTimeout(connectToDayArc, 3000);
  }
}

// Internal message listener for content script queries
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === 'GET_ACTIVE_SESSION') {
    sendResponse({ activeSession });
    return false;
  }
});

// --- 2. Session Initialization & Normalization ---
function parseAllowedUrls(urls = []) {
  const allowedUrls = [];
  const allowedVideoIds = [];
  const allowedChannels = [];
  const allowedPlaylists = [];
  const allowedOrigins = [];

  (Array.isArray(urls) ? urls : [urls]).forEach(rawUrl => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    let clean = rawUrl.trim().replace(/^(https?:\/\/)+/gi, '');
    if (!clean) return;
    const fullUrl = 'https://' + clean;
    allowedUrls.push(fullUrl);

    try {
      const parsed = new URL(fullUrl);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      allowedOrigins.push(host);

      if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
        const ytInfo = extractYouTubeInfo(fullUrl);
        if (ytInfo.type === 'video' && ytInfo.id) {
          allowedVideoIds.push(ytInfo.id);
        } else if (ytInfo.type === 'channel' && ytInfo.path) {
          allowedChannels.push(ytInfo.path.toLowerCase());
        } else if (ytInfo.type === 'playlist' && ytInfo.id) {
          allowedPlaylists.push(ytInfo.id);
        }
      }
    } catch (e) {}
  });

  return { allowedUrls, allowedVideoIds, allowedChannels, allowedPlaylists, allowedOrigins };
}

function handleServerMessage(msg) {
  console.log('[DayArc Ext] Received command:', msg.type);

  if (msg.type === 'START_SESSION') {
    const parsed = parseAllowedUrls(msg.allowedUrls || []);
    activeSession = {
      taskId: msg.id || msg.taskId || `task-${Date.now()}`,
      taskName: msg.taskName || 'Focus Session',
      allowedUrls: parsed.allowedUrls,
      allowedVideoIds: parsed.allowedVideoIds,
      allowedChannels: parsed.allowedChannels,
      allowedPlaylists: parsed.allowedPlaylists,
      allowedOrigins: parsed.allowedOrigins,
      isStrict: !!msg.isStrict,
      taskTabId: null,
      taskWindowId: null,
      startTime: Date.now(),
      endTime: msg.endTime || Date.now() + 30 * 60000
    };
    chrome.storage.local.set({ activeSession });
    console.log('[DayArc Ext] Active session started with parsed rules:', activeSession);

    // Focus Chrome window and activate the assigned task tab
    if (activeSession.allowedUrls && activeSession.allowedUrls.length > 0) {
      chrome.tabs.query({}, (tabs) => {
        let matchingTab = tabs.find(t => isUrlAllowed(t.url || t.pendingUrl, activeSession));
        if (matchingTab) {
          activeSession.taskTabId = matchingTab.id;
          activeSession.taskWindowId = matchingTab.windowId;
          chrome.tabs.update(matchingTab.id, { active: true });
          chrome.windows.update(matchingTab.windowId, { focused: true, state: 'normal' }).catch(() => {});
        } else {
          // Open or update target in current window
          chrome.tabs.create({ url: activeSession.allowedUrls[0], active: true }, (newTab) => {
            if (newTab) {
              activeSession.taskTabId = newTab.id;
              activeSession.taskWindowId = newTab.windowId;
              chrome.windows.update(newTab.windowId, { focused: true, state: 'normal' }).catch(() => {});
            }
          });
        }
      });
    }

    enforceActiveTabs();
  } else if (msg.type === 'STOP_SESSION') {
    console.log('[DayArc Ext] Session stopped. Releasing all URL enforcement.');
    activeSession = null;
    isRestoringMap.clear();
    chrome.storage.local.remove('activeSession');
  } else if (msg.type === 'RESTORE_BROWSER_WINDOW') {
    if (activeSession && activeSession.taskWindowId) {
      chrome.windows.update(activeSession.taskWindowId, { state: 'normal', focused: true }).catch(() => {});
      if (activeSession.taskTabId) {
        chrome.tabs.update(activeSession.taskTabId, { active: true }).catch(() => {});
      }
    }
  } else if (msg.type === 'SYNC_SECURITY_RULES') {
    privateBlocklist = (msg.blockedDomains || []).map(d => d.toLowerCase().trim());
    blockAdultContent = !!msg.blockAdultContent;
    chrome.storage.local.set({ privateBlocklist, blockAdultContent });
  }
}

// --- 3. URL Canonicalization & Matching Engine ---
function getHostFromUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    let u = rawUrl.trim().replace(/^(https?:\/\/)+/gi, '');
    u = 'https://' + u;
    const parsed = new URL(u);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    let u = rawUrl.trim().replace(/^(https?:\/\/)+/gi, '').replace(/^www\./i, '');
    return u.split('/')[0].toLowerCase();
  }
}

// Extracts YouTube video, channel, or playlist information with strict case-sensitivity for IDs
function extractYouTubeInfo(rawUrl) {
  if (!rawUrl) return { type: 'unknown', id: null, path: null };
  try {
    let u = rawUrl.trim().replace(/^(https?:\/\/)+/gi, '');
    u = 'https://' + u;
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.searchParams.has('v')) {
        return { type: 'video', id: parsed.searchParams.get('v') }; // Exact case preserved!
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return { type: 'video', id: parsed.pathname.split('/')[2] };
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return { type: 'video', id: parsed.pathname.split('/')[2] };
      }
      if (parsed.pathname.startsWith('/live/')) {
        return { type: 'video', id: parsed.pathname.split('/')[2] };
      }
      if (parsed.pathname.startsWith('/@') || parsed.pathname.startsWith('/channel/') || parsed.pathname.startsWith('/c/') || parsed.pathname.startsWith('/user/')) {
        return { type: 'channel', path: parsed.pathname };
      }
      if (parsed.searchParams.has('list')) {
        return { type: 'playlist', id: parsed.searchParams.get('list') };
      }
    } else if (host === 'youtu.be') {
      const vidId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return { type: 'video', id: vidId };
    }
  } catch (e) {}
  return { type: 'unknown', id: null, path: null };
}

function isInternalBrowserUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  );
}

function isSafeAuthOrConsentUrl(url) {
  if (!url) return false;
  const host = getHostFromUrl(url);
  if (!host) return false;

  const safeAuthHosts = [
    'accounts.google.com',
    'consent.youtube.com',
    'myaccount.google.com',
    'policies.google.com',
    'ssl.gstatic.com',
    'apis.google.com',
    'recaptcha.net',
    'google.com'
  ];

  return safeAuthHosts.some(s => host === s || host.endsWith('.' + s));
}

function isUrlAllowed(url, session) {
  if (!session || !session.allowedUrls || session.allowedUrls.length === 0) {
    return true; // No restriction
  }
  if (!url || isInternalBrowserUrl(url) || isSafeAuthOrConsentUrl(url)) {
    return true; // Browser internals and auth/consent always allowed
  }

  const targetHost = getHostFromUrl(url);
  if (!targetHost) return true;

  const ytTarget = extractYouTubeInfo(url);

  // 1. If active session is locked to specific YouTube Video(s):
  if (session.allowedVideoIds && session.allowedVideoIds.length > 0) {
    if (targetHost === 'youtube.com' || targetHost === 'm.youtube.com' || targetHost === 'youtu.be') {
      // Must match one of the assigned video IDs (exact case)
      if (ytTarget.type === 'video' && ytTarget.id) {
        return session.allowedVideoIds.includes(ytTarget.id);
      }
      return false; // Homepage, search, or other videos on YouTube are blocked
    }
  }

  // 2. If active session is locked to a YouTube Channel:
  if (session.allowedChannels && session.allowedChannels.length > 0) {
    if (targetHost === 'youtube.com' || targetHost === 'm.youtube.com') {
      try {
        let u = url.trim().replace(/^(https?:\/\/)+/gi, '');
        const p = new URL('https://' + u);
        const lowerPath = p.pathname.toLowerCase();
        return session.allowedChannels.some(ch => lowerPath.startsWith(ch));
      } catch (e) {}
    }
  }

  // 3. If active session is locked to a YouTube Playlist:
  if (session.allowedPlaylists && session.allowedPlaylists.length > 0) {
    if (targetHost === 'youtube.com' || targetHost === 'm.youtube.com') {
      try {
        let u = url.trim().replace(/^(https?:\/\/)+/gi, '');
        const p = new URL('https://' + u);
        const listParam = p.searchParams.get('list');
        if (listParam && session.allowedPlaylists.includes(listParam)) {
          return true;
        }
      } catch (e) {}
    }
  }

  // 4. General Domain / Path Prefix Matching:
  return session.allowedUrls.some(allowed => {
    const allowedHost = getHostFromUrl(allowed);
    if (!allowedHost) return false;

    // Match Domain or Subdomain
    if (!(targetHost === allowedHost || targetHost.endsWith('.' + allowedHost) || allowedHost.endsWith('.' + targetHost))) {
      return false;
    }

    // Match Subpath (if specified, e.g. /learn/course-1)
    try {
      let uAllowed = allowed.trim().replace(/^(https?:\/\/)+/gi, '');
      const parsedAllowed = new URL('https://' + uAllowed);
      const allowedPath = parsedAllowed.pathname.replace(/\/+$/, '').toLowerCase();

      if (allowedPath && allowedPath !== '' && allowedPath !== '/') {
        let uTarget = url.trim().replace(/^(https?:\/\/)+/gi, '');
        const parsedTarget = new URL('https://' + uTarget);
        const targetPath = parsedTarget.pathname.replace(/\/+$/, '').toLowerCase();
        return targetPath.startsWith(allowedPath);
      }
    } catch (e) {}

    return true;
  });
}

// --- 4. Debounced Restoration Engine ---
function restoreTabToAssignedUrl(tabId, targetUrl, reason) {
  const now = Date.now();
  const lastRestore = isRestoringMap.get(tabId) || 0;
  if (now - lastRestore < 1200) {
    // Cooldown prevents infinite reload/redirect loops
    return;
  }
  isRestoringMap.set(tabId, now);
  console.log(`[DayArc Ext] Restoring tab ${tabId} to ${targetUrl} (Reason: ${reason})`);

  chrome.tabs.update(tabId, { url: targetUrl }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[DayArc Ext] Tab update warning:', chrome.runtime.lastError.message);
    }
  });
}

function enforceTab(tab, changeInfo = null) {
  if (!tab || !tab.id) return;
  if (!activeSession || !activeSession.allowedUrls || activeSession.allowedUrls.length === 0) return;

  const currentUrl = (changeInfo && changeInfo.url) || tab.url || tab.pendingUrl;
  if (!currentUrl) return;

  if (!isUrlAllowed(currentUrl, activeSession)) {
    const targetUrl = activeSession.allowedUrls[0];
    if (targetUrl) {
      restoreTabToAssignedUrl(tab.id, targetUrl, `Unauthorized navigation to: ${currentUrl}`);
    }
  } else {
    // Adopt this tab as the current active task tab
    if (tab.active) {
      activeSession.taskTabId = tab.id;
      activeSession.taskWindowId = tab.windowId;
    }
  }
}

function enforceActiveTabs() {
  chrome.tabs.query({}, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach(t => enforceTab(t));
    }
  });
}

// --- 5. Chrome Tab Lifecycle Listeners ---

// 1. Controlled New-Tab Handling (Allows task tab, closes unauthorized extra tabs)
chrome.tabs.onCreated.addListener((newTab) => {
  if (!activeSession || !activeSession.allowedUrls || activeSession.allowedUrls.length === 0) return;

  setTimeout(() => {
    chrome.tabs.get(newTab.id, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      if (!activeSession) return;

      const targetUrl = tab.url || tab.pendingUrl || '';

      // If the newly created tab is loading an allowed task URL or auth/consent, allow it and register as taskTabId
      if (targetUrl && isUrlAllowed(targetUrl, activeSession)) {
        activeSession.taskTabId = tab.id;
        activeSession.taskWindowId = tab.windowId;
        chrome.storage.local.set({ activeSession });
        return;
      }

      // If it is an unwanted extra tab (e.g. user pressed Ctrl+T or new blank tab)
      chrome.tabs.query({}, (allTabs) => {
        if (allTabs.length > 1) {
          console.log(`[DayArc Ext] Closing unauthorized extra new tab: ${tab.id}`);
          chrome.tabs.remove(tab.id, () => {
            // Restore focus to task tab
            if (activeSession && activeSession.taskTabId) {
              chrome.tabs.update(activeSession.taskTabId, { active: true }).catch(() => {});
            }
          });
        }
      });
    });
  }, 350);
});

// 2. Navigation listener on existing tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo && (changeInfo.url || changeInfo.status === 'complete')) {
    enforceTab(tab, changeInfo);
  }
});

// 2B. Single Page Application (SPA) navigation listener (YouTube suggested video clicks & history changes)
if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details && details.frameId === 0 && details.tabId && details.url) {
      chrome.tabs.get(details.tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          enforceTab(tab, { url: details.url });
        }
      });
    }
  });
}

if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details && details.frameId === 0 && details.tabId && details.url) {
      chrome.tabs.get(details.tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          enforceTab(tab, { url: details.url });
        }
      });
    }
  });
}

// 3. Tab switch / activation listener
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) enforceTab(tab);
  });
});

// --- 5B. Chrome Window Lifecycle Listeners (Minimize, Focus Loss & Close Protection) ---

// 1. Detect Window Minimize or Bounds Change during active focus
if (chrome.windows && chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener((win) => {
    if (!activeSession || !win) return;
    if (win.state === 'minimized') {
      console.log(`[DayArc Ext] Minimize attempt detected on window ${win.id}. Restoring window immediately.`);
      chrome.windows.update(win.id, { state: 'normal', focused: true }).catch(() => {});
      if (activeSession.taskTabId) {
        chrome.tabs.update(activeSession.taskTabId, { active: true }).catch(() => {});
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'MINIMIZE_DETECTED', windowId: win.id }));
      }
    }
  });
}

// 2. Detect Focus Loss / Window Minimization to desktop
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (!activeSession || !activeSession.allowedUrls || activeSession.allowedUrls.length === 0) return;
    if (windowId === chrome.windows.WINDOW_ID_NONE && activeSession.taskWindowId) {
      setTimeout(() => {
        if (!activeSession) return;
        chrome.windows.get(activeSession.taskWindowId, (win) => {
          if (chrome.runtime.lastError || !win) return;
          if (win.state === 'minimized' || !win.focused) {
            console.log(`[DayArc Ext] Focus lost or window minimized. Restoring window ${win.id}.`);
            chrome.windows.update(win.id, { state: 'normal', focused: true }).catch(() => {});
            if (activeSession.taskTabId) {
              chrome.tabs.update(activeSession.taskTabId, { active: true }).catch(() => {});
            }
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'MINIMIZE_DETECTED', windowId: win.id }));
            }
          }
        });
      }, 150);
    }
  });
}

// 3. Detect Task Window Closure during active focus
if (chrome.windows && chrome.windows.onRemoved) {
  chrome.windows.onRemoved.addListener((windowId) => {
    if (!activeSession || !activeSession.allowedUrls || activeSession.allowedUrls.length === 0) return;
    if (activeSession.taskWindowId === windowId) {
      console.log(`[DayArc Ext] Task window ${windowId} closed during active focus. Recreating task window.`);
      chrome.windows.create({ url: activeSession.allowedUrls[0], focused: true, state: 'normal' }, (newWin) => {
        if (newWin) {
          activeSession.taskWindowId = newWin.id;
          if (newWin.tabs && newWin.tabs.length > 0) {
            activeSession.taskTabId = newWin.tabs[0].id;
          }
          chrome.storage.local.set({ activeSession });
        }
      });
    }
  });
}

// --- 6. Startup Clean State & Persistent Alarm Synchronization ---
activeSession = null;
chrome.storage.local.remove('activeSession');
chrome.storage.local.get(['privateBlocklist', 'blockAdultContent'], (res) => {
  if (res.privateBlocklist) privateBlocklist = res.privateBlocklist;
  if (res.blockAdultContent !== undefined) blockAdultContent = res.blockAdultContent;
  connectToDayArc();
});

// Setup persistent Manifest V3 chrome.alarms for background keepalive
try {
  chrome.alarms.create('dayarc_keepalive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dayarc_keepalive') {
      if (!isConnected) {
        connectToDayArc();
      } else if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING' }));
      }
    }
  });
} catch (e) {
  console.warn('[DayArc Ext] Alarms init warning:', e);
}

// Fallback interval heartbeat
setInterval(() => {
  if (!isConnected) {
    connectToDayArc();
  } else if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'PING' }));
  }
}, 5000);

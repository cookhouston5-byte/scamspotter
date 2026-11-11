// Right-click menu: "Check with ScamSpotter" for selected text and for links.
// Nothing is read or sent until the person chooses one of these menu items.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ss-text', title: 'Check this text with ScamSpotter', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'ss-link', title: 'Check this link with ScamSpotter', contexts: ['link'] });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  let pending = null;
  if(info.menuItemId === 'ss-text' && info.selectionText) pending = { text: info.selectionText.slice(0, 50000) };
  if(info.menuItemId === 'ss-link' && info.linkUrl) pending = { text: info.linkUrl + (info.selectionText ? '\n' + info.selectionText : ''), isLink: true };
  if(!pending) return;
  await chrome.storage.session.set({ pending: { ...pending, at: Date.now() } });
  // Open the toolbar popup to show the result; if Chrome won't allow that here, use a small window instead.
  try{ await chrome.action.openPopup(); }
  catch(e){ chrome.windows.create({ url: chrome.runtime.getURL('popup.html?window=1'), type: 'popup', width: 400, height: 620 }); }
});

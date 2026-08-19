// Content scripts can't be ES modules, so this stub pulls in the real
// entrypoint as one. The src/ files are listed in web_accessible_resources
// to make the import resolvable.
import(chrome.runtime.getURL("src/content.js")).catch((error) => {
  console.error("[pratique] failed to load", error);
});

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('asramaDesktop', {
  isElectron: true,
  platform: process.platform,
});

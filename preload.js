const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openGoogleLogin: () => ipcRenderer.send('open-google-login'),
  openGoogleLoginExternal: () => ipcRenderer.send('open-google-login-external'),
});

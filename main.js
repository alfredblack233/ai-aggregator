const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const path = require('path');

// 唯一的反检测开关
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Electron 28 = Chromium 120
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.291 Safari/537.36';

let mainWindow;
app.setLoginItemSettings({ openAtLogin: false });

// ========== 简易反检测（非 Google 的 webview 用）==========
const ANTI_DETECT_JS = `
  (() => {
    if (window.__ad) return; window.__ad = true;
    Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
    delete window.ElectronInterface;
    try{delete window.process}catch(e){}
    try{delete window.require}catch(e){}
    try{delete window.module}catch(e){}
    if(!window.chrome||!window.chrome.runtime){
      window.chrome={app:{isInstalled:false},
        runtime:{OnInstalledReason:{},PlatformOs:{},connect:()=>{},id:undefined,sendMessage:()=>{}},
        loadTimes:()=>({commitLoadTime:Date.now()/1000,connectionInfo:'http/1.1',finishLoadTime:Date.now()/1000}),
        csi:()=>({onloadT:Date.now(),pageT:performance.now(),startE:performance.timeOrigin,tran:15})};
    }
  })();
`;

// ========== Session 配置（只给非 Google 的 AI 用）==========
function setupSession(partitionName) {
  const ses = session.fromPartition(`persist:${partitionName}`);
  ses.setUserAgent(CHROME_UA);

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders;
    h['User-Agent'] = CHROME_UA;
    ['Sec-CH-UA','Sec-CH-UA-Mobile','Sec-CH-UA-Platform','Sec-CH-UA-Platform-Version',
     'Sec-CH-UA-Full-Version','Sec-CH-UA-Full-Version-List','Sec-CH-UA-Arch',
     'Sec-CH-UA-Bitness','Sec-CH-UA-Model','Sec-CH-UA-WoW64'
    ].forEach(k => delete h[k]);
    callback({ requestHeaders: h });
  });
}

// ========== 默认 session 配置（给 Gemini webview 和登录弹窗共用）==========
function setupDefaultSession() {
  const ses = session.defaultSession;
  ses.setUserAgent(CHROME_UA);
  // ✅ 不添加任何 webRequest 拦截器，保持完全干净
  // 只设置 UA，让 Chromium 自己管理所有请求头
}

// ========== Google 登录弹窗 ==========
let loginWin = null;

function openGoogleLoginPopup() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }

  loginWin = new BrowserWindow({
    width: 520, height: 720,
    parent: mainWindow,
    title: 'Google 登录 - Gemini',
    show: false,
    webPreferences: {
      // ✅ 使用默认 session（与 Gemini webview 相同！）
      // 所以登录 cookie 自动共享，无需同步
      contextIsolation: false,
      nodeIntegration: false,
      preload: path.join(__dirname, 'google-preload.js'),
    },
    autoHideMenuBar: true,
  });

  const loginURL = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com&hl=zh-CN';

  loginWin.webContents.once('did-finish-load', () => {
    if (loginWin && !loginWin.isDestroyed()) loginWin.show();
  });

  loginWin.webContents.once('did-fail-load', (ev, code, desc) => {
    console.error(`[Login] 加载失败: ${code} ${desc}`);
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.show();
      loginWin.webContents.loadURL(`data:text/html;charset=utf-8,
        <html><body style="font-family:system-ui;padding:40px;text-align:center">
          <h2>无法连接 Google</h2><p>错误: ${code}</p>
          <p>请检查 VPN/代理</p>
          <br><button onclick="location.href='${loginURL}'" style="padding:10px 20px;font-size:16px">重试</button>
        </body></html>`);
    }
  });

  setTimeout(() => {
    if (loginWin && !loginWin.isDestroyed() && !loginWin.isVisible()) loginWin.show();
  }, 3000);

  loginWin.webContents.on('did-navigate', (ev, url) => {
    console.log('[Login] 导航:', url);
    if (url.includes('gemini.google.com') && !url.includes('accounts.google.com')) {
      setTimeout(() => { if (loginWin && !loginWin.isDestroyed()) loginWin.close(); }, 1000);
    }
  });

  loginWin.on('closed', () => {
    loginWin = null;
    // ✅ 直接刷新 Gemini webview，cookie 已在同一个 session 中
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        `document.getElementById('wv-gemini').loadURL('https://gemini.google.com');`
      ).catch(() => {});
    }
  });

  loginWin.loadURL(loginURL);
}

// ========== 创建主窗口 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 900, minWidth: 800, minHeight: 600,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile('index.html');

  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      contents.on('dom-ready', () => {
        contents.executeJavaScript(ANTI_DETECT_JS).catch(() => {});
      });
      contents.setWindowOpenHandler(({ url }) => {
        if (url.includes('accounts.google.com') || url.includes('google.com/signin')) {
          openGoogleLoginPopup();
          return { action: 'deny' };
        }
        return { action: 'deny' };
      });
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ========== IPC ==========
ipcMain.on('open-google-login', () => openGoogleLoginPopup());
ipcMain.on('open-google-login-external', () => {
  shell.openExternal('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com');
});

// ========== 启动 ==========
app.whenReady().then(() => {
  // ✅ 只给非 Google 的 AI 设置带拦截器的 session
  ['doubao', 'deepseek', 'claude'].forEach(setupSession);
  // ✅ Gemini 用干净的默认 session
  setupDefaultSession();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

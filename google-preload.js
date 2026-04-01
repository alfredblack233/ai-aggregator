/**
 * google-preload.js
 * 在 Google 登录页面的 JS 执行之前运行
 * 使用 contextIsolation: false，所以可以直接修改页面的全局对象
 *
 * Google 登录页面的检测项（按重要性排序）：
 * 1. navigator.userAgentData（Chrome 90+ 必须有此 API）
 * 2. navigator.webdriver（自动化检测）
 * 3. navigator.plugins（空列表 = 机器人）
 * 4. chrome.runtime 对象
 * 5. WebGL 渲染器信息
 * 6. Notification / Permissions API
 * 7. Electron 全局变量（process, require 等）
 */

(() => {
  'use strict';

  // ===== 1. navigator.userAgentData（最关键！）=====
  // Electron 120 可能不暴露此 API 或暴露了带 Electron 品牌的信息
  // Google 会调用 getHighEntropyValues() 获取详细信息
  const brandsFull = [
    { brand: 'Not_A Brand', version: '8.0.0.0' },
    { brand: 'Chromium', version: '120.0.6099.291' },
    { brand: 'Google Chrome', version: '120.0.6099.291' }
  ];
  const brandsShort = [
    { brand: 'Not_A Brand', version: '8' },
    { brand: 'Chromium', version: '120' },
    { brand: 'Google Chrome', version: '120' }
  ];

  const userAgentDataObj = {
    brands: brandsShort,
    mobile: false,
    platform: 'Windows',
    getHighEntropyValues(hints) {
      const data = {
        brands: brandsShort,
        mobile: false,
        platform: 'Windows',
      };
      if (hints.includes('platformVersion')) data.platformVersion = '15.0.0';
      if (hints.includes('architecture')) data.architecture = 'x86';
      if (hints.includes('bitness')) data.bitness = '64';
      if (hints.includes('model')) data.model = '';
      if (hints.includes('uaFullVersion')) data.uaFullVersion = '120.0.6099.291';
      if (hints.includes('fullVersionList')) data.fullVersionList = brandsFull;
      if (hints.includes('wow64')) data.wow64 = false;
      return Promise.resolve(data);
    },
    toJSON() {
      return { brands: brandsShort, mobile: false, platform: 'Windows' };
    }
  };

  // 先尝试删除已有属性再定义
  try {
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      get: () => userAgentDataObj,
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    try {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => userAgentDataObj,
        configurable: true
      });
    } catch (e2) {}
  }

  // ===== 2. navigator.webdriver =====
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => undefined,
    configurable: true
  });

  // ===== 3. navigator.plugins =====
  const fakePluginNames = [
    'PDF Viewer',
    'Chrome PDF Viewer',
    'Chromium PDF Viewer',
    'Microsoft Edge PDF Viewer',
    'WebKit built-in PDF'
  ];

  const makeFakePluginArray = () => {
    const arr = fakePluginNames.map(name => {
      const plugin = {
        name,
        filename: name.toLowerCase().replace(/ /g, '-') + '.js',
        description: 'Portable Document Format',
        length: 1,
        [Symbol.toStringTag]: 'Plugin'
      };
      return plugin;
    });
    arr.item = (i) => arr[i] || null;
    arr.namedItem = (n) => arr.find(p => p.name === n) || null;
    arr.refresh = () => {};
    Object.defineProperty(arr, 'length', { get: () => fakePluginNames.length });
    return arr;
  };

  Object.defineProperty(Navigator.prototype, 'plugins', {
    get: makeFakePluginArray,
    configurable: true
  });

  // ===== 4. navigator.mimeTypes =====
  Object.defineProperty(Navigator.prototype, 'mimeTypes', {
    get: () => {
      const types = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null }
      ];
      types.item = i => types[i] || null;
      types.namedItem = n => types.find(t => t.type === n) || null;
      Object.defineProperty(types, 'length', { get: () => 2 });
      return types;
    },
    configurable: true
  });

  // ===== 5. navigator.vendor =====
  Object.defineProperty(Navigator.prototype, 'vendor', {
    get: () => 'Google Inc.',
    configurable: true
  });

  // ===== 6. navigator.languages / language =====
  Object.defineProperty(Navigator.prototype, 'languages', {
    get: () => Object.freeze(['zh-CN', 'zh', 'en-US', 'en']),
    configurable: true
  });
  Object.defineProperty(Navigator.prototype, 'language', {
    get: () => 'zh-CN',
    configurable: true
  });

  // ===== 7. navigator.hardwareConcurrency / deviceMemory =====
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
    get: () => 8, configurable: true
  });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', {
    get: () => 8, configurable: true
  });

  // ===== 8. navigator.connection =====
  if (navigator.connection) {
    try {
      Object.defineProperty(navigator.connection, 'rtt', { get: () => 50, configurable: true });
      Object.defineProperty(navigator.connection, 'downlink', { get: () => 10, configurable: true });
      Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g', configurable: true });
    } catch (e) {}
  }

  // ===== 9. 清除 Electron 全局变量 =====
  const electronGlobals = ['ElectronInterface', 'process', 'require', 'module', 'exports', '__dirname', '__filename'];
  electronGlobals.forEach(g => {
    try { delete window[g]; } catch (e) {}
    try { Object.defineProperty(window, g, { get: () => undefined, configurable: true }); } catch (e) {}
  });

  // ===== 10. chrome 对象（完整版）=====
  const fakeChrome = {
    app: {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: function() { return null; },
      getIsInstalled: function() { return false; },
      runningState: function() { return 'cannot_run'; },
    },
    runtime: {
      OnInstalledReason: {
        CHROME_UPDATE: 'chrome_update',
        INSTALL: 'install',
        SHARED_MODULE_UPDATE: 'shared_module_update',
        UPDATE: 'update'
      },
      OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
      PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformOs: { ANDROID: 'android', CROS: 'cros', FUCHSIA: 'fuchsia', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
      RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
      connect: function() { throw new TypeError("Error in invocation of runtime.connect(optional string extensionId, optional object connectInfo): chrome.runtime.connect() called from a webpage must specify an Extension ID (string) for its first argument."); },
      sendMessage: function() { throw new TypeError("Error in invocation of runtime.sendMessage(optional string extensionId, any message, optional object options, optional function callback): chrome.runtime.sendMessage() called from a webpage must specify an Extension ID (string) for its first argument."); },
      id: undefined,
    },
    loadTimes: function() {
      return {
        commitLoadTime: Date.now() / 1000 - 1.5,
        connectionInfo: 'http/1.1',
        finishDocumentLoadTime: Date.now() / 1000 - 0.5,
        finishLoadTime: Date.now() / 1000 - 0.3,
        firstPaintAfterLoadTime: 0,
        firstPaintTime: Date.now() / 1000 - 0.8,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'unknown',
        requestTime: Date.now() / 1000 - 2.0,
        startLoadTime: Date.now() / 1000 - 1.8,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
      };
    },
    csi: function() {
      return {
        onloadT: Date.now(),
        pageT: performance.now(),
        startE: performance.timeOrigin || Date.now() - performance.now(),
        tran: 15,
      };
    },
  };

  // 使 chrome.runtime.connect / sendMessage 抛出的错误与真 Chrome 一致
  // Google 的检测脚本会 try-catch 调用这些函数并检查错误消息
  window.chrome = fakeChrome;

  // ===== 11. Permissions API 修复 =====
  if (navigator.permissions) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) => {
      if (params && params.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return origQuery(params).catch(() =>
        Promise.resolve({ state: 'prompt', onchange: null })
      );
    };
  }

  // ===== 12. WebGL 渲染器信息 =====
  const getParamProto = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Google Inc. (Intel)';
    if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    return getParamProto.call(this, param);
  };

  // WebGL2
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const getParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Google Inc. (Intel)';
      if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return getParam2.call(this, param);
    };
  }

  // ===== 13. 保护 toString 不暴露 native code 被修改 =====
  const nativeToString = Function.prototype.toString;
  const proxyHandler = {
    apply: function(target, thisArg, args) {
      // 对我们修改过的函数返回正常的 [native code]
      if (thisArg === navigator.permissions.query) {
        return 'function query() { [native code] }';
      }
      if (thisArg === WebGLRenderingContext.prototype.getParameter) {
        return 'function getParameter() { [native code] }';
      }
      return nativeToString.apply(thisArg, args);
    }
  };

  try {
    Function.prototype.toString = new Proxy(nativeToString, proxyHandler);
  } catch (e) {}

  // ===== 14. 自动化测试框架检测 =====
  // 删除 Selenium/Puppeteer/Playwright 留下的痕迹
  const automationProps = [
    '__webdriver_evaluate', '__selenium_evaluate', '__fxdriver_evaluate',
    '__driver_evaluate', '__webdriver_unwrap', '__selenium_unwrap',
    '__fxdriver_unwrap', '__driver_unwrap', '_Selenium_IDE_Recorder',
    '_selenium', 'calledSelenium', '_WEBDRIVER_ELEM_CACHE',
    'ChromeDriverw', 'driver-evaluate', 'webdriver-evaluate',
    'selenium-evaluate', 'webdriverCommand', 'webdriver-evaluate-response',
    '__webdriverFunc', '__webdriver_script_fn', '__$webdriverAsyncExecutor',
    '__lastWatirAlert', '__lastWatirConfirm', '__lastWatirPrompt',
    '_phantom', '__nightmare', '_phantomas', 'callPhantom',
    '__phantomas', 'Buffer', 'emit', 'spawn', 'domAutomation',
    'domAutomationController', '_Selenium_IDE_Recorder',
  ];
  automationProps.forEach(prop => {
    try { delete window[prop]; } catch (e) {}
    try { delete document[prop]; } catch (e) {}
  });

  // ===== 15. iframe contentWindow 检测 =====
  // Google 有时创建隐藏 iframe 来检测
  const originalCreateElement = document.createElement.bind(document);
  // 不拦截 createElement，避免被检测到修改

  console.log('[Anti-Detect] Google login preload applied');
})();

import { app } from 'electron';

function defaultSetting() {
  return {
    saveTo: app.getPath('downloads'),

    overwriteMode: 'skip',

    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3964.0 Safari/537.36',

    enableProxy: false,

    proxyService: '',

    proxyServicePort: '',

    enableProxyAuth: false,

    proxyUsername: '',

    proxyPassword: '',

    closeToTray: false,

    showNotification: true,

    locale: 'en',

    ffmpegPath: ''
  }
}

export default defaultSetting();

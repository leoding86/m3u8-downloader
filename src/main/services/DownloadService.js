import path from 'path';
import fs from 'fs-extra';
import {
  app,
  ipcMain
} from 'electron';
import {
  debug
} from '@/global';
import WindowManager from '@/modules/WindowManager';
import DownloadManager from '@/modules/Download/DownloadManager';
import DownloadCacheManager from '@/modules/Download/DownloadCacheManager';
import NotificationManager from '@/modules/NotificationManager';
import BaseService from '@/services/BaseService';
import M3U8DownloadTask from '@/modules/Download/M3U8DownloadTask';

class DownloadService extends BaseService {
  /**
   * @property
   * @type {DownloadManager}
   */
  static instance;

  /**
   * @property
   * @type {string}
   */
  static channel = 'download-service';

  constructor() {
    super();

    this.mainWindow = WindowManager.getWindow('app');

    this.downloadManager = DownloadManager.getDefault();

    this.notificationManager = NotificationManager.getDefault();

    /**
     * @type {DownloadCacheManager}
     */
    this.downloadCacheManager = DownloadCacheManager.getManager({
      cacheFile: path.join(app.getPath('userData'), 'cached_downloads.json')
    });

    /**
     * Listen DownloadManager add event
     */
    this.downloadManager.on('add', downloadTask => {
      this.downloadCacheManager.cacheDownload(downloadTask);

      this.notificationManager.showDownloadAddedNotification({
        title: `Download ${downloadTask.id} is added`
      });

      this.mainWindow.webContents.send(this.responseChannel('add'), downloadTask.toJSON());
    });

    /**
     * Listen DownloadManager add-batch event
     */
    this.downloadManager.on('add-batch', downloadTasks => {
      let data = [];

      downloadTasks.forEach(downloadTask => {
        data.push(downloadTask.toJSON());
      });

      this.downloadCacheManager.cacheDownloads(downloadTasks);

      this.mainWindow.webContents.send(this.responseChannel('add-batch'), data);
    });

    /**
     * Listen DownloadManager delete-batch event
     */
    this.downloadManager.on('delete-batch', ids => {
      this.downloadCacheManager.removeDownloads(ids);//

      this.mainWindow.webContents.send(this.responseChannel('delete-batch'), ids);
    });

    /**
     * Listen DownloadManager stop event
     */
    this.downloadManager.on('stop', downloadTask => {
      this.mainWindow.webContents.send(this.responseChannel('stop'), downloadTask.id);
    });

    /**
     * Listen DownloadManager stop-batch event
     */
    this.downloadManager.on('stop-batch', ids => {
      this.mainWindow.webContents.send(this.responseChannel('stop-batch'), ids);
    });

    /**
     * Listen DownloadManager update event
     */
    this.downloadManager.on('update', downloadTask => {
      if (this.downloadManager.getDownloadTask(downloadTask.id)) {
        this.mainWindow.webContents.send(this.responseChannel('update'), downloadTask.toJSON());
      }
    });

    /**
     * Listen DownloadManager finish event
     */
    this.downloadManager.on('finish', downloadTask => {
      this.downloadCacheManager.removeDownload(downloadTask.id);
    });

    /**
     * Listen DownloadManager delete event
     */
    this.downloadManager.on('delete', id => {
      this.downloadCacheManager.removeDownload(id);

      this.mainWindow.webContents.send(this.responseChannel('delete'), id);
    });

    ipcMain.on(DownloadService.channel, this.channelIncomeHandler.bind(this));

    this.restoreDownloads();
  }

  /**
   * @returns {DownloadService}
   */
  static getService() {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService();
    }

    return DownloadService.instance;
  }

  /**
   * Get renderer response channel
   * @param {string} name
   */
  responseChannel(name) {
    return DownloadService.channel + `:${name}`;
  }

  restoreDownloads() {
    return;

    const cachedDownloads = this.downloadCacheManager.getCachedDownloads();
    let downloaders = [];

    debug.sendStatus('Restoring downloads');

    for (let downloadId in cachedDownloads) {
      console.log(cachedDownloads[downloadId], downloadId);
      downloaders.push(UndeterminedDownloader.createDownloader({
        workId: downloadId,
        options: cachedDownloads[downloadId].options
      }));
    }

    debug.sendStatus('Downloads have been restored');

    /**
     * do not start downloads automatically after downloads are restored
     */
    this.downloadManager.addDownloaders(downloaders, {
      mute: true,
      autoStart: false
    });
  }

  fetchAllDownloadsAction() {
    debug.sendStatus('Fetching all downloads');

    let downloadTasksInfo = [];

    this.downloadManager.getAllDownloadTasks().forEach(downloadTask => {
      downloadTasksInfo.push(downloadTask.toJSON());
    });

    WindowManager.getWindow('app').webContents.send(this.responseChannel('downloads'), downloadTasksInfo);

    debug.sendStatus('All downloads are fetched');
  }

  createDownloadAction({url, saveTo}) {
    debug.sendStatus('Try to create download');

    try {
      fs.ensureDirSync(saveTo);
    } catch (error) {
      WindowManager.getWindow('app').webContents.send(this.responseChannel('error'), `Cannot save files to path ${saveTo}`);

      debug.sendStatus('Cannot create save path');

      return;
    }

    let downloadTask = M3U8DownloadTask.create({
      url,
      options: {
        saveTo
      }
    });

    /**
     * Check if is there same download in DownloadManager, if so, send a error message to renderer
     */
    if (this.downloadManager.getDownloadTask({
      id: downloadTask.id
    })) {
      debug.sendStatus('Duplicated download');

      WindowManager.getWindow('app').webContents.send(this.responseChannel('duplicated'), url);

      return;
    }

    this.downloadManager.addDownloadTask(downloadTask);

    debug.sendStatus('Download created');
  }

  deleteDownloadAction({downloadId}) {
    debug.sendStatus('Delete download');

    this.downloadManager.deleteDownloadTask({
      id: downloadId
    });
  }

  stopDownloadAction({downloadId}) {
    debug.sendStatus('Stop download');

    this.downloadManager.stopDownloadTask({
      id: downloadId
    });
  }

  startDownloadAction({downloadId}) {
    debug.sendStatus('Start download');

    if (!downloadId) {
      this.downloadManager.downloadNext();
    } else {
      this.downloadManager.startDownloadTask({
        id: downloadId
      });
    }
  }

  redownloadAction({downloadId}) {
    debug.sendStatus('Re-download')

    this.downloadManager.startDownloadTask({
      id: downloadId,
      reset: true
    });
  }

  batchStartDownloadsAction({downloadIds}) {
    debug.sendStatus('Batch start downloads');

    downloadIds.forEach(downloadId => {
      this.downloadManager.startDownloadTask({
        id: downloadId
      })
    });
  }

  batchStopDownloadsAction({downloadIds}) {
    debug.sendStatus('Batch stop downloads');

    this.downloadManager.stopDownloadTasks({
      ids: downloadIds
    });
  }

  batchDeleteDownloadsAction({downloadIds}) {
    debug.sendStatus('Batch delete downloads');

    this.downloadManager.deleteDownloadTasks({
      ids: downloadIds
    });
  }

  openFolderAction({downloadId}) {
    debug.sendStatus('Open download folder')

    this.downloadManager.openFolder({
      id: downloadId
    });
  }
}

export default DownloadService;

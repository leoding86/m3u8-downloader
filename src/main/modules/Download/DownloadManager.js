import EventEmitter from 'events';
import { shell } from 'electron';
import {
  debug
} from '@/global';
import DownloadTask from '@/modules/Download/DownloadTask';

/**
 * @class
 */
class DownloadManager extends EventEmitter {
  constructor() {
    super();

    /**
     * @property
     * @type {Map<number|string, DownloadTask>}
     */
    this.downloadTaskPool = new Map();

    /**
     * @property
     * @type {Map<number|string, DownloadTask>}
     */
    this.attachedListenersDownloaders = new Map();

    this.maxDownloading = 2;
  }

  static instance = null;

  /**
   * @returns {DownloadManager}
   */
  static getManager() {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }

    return DownloadManager.instance;
  }

  /**
   * @returns {DownloadManager}
   */
  static getDefault() {
    return DownloadManager.getManager();
  }

  /**
   * @param {number|string} id DownloadTask's id
   * @returns {DownloadTask}
   */
  static getDownloadTask(id) {
    return DownloadManager.instance.getDownloadTask(id);
  }

  /**
   * @param {DownloadTask} downloadTask
   * @returns {this}
   */
  addDownloadTask(downloadTask) {
    if (!this.getDownloadTask(downloadTask.id)) {
      this.downloadTaskPool.set(downloadTask.id, downloadTask);

      this.emit('add', downloadTask);

      this.startDownloadTask({id: downloadTask.id});
    }

    return this;
  }

  /**
   * Add multiple download tasks to download manager
   * @param {Array.<DownloadTask>} downloadTasks
   * @param {Object} [options]
   * @param {Boolean} [options.mute=false]
   * @param {Boolean} [options.autoStart=true]
   * @returns {void}
   */
  addDownloadTasks(downloadTasks, options) {
    const { mute, autoStart } = Object.assign({mute: false, autoStart: true}, options);

    let addedDownloadTasks = [];

    downloadTasks.forEach(downloadTask => {
      if (!this.getDownloadTask(downloadTask.id)) {
        this.downloadTaskPool.set(downloadTask.id, downloadTask);

        addedDownloadTasks.push(downloadTask);

        this.attachListenersToDownloader(downloadTask);
      }
    });

    if (!mute) this.emit('add-batch', addedDownloadTasks);

    if (autoStart) {
      this.downloadNext();
    }
  }

  reachMaxDownloading() {
    let downloadingCount = 0;

    this.downloadTaskPool.forEach(downloadTask => {
      if (downloadTask.isDownloading() || downloadTask.isProcessing()) {
        downloadingCount++;
      }
    });

    return downloadingCount >= this.maxDownloading;
  }

  /**
   * Find next downloadTask and start download.
   * @returns {void}
   */
  downloadNext() {
    if (this.downloadTaskPool.size < 1) {
      return;
    }

    let nextDownloadTask;

    this.downloadTaskPool.forEach(downloadTask => {
      if (!nextDownloadTask && downloadTask.isPending()) {
        nextDownloadTask = downloadTask;
      }
    });

    if (nextDownloadTask) {
      this.startDownloadTask({
        id: nextDownloadTask.id
      });

      if (!this.reachMaxDownloading()) {
        this.downloadNext();
      }
    }
  }

  /**
   * @param {Object} args
   * @param {DownloadTask} args.downloadTask
   */
  downloadTaskStartHandler({ downloadTask }) {
    this.emit('update', downloadTask);
  }

  /**
   * @param {Object} args
   * @param {DownloadTask} args.downloadTask
   */
  downloadTaskStopHandler({ downloadTask }) {
    /**
     * Make sure the downloadTask is exists then fire the update event
     * Because this listener can be called by a delete operation
     */
    if (this.downloadTaskPool.has(downloadTask.id)) {
      this.emit('stop', downloadTask);
    }

    this.deattachListenersFromDownloader(downloadTask);
  }

  /**
   * @param {Object} args
   * @param {DownloadTask} args.downloadTask
   */
  downloadTaskProgressHandler({ downloadTask }) {
    if (this.getDownloadTask(downloadTask.id)) {
      this.emit('update', downloadTask);
    }
  }

  /**
   * @param {Object} args
   * @param {DownloadTask} args.downloadTask
   */
  downloadTaskErrorHandler({ downloadTask }) {
    this.emit('update', downloadTask);

    this.deattachListenersFromDownloader(downloadTask);

    this.downloadNext();
  }

  /**
   * @param {Object} args
   * @param {DownloadTask} args.downloadTask
   */
  downloadTaskFinishHandler({ downloadTask }) {
    this.emit('update', downloadTask);

    this.emit('finish', downloadTask);

    this.deattachListenersFromDownloader(downloadTask);

    this.downloadNext();
  }

  /**
   * @param {DownloadTask} downloadTask
   */
  attachListenersToDownloader(downloadTask) {
    /**
     * Prevent listeners attach to downloadTask multiple times
     */
    if (this.attachedListenersDownloaders.has(downloadTask.id)) {
      return;
    }

    downloadTask.on('start', this.downloadTaskStartHandler.bind(this));
    downloadTask.on('stop', this.downloadTaskStopHandler.bind(this));
    downloadTask.on('progress', this.downloadTaskProgressHandler.bind(this));
    downloadTask.on('error', this.downloadTaskErrorHandler.bind(this));
    downloadTask.on('finish', this.downloadTaskFinishHandler.bind(this));
  }

  /**
   * @param {DownloadTask} downloadTask
   */
  deattachListenersFromDownloader(downloadTask) {
    downloadTask.removeAllListeners('start');
    downloadTask.removeAllListeners('stop');
    downloadTask.removeAllListeners('progress');
    downloadTask.removeAllListeners('error');
    downloadTask.removeAllListeners('finish');

    /**
     * Remove downloadTask from the attachedListenersDownloaders to make sure the listeners can
     * attache to the downloadTask again
     */
    this.attachedListenersDownloaders.delete(downloadTask.id);
  }

  /**
   * Get all downloadTask
   */
  getAllDownloadTasks() {
    return this.downloadTaskPool;
  }

  canStartDownload(download) {
    return ['finish', 'stopping', 'downloading', 'processing'].indexOf(download.state) < 0;
  }

  canStopDownload(download) {
    return ['pending', 'downloading'].indexOf(download.state) > -1;
  }

  canDeleteDownload(download) {
    return ['stopping', 'processing'].indexOf(download.state) < 0;
  }

  /**
   * @param {Object} param
   * @param {number|string} param.id DownloadTask's id
   * @param {boolean} param.reset
   */
  startDownloadTask({id, reset}) {
    let downloadTask = this.getDownloadTask(id);

    if (downloadTask && this.canStartDownload(downloadTask)) {

      if (reset) {
        downloadTask.reset();
      }

      this.attachListenersToDownloader(downloadTask);

      if (!this.reachMaxDownloading()) {
        downloadTask.start();
      } else {
        downloadTask.setPending();
      }

      this.emit('update', downloadTask);
    }
  }

  /**
   * Once stop a download, try to start next avaliable download
   * @param {Object} param
   * @param {number|string} param.id DownloadTask's id
   */
  stopDownloadTask({id}) {
    let downloadTask = this.getDownloadTask(id);

    if (downloadTask && this.canStopDownload(downloadTask)) {
      downloadTask.stop();
    }

    this.downloadNext();
  }

  /**
   * @param {Object} param
   * @param {number|string} param.id DownloadTask's id
   */
  deleteDownloadTask({id}) {
    let downloadTask = this.getDownloadTask(id);

    if (downloadTask && this.canDeleteDownload(downloadTask)) {
      this.downloadTaskPool.delete(id);

      downloadTask.willRecycle();

      downloadTask.stop();

      downloadTask = null;
    }

    this.emit('delete', id);
  }

  /**
   * @param {Object} param
   * @param {Array} param.ids DownloadTasks' id
   */
  deleteDownloadTasks({ids}) {
    let deletedIds = [];

    ids.forEach(id => {
      let downloadTask = this.getDownloadTask(id);

      if (downloadTask && this.canDeleteDownload(downloadTask)) {
        this.downloadTaskPool.delete(id);

        deletedIds.push(downloadTask.id);

        downloadTask.willRecycle();

        downloadTask.stop({
          mute: true
        });

        downloadTask = null;
      }
    });

    this.emit('delete-batch', deletedIds);
  }

  /**
   * Once stop downloads, try to start next avaliable download
   * @param {Object} param
   * @param {Array} param.ids DownloadTasks' id
   */
  stopDownloadTasks({ids}) {
    let stoppedDownloadTaskIds = [];

    ids.forEach(id => {
      let downloadTask = this.getDownloadTask(id);

      if (downloadTask && this.canStopDownload(downloadTask)) {
        downloadTask.stop({
          mute: true
        });

        this.deattachListenersFromDownloader(downloadTask);

        stoppedDownloadTaskIds.push(downloadTask.id);
      }
    });

    this.emit('stop-batch', stoppedDownloadTaskIds);

    this.downloadNext();
  }

  /**
   * @param {Object} param
   * @param {number|string} param.id DownloadTask's id
   */
  openFolder({id}) {
    let downloadTask = this.getDownloadTask(id);

    if (downloadTask) {
      shell.showItemInFolder(downloadTask.savedTarget);
    }
  }

  /**
   * @param {number|string} id
   * @returns {DownloadTask}
   */
  getDownloadTask(id) {
    if (this.downloadTaskPool.has(id)) {
      return this.downloadTaskPool.get(id);
    }

    return null;
  }
}

export default DownloadManager;

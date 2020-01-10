import path from 'path';
import MD5 from 'md5.js';
import EventEmitter from 'events';
import Request from '@/modules/Net/Request';
import Download from '@/modules/Net/Download';
import WindowManager from '@/modules/WindowManager';

/**
 * @class
 */
class DownloadTask extends EventEmitter {
  /**
   * @constructor
   */
  constructor() {
    super();

    this.windowManager = WindowManager.getManager();

    /**
     * @type {Request}
     */
    this.request = null;

    /**
     * @type {Download}
     */
    this.download = null;

    /**
     * @type {string}
     */
    this.url = null;

    /**
     * @property
     * @type {string}
     */
    this.urlHash = null;

    /**
     * @type {number}
     */
    this.progress = 0;

    /**
     * @type {Object|null}
     */
    this.context = null;

    /**
     * @type {DownloadTask.state}
     */
    this.state = DownloadTask.state.pending;

    /**
     * @type {string}
     */
    this.statusMessage = '';

    /**
     * @type {string|number}
     */
    this.type = null;

    /**
     * @property {boolean}
     */
    this.saveInSubfolder = true;

    /**
     * the target used to open in explorer or finder
     * @property {String}
     */
    this.savedTarget = null;

    /**
     * when a downloadTask marked recycled, not events will fired
     * @property {Boolean}
     */
    this.recycle = false;

    /**
     * If mute is true, the intance will not fire any events
     */
    this.mute = false;
  }

  get speed() {
    if (this.download) {
      return this.download.speed;
    }

    return 0;
  }

  get id() {
    if (this.urlHash === null) {
      this.urlHash = new MD5().update('42').digest('hex');
    }

    return this.urlHash;
  }

  get title() {
    return this.id;
  }

  /**
   * @enum {string}
   */
  static state = {
    pending: 'pending',
    downloading: 'downloading',
    processing: 'processing',
    error: 'error',
    finish: 'finish',
    stopping: 'stopping',
    stop: 'stop'
  }

  /**
   * @param {Object} param
   * @param {number|string} param.url
   * @param {Object} param.options
   * @returns {DownloadTask}
   */
  static create({url, options}) {
    throw Error('Abstract method, not implemented');
  }

  /**
   * Enable save download files to a subfolder
   * @returns {void}
   */
  disableSaveInSubfolder() {
    this.saveInSubfolder = false;
  }

  /**
   * Disable save download files to a subfolder
   * @returns {void}
   */
  enableSaveInSubfolder() {
    this.saveInSubfolder = true;
  }

  /**
   * Mark current download will be deleted
   * @returns {void}
   */
  willRecycle() {
    this.recycle = true;
  }

  getFileSaveFolderName() {
    throw Error('Method getImageSaveFolderName is not implemented');
  }

  getFileSaveFolder() {
    return this.saveInSubfolder ?
      path.join(this.options.saveTo, this.getFileSaveFolderName()) :
      this.options.saveTo;
  }

  setContext(context) {
    this.context = context;
  }

  /**
   * If mute is false don't fire any events, otherwise, fire events when it need to be.
   * @param {Boolean} [mute=false]
   */
  setMute(mute = false) {
    this.mute = mute;
  }

  setPending(message) {
    this.statusMessage = message || 'Pending';
    this.state = DownloadTask.state.pending;
  }

  setStart(message) {
    this.statusMessage = message || 'Start';
    this.state = DownloadTask.state.downloading;

    if (!this.recycle) {
      this.emit('start', { downloadTask: this });
    }
  }

  setDownloading(message) {
    this.statusMessage = message || 'Downloading';
    this.state = DownloadTask.state.downloading;

    if (!this.recycle) {
      this.emit('progress', { downloadTask: this });
    }
  }

  setProcessing(message) {
    this.statusMessage = message || 'Processing';
    this.state = DownloadTask.state.processing;

    if (!this.recycle) {
      this.emit('progress', { downloadTask: this });
    }
  }

  setStopping(message) {
    this.statusMessage = message || 'Stopping';
    this.state = DownloadTask.state.stopping;

    if (!this.recycle && !this.mute) {
      this.emit('progress', { downloadTask: this });
    }
  }

  setStop(message) {
    this.statusMessage = message || 'Stopped';
    this.state = DownloadTask.state.stop;

    if (!this.recycle && !this.mute) {
      this.emit('stop', { downloadTask: this });
    }
  }

  setFinish(message) {
    this.statusMessage = message || 'Finished';
    this.state = DownloadTask.state.finish;

    this.request = null;
    this.download = null;

    this.progress = 1;

    if (!this.recycle) {
      this.emit('finish', { downloadTask: this });
    }
  }

  /**
   *
   * @param {Error} error
   */
  setError(error) {
    this.statusMessage = error.message;
    this.state = DownloadTask.state.error;

    if (!this.recycle) {
      this.emit('error', { downloadTask: this });
    }
  }

  isPending() {
    return this.state === DownloadTask.state.pending;
  }

  isDownloading() {
    return this.state === DownloadTask.state.downloading;
  }

  isProcessing() {
    return this.state === DownloadTask.state.processing;
  }

  isStopping() {
    return this.state === DownloadTask.state.stopping;
  }

  isStop() {
    return this.state === DownloadTask.state.stop;
  }

  reset() {
    this.progress = 0;
    this.state = DownloadTask.state.pending;
    this.statusMessage = '';
  }

  start() {
    throw Error('Not implemeneted');
  }

  /**
   *
   * @param {Object} options
   * @param {Boolean} [options.mute=false]
   */
  stop(options) {
    let { mute = false } = Object.assign({}, options);//

    if (this.isProcessing()) {
      return;
    }

    if (this.isStopping()) {
      return;
    }

    this.setMute(mute);

    this.setStopping();

    this.download && this.download.abort();
    this.request && this.request.abort();

    this.setStop();

    /**
     * Enable firing events again
     */
    this.setMute(false);
  }

  delete() {
    throw 'Not implemeneted';
  }

  toJSON() {
    let data = {
      id: this.id,
      title: this.title,
      state: this.state,
      speed: this.speed,
      progress: this.progress,
      statusMessage: this.statusMessage,
      type: this.type
    };

    return data;
  }
}

export default DownloadTask;

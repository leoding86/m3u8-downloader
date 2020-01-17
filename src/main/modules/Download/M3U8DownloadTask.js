import path from 'path';
import { exec } from 'child_process';
import fs from 'fs-extra';
import MD5 from 'md5.js';
import FormatName from '@/modules/Utils/FormatName';
import M3U8FileParser from 'm3u8-file-parser';
import DownloadTask from './DownloadTask';
import Request from '@/modules/Net/Request';
import Download from '@/modules/Net/Download';

class M3U8DownloadTask extends DownloadTask {
  constructor () {
    super();

    this.type = 'M3U8';

    this.m3u8 = null;

    this.tempFile = null;

    this.tempFileWriteStream = null;
  }

  get id() {
    if (this._id === null) {
      if (this.url) {
        this._id = new MD5().update(this.url).digest('hex');
      } else if (this.m3u8) {
        this._id = new MD5().update(this.m3u8).digest('hex');
      } else {
        throw Error('Cannot generate download id, both the url and m3u8 of the download task are null');
      }
    } else {
      return this._id;
    }

    return this._id;
  }

  get saveName() {
    if (this.options.saveName) {
      return this.options.saveName;
    } else {
      return this.id;
    }
  }

  /**
   * Create a M3U8 download task
   * @param {Object} options
   * @param {String} options.url
   * @param {Object} options.options
   * @returns {M3U8DownloadTask}
   */
  static create({url, options}) {
    let downloadTask = new M3U8DownloadTask();

    downloadTask.url = url;
    downloadTask.options = Object.assign({}, options);

    if (downloadTask.options.saveName) {
      downloadTask.options.saveName = FormatName.replaceIllegalChars(downloadTask.options.saveName);
    }

    return downloadTask;
  }

  /**
   * Create a M3U8 download task from M3U8 content
   * @param {Object.{m3u8: String, options.{Object}}} options
   */
  static createFromM3U8({m3u8, options}) {
    let downloadTask = new M3U8DownloadTask();

    downloadTask.m3u8 = m3u8;
    downloadTask.options = Object.assign({}, options);

    if (downloadTask.options.saveName) {
      downloadTask.options.saveName = FormatName.replaceIllegalChars(downloadTask.options.saveName);
    }

    return downloadTask;
  }

  getSegmentsFromUrl(url) {
    return new Promise((resolve, reject) => {
      this.request = new Request({
        url: url,
        method: 'GET'
      });

      this.request.on('error', error => {
        reject(error);
      });

      this.request.on('response', response => {
        let body = '';

        response.on('error', error => {
          reject(error);
        });

        response.on('data', data => {
          body += data;
        });

        response.on('end', () => {
          let content = body.toString();

          let reader = new M3U8FileParser();
          reader.read(content);

          const result = reader.getResult();

          if (!result) {
            reject(Error('Cannot resolve M3U8'));
            return;
          }

          resolve(result.segments);
        });

        response.on('aborted', () => {
          reject(Error('Resolve M3U8 has been aborted'));
        });
      });

      this.request.on('close', () => {
        this.request = null;
      });

      this.request.end();
    });
  }

  getSegmentsFromM3U8(m3u8) {
    let reader = new M3U8FileParser();
    reader.read(m3u8);

    const result = reader.getResult();

    if (!result) {
      return Promise.reject(Error('Cannot resolve M3U8'));
    }

    return Promise.resolve(result.segments);
  }

  getBaseUrl(url) {
    if (!url) {
      return;
    }

    let matches = url.match(/^https?:\/{2}[^?]+/);

    if (!matches) {
      return;
    }

    let baseUrl = null;

    if (matches[0][matches[0].length - 1] === '/') {
      baseUrl = matches[0];
    } else {
      baseUrl = matches[0].substring(0, matches[0].lastIndexOf('/')) + '/';
    }

    return baseUrl;
  }

  downloadSegments(segments, index = 0) {
    return new Promise((resolve, reject) => {
      let downloadOptions = Object.assign(
        {},
        this.options,
        {
          url: segments[index].url
        }
      );

      this.download = new Download(downloadOptions);

      this.download.on('dl-response-data', data => {
        if (!this.tempFile) {
          this.tempFile = path.join(this.options.saveTo, this.saveName)
          this.tempFileWriteStream =  fs.createWriteStream(this.tempFile);
        }

        this.tempFileWriteStream.write(data);
      });

      this.download.on('dl-finish', ({ file }) => {
        // delete chunk file, because data has been stored when download event dl-response-data fired
        fs.unlink(file);

        this.progress = index / segments.length;

        this.setDownloading();

        if (index >= segments.length - 1) {
          this.tempFileWriteStream.on('close', () => {
            this.savedTarget = this.tempFile + '.mp4';

            const command = `ffmpeg -y -i "${this.tempFile.replace(/\\/g, "\\\\")}" -acodec copy -vcodec copy "${this.savedTarget.replace(/\\/g, "\\\\")}"`;

            exec(command, (error, stdout, stderr) => {
              fs.unlink(this.tempFile);

              this.setFinish();
            });
          });

          /**
           * Close file stream
           */
          this.tempFileWriteStream.close();

          this.download = null;
          return;
        }

        return resolve(this.downloadSegments(segments, ++index));
      });

      this.download.on('dl-progress', () => {
        this.setDownloading(`downloading ${index} / ${segments.length}`);
      });

      this.download.on('dl-error', error => {
        this.download = null;

        this.setError(error);
      });

      this.download.on('dl-aborted', () => {
        this.download = null;

        this.setStop();
      });

      this.download.download();
    });
  }

  getSegments() {
    if (this.m3u8) {
      return this.getSegmentsFromM3U8.call(this, this.m3u8);
    }

    if (this.url) {
      return this.getSegmentsFromUrl.call(this, this.url);
    }
  }

  start() {
    this.setStart('Start');

    this.getSegments().then(segments => {
      let baseUrl = this.getBaseUrl(this.url);

      segments.map(segument => {
        if (baseUrl && !/^http/.test(segument.url)) {
          segument.url = baseUrl + segument.url;
        }

        return segument;
      });

      return this.downloadSegments(segments);
    }).then(file => {

    }).catch(error => {
      this.setError(error);
    });
  }
}

export default M3U8DownloadTask;

import path from 'path';
import { exec } from 'child_process';
import fs from 'fs-extra';
import M3U8FileParser from 'm3u8-file-parser';
import DownloadTask from './DownloadTask';
import Request from '@/modules/Net/Request';
import Download from '@/modules/Net/Download';

class M3U8DownloadTask extends DownloadTask {
  constructor () {
    super();

    this.type = 'M3U8';

    this.tempFile = null;

    this.tempFileWriteStream = null;
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

    return downloadTask;
  }

  getSegments(url) {
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

  getBaseUrl(url) {
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

  start() {
    this.setStart('Parse M3U8 content');

    this.getSegments(this.url).then(segments => {
      let baseUrl = this.getBaseUrl(this.url);

      if (!baseUrl) {
        this.setError('Unsupported url');
        return;
      }

      segments.map(segument => {
        segument.url = baseUrl + segument.url;

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

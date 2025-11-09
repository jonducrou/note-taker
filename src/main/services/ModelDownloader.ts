import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { Extract } from 'unzipper';
import https from 'https';

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

export class ModelDownloader {
  private readonly MODEL_NAME = 'vosk-model-en-us-0.22';
  private readonly MODEL_URL = `https://alphacephei.com/vosk/models/${this.MODEL_NAME}.zip`;
  private readonly modelPath: string;
  private onProgress?: (progress: DownloadProgress) => void;

  constructor() {
    // Store models in user's Application Support directory
    // This works in both development and production
    const appDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'Note Taker');
    this.modelPath = path.join(appDataPath, 'models', this.MODEL_NAME);
  }

  /**
   * Check if the model exists locally
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.modelPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get the path to the model directory
   */
  getModelPath(): string {
    return this.modelPath;
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: DownloadProgress) => void): void {
    this.onProgress = callback;
  }

  /**
   * Download and extract the Vosk model
   */
  async downloadModel(): Promise<void> {
    // Check if already exists
    if (await this.isModelAvailable()) {
      console.log('[ModelDownloader] Model already exists:', this.modelPath);
      return;
    }

    console.log('[ModelDownloader] Downloading model from:', this.MODEL_URL);

    // Ensure models directory exists
    const modelsDir = path.dirname(this.modelPath);
    await fs.mkdir(modelsDir, { recursive: true });

    // Download to temporary file
    const tempZip = path.join(os.tmpdir(), `${this.MODEL_NAME}.zip`);

    try {
      await this.downloadFile(this.MODEL_URL, tempZip);
      console.log('[ModelDownloader] Download complete, extracting...');

      await this.extractZip(tempZip, modelsDir);
      console.log('[ModelDownloader] Model extracted successfully to:', this.modelPath);

      // Clean up temp file
      await fs.unlink(tempZip);
    } catch (error) {
      console.error('[ModelDownloader] Failed to download model:', error);
      // Clean up on failure
      try {
        await fs.unlink(tempZip);
      } catch {}
      throw error;
    }
  }

  /**
   * Download file with progress tracking
   */
  private downloadFile(url: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log('[ModelDownloader] Following redirect to:', redirectUrl);
            this.downloadFile(redirectUrl, destination).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let bytesDownloaded = 0;

        const fileStream = createWriteStream(destination);

        response.on('data', (chunk) => {
          bytesDownloaded += chunk.length;
          if (this.onProgress && totalBytes > 0) {
            this.onProgress({
              bytesDownloaded,
              totalBytes,
              percentage: Math.round((bytesDownloaded / totalBytes) * 100)
            });
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (error) => {
          fs.unlink(destination).catch(() => {});
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Extract zip file
   */
  private async extractZip(zipPath: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(zipPath);
      stream
        .pipe(Extract({ path: destination }))
        .on('close', resolve)
        .on('error', reject);
    });
  }
}

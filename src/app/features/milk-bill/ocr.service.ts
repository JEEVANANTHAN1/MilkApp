import { Injectable } from '@angular/core';
import { createWorker, Worker } from 'tesseract.js';

/**
 * Wraps Tesseract.js for client-side OCR.
 *
 * Requires: npm install tesseract.js
 *
 * By default Tesseract.js pulls its worker/core/lang files from a CDN at
 * runtime. That's fine for development. For production / offline use,
 * download the eng.traineddata + worker + core files and point
 * createWorker() at local paths (see Tesseract.js docs: "Installation" ->
 * "Offline / self-hosted").
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private workerPromise: Promise<Worker> | null = null;

  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker('eng');
    }
    return this.workerPromise;
  }

  /**
   * Runs OCR on an image (data URL, File, or Blob) and returns the raw
   * recognized text. Caller is responsible for interpreting the text.
   */
  async extractText(image: string | File | Blob): Promise<string> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(image);
    return data.text;
  }

  async terminate(): Promise<void> {
    if (this.workerPromise) {
      const worker = await this.workerPromise;
      await worker.terminate();
      this.workerPromise = null;
    }
  }
}

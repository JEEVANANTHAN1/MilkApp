import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * OCR via the OcrOllamaApi (.NET, server/OcrOllamaApi), which forwards the
 * image to a local Ollama vision model. Requires that API to be running
 * (default http://localhost:5257) and Ollama itself running with the model
 * pulled — there is no client-side/offline OCR fallback.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:5257/api/ocr';

  async extractText(image: File | Blob): Promise<string> {
    const form = new FormData();
    form.append('image', image);

    const result = await firstValueFrom(
      this.http.post<{ text: string }>(this.apiUrl, form)
    );
    return result.text;
  }
}

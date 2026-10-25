/**
 * Pick a verification document — an image OR a PDF. On web (and the preview) this
 * uses a native file input that accepts both. On a phone it opens the system file
 * picker (`expo-document-picker`, APKs built from 2026-10-25); an older APK
 * without that native module falls back to the photo library (a scan/photo of
 * the document).
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { pickPhoto } from './photo';

type DocPickerApi = typeof import('expo-document-picker');
let picker: DocPickerApi | null | undefined;
function docPicker(): DocPickerApi | null {
  if (picker !== undefined) return picker;
  picker = null;
  try {
    if (requireOptionalNativeModule('ExpoDocumentPicker')) picker = require('expo-document-picker') as DocPickerApi;
  } catch { picker = null; }
  return picker;
}

export interface PickedDoc {
  name: string;
  uri: string;
  /** MIME type when known (file input / file picker); undefined for a photo pick. */
  mimeType?: string;
}

export async function pickDocument(): Promise<PickedDoc | null> {
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return null;
    return new Promise<PickedDoc | null>((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.style.display = 'none';
      input.onchange = () => {
        const file = input.files && input.files[0];
        resolve(file ? { name: file.name, uri: URL.createObjectURL(file), mimeType: file.type || undefined } : null);
        input.remove();
      };
      // if the dialog is dismissed without a file, clean up after a while
      doc.body.appendChild(input);
      input.click();
      setTimeout(() => input.isConnected && input.remove(), 120000);
    });
  }
  const dp = docPicker();
  if (dp) {
    const res = await dp.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
    const a = res.canceled ? null : res.assets?.[0];
    return a ? { name: a.name || a.uri.split('/').pop() || 'document', uri: a.uri, mimeType: a.mimeType ?? undefined } : null;
  }
  // Older APK: a photo/scan of the document.
  const uri = await pickPhoto();
  return uri ? { name: uri.split('/').pop() ?? 'document', uri } : null;
}

export interface PickedText {
  name: string;
  text: string;
}

/** Pick a text file (CSV / TSV) and read it — web only (a file input +
 *  `file.text()`). Native returns null: there the organiser pastes the cells
 *  instead. Resolves null when nothing is chosen. A binary spreadsheet (.xlsx)
 *  still resolves with its name so the caller can explain what to do. */
export async function pickTextFile(accept = '.csv,.tsv,.txt,text/csv'): Promise<PickedText | null> {
  if (Platform.OS !== 'web') return null;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return null;
  return new Promise<PickedText | null>((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { resolve(null); return; }
      // Don't decode a binary workbook as text — the name is enough to explain.
      if (/\.(xlsx?|xlsm|ods|numbers)$/i.test(file.name)) { resolve({ name: file.name, text: '' }); return; }
      try { resolve({ name: file.name, text: await file.text() }); } catch { resolve(null); }
    };
    doc.body.appendChild(input);
    input.click();
    setTimeout(() => input.isConnected && input.remove(), 120000);
  });
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
};

/** The picked file's bytes for a Storage upload, and its type. An ArrayBuffer,
 *  not a Blob: a Blob from fetch() uploads 0 bytes on Android. */
export async function readDocBytes(doc: PickedDoc): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(doc.uri);
  const type = res.headers?.get?.('content-type') ?? '';
  const bytes = await res.arrayBuffer();
  const ext = (doc.name.split('.').pop() || '').toLowerCase();
  const contentType = doc.mimeType || MIME_BY_EXT[ext] || (type && !type.startsWith('text/') ? type.split(';')[0] : '') || 'application/octet-stream';
  return { bytes, contentType };
}

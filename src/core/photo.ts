/** Pick an image from the device library (web: file picker). Returns null if the
 *  user cancels or denies permission. Upload it with `uploadImage` (repos) —
 *  the URI it returns only works on this device. */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { fitSize, reencodeAs } from './imageMeta';

export type PickedImage = { uri: string; mimeType?: string; fileSize?: number };

export async function pickImage(opts: { aspect?: [number, number] } = {}): Promise<PickedImage | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      ...(opts.aspect ? { aspect: opts.aspect } : {}),
      quality: 0.6,
    });
    if (result.canceled) return null;
    const a = result.assets[0];
    const picked: PickedImage | null = a ? { uri: a.uri, mimeType: a.mimeType ?? undefined, fileSize: a.fileSize ?? undefined } : null;
    // Security W3 (CL-16): in a browser the original file (EXIF, GPS) would go up
    return picked && Platform.OS === 'web' ? await withoutMetadata(picked) : picked;
  } catch {
    return null;
  }
}

/** The bare URI (the verification-document fallback still uses this). */
export async function pickPhoto(): Promise<string | null> {
  return (await pickImage())?.uri ?? null;
}

/** Web: redraw the image on a canvas and use that copy — no EXIF or GPS, at most
 *  2048 px a side. Any failure keeps the original (the upload still works). */
async function withoutMetadata(img: PickedImage): Promise<PickedImage> {
  const as = reencodeAs(img.mimeType);
  if (!as || typeof document === 'undefined') return img;
  try {
    const el = new Image();
    el.src = img.uri;
    await el.decode();
    const { w, h } = fitSize(el.naturalWidth, el.naturalHeight);
    if (!w || !h) return img;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(el, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, as, 0.85));
    return blob ? { uri: URL.createObjectURL(blob), mimeType: as, fileSize: blob.size } : img;
  } catch {
    return img;
  }
}

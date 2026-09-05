import { Capacitor } from '@capacitor/core';

// Returns false on the web, where the existing browser download is used.
export async function shareBookFile(
  file: Blob,
  filename: string,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result.slice(reader.result.indexOf(',') + 1))
        : reject(new Error('This file could not be exported.'));
    reader.onerror = () =>
      reject(new Error('This file could not be exported.'));
    reader.readAsDataURL(file);
  });
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const path = `leaf-exports/${crypto.randomUUID()}/${safeName}`;
  const saved = await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: base64,
    recursive: true,
  });
  try {
    await Share.share({ title: filename, files: [saved.uri] });
  } catch (error) {
    if (!(error instanceof Error) || !/cancel/i.test(error.message))
      throw error;
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(
      () => {},
    );
  }
  return true;
}

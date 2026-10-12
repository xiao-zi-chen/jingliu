declare global {
  interface Window {
    JingliuAndroid?: { exportBackup: (contents: string, filename: string) => void };
    jingliuHandleBack?: () => boolean;
  }
}
export const isAndroidApp = typeof window.JingliuAndroid?.exportBackup === 'function';

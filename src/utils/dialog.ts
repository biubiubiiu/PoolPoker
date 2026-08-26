import { confirm as tauriConfirm, message as tauriMessage } from '@tauri-apps/plugin-dialog';

/**
 * 弹出二次确认对话框 (在 iOS/Android/Desktop Tauri 环境使用原生 UIAlertController/AlertDialog 弹窗，标准 Web 环境回退为 window.confirm)
 */
export async function showConfirm(messageText: string, titleText: string = '确认提示'): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      return await tauriConfirm(messageText, {
        title: titleText,
        kind: 'warning',
      });
    }
  } catch (err) {
    console.warn('[Dialog] Native dialog failed, falling back to window.confirm:', err);
  }
  return window.confirm(messageText);
}

/**
 * 弹出警告/消息提示框 (在 iOS/Android/Desktop Tauri 环境使用原生消息弹窗，标准 Web 环境回退为 window.alert)
 */
export async function showAlert(messageText: string, titleText: string = '提示'): Promise<void> {
  try {
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      await tauriMessage(messageText, {
        title: titleText,
        kind: 'info',
      });
      return;
    }
  } catch (err) {
    console.warn('[Dialog] Native dialog failed, falling back to window.alert:', err);
  }
  window.alert(messageText);
}

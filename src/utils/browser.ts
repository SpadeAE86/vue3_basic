/**
 * 浏览器兼容性工具函数
 * 处理 HTTP 环境下部分 API (如 crypto, clipboard) 不可用或受限的问题
 */

/**
 * 兼容性 UUID 生成
 * 优先使用 crypto.randomUUID，HTTP 环境下自动回退到 Math.random 实现
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 兼容性剪贴板复制
 * 优先使用 navigator.clipboard，失败或不可用时回退到 document.execCommand('copy')
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. 尝试使用现代 API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('navigator.clipboard.writeText failed, falling back...', e);
    }
  }

  // 2. Fallback: 使用 textarea + execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // 确保 textarea 不可见且不影响滚动
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return success;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    return false;
  }
}

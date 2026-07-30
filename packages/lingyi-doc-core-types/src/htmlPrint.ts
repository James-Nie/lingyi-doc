/**
 * 转义HTML特殊字符
 * @param text 
 * @returns text 转义后的HTML字符串
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeHtml };

/**
 * 包裹HTML文档
 * @param body HTML文档内容
 * @param title 文档标题
 * @returns 包裹后的HTML文档
 */
export function wrapHtmlDocument(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2329; line-height: 1.6; padding: 24px; max-width: 860px; margin: 0 auto; }
    h1,h2,h3,h4,h5,h6 { margin: 1.2em 0 0.5em; }
    p { margin: 0.5em 0; }
    pre { background: #f5f6f7; padding: 12px; border-radius: 6px; overflow: auto; }
    blockquote { border-left: 3px solid #dee0e3; margin: 0.8em 0; padding-left: 12px; color: #646a73; }
    table { margin: 12px 0; }
    img { max-width: 100%; height: auto; page-break-inside: avoid; }
    figure { margin: 12px 0; page-break-inside: avoid; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

/**
 * 包裹图片打印HTML文档
 * @param title 文档标题
 * @param imageDataUrl 图片数据URL
 * @param options 选项
 * @returns 包裹后的HTML文档
 */
export function wrapImagePrintHtml(
  title: string,
  imageDataUrl: string,
  options?: { subtitle?: string },
): string {
  const subtitle = options?.subtitle
    ? `<p style="margin:0 0 16px;color:#646a73;font-size:14px;">${escapeHtml(options.subtitle)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 12mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1f2329;
      margin: 0;
      padding: 24px;
      text-align: center;
    }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
    img { max-width: 100%; height: auto; display: inline-block; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle}
  <img src="${imageDataUrl}" alt="${escapeHtml(title)}" />
</body>
</html>`;
}

/**
 * 对文件名进行清理，确保它符合文件名的命名规则
 * @param name 文件名
 * @param fallback 回退文件名
 * @returns 清理后的文件名
 */
export function sanitizeFileName(name: string, fallback = '文档'): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || fallback;
}

/**
 * 下载Blob对象
 * @param blob Blob对象
 * @param filename 文件名
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * 等待文档中的所有图片加载完成
 * @param doc 文档对象
 * @returns 所有图片加载完成后返回undefined
 */

function waitForDocumentImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return Promise.all(images.map(img => {
    if (img.complete && img.naturalHeight > 0) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  })).then(() => undefined);
}

/**
 * 打印HTML文档
 * @param html HTML文档内容
 * @returns 打印完成后返回undefined
 */
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 1000);
    };

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) {
      cleanup();
      reject(new Error('无法创建打印窗口'));
      return;
    }

    let started = false;
    const triggerPrint = async () => {
      if (started) return;
      started = true;
      try {
        await waitForDocumentImages(doc);
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        win.focus();
        win.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    };

    win.addEventListener('load', () => { void triggerPrint(); }, { once: true });
    doc.open();
    doc.write(html);
    doc.close();
    if (doc.readyState === 'complete') void triggerPrint();
  });
}

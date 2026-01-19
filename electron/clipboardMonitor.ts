/**
 * 剪贴板监听器
 * 负责监听剪贴板图片变化并管理历史
 */
import { clipboard, nativeImage } from 'electron';
import log from 'electron-log';

interface ClipboardImage {
  dataUrl: string;
  timestamp: number;
  timerId: NodeJS.Timeout;
}

export class ClipboardMonitor {
  private clipboardImageHistory: ClipboardImage[] = [];
  private clipboardMonitorInterval: NodeJS.Timeout | null = null;
  private lastClipboardImageHash: string | null = null;
  private readonly IMAGE_LIFETIME = 30000; // 30秒

  /**
   * 压缩图片（与截图使用相同的压缩策略）
   */
  private compressImage(base64: string): string {
    try {
      // 从base64创建图片
      const buffer = Buffer.from(base64, 'base64');
      const image = nativeImage.createFromBuffer(buffer);
      
      const originalSize = image.getSize();
      log.info(`Original clipboard image size: ${originalSize.width}x${originalSize.height}, ${base64.length} bytes`);
      
      // 缩放到50%
      const newWidth = Math.floor(originalSize.width * 0.5);
      const newHeight = Math.floor(originalSize.height * 0.5);
      const resized = image.resize({ width: newWidth, height: newHeight });
      
      // 转换为JPEG格式，质量80%
      const jpeg = resized.toJPEG(80);
      const compressedBase64 = jpeg.toString('base64');
      
      log.info(`Compressed clipboard image to: ${newWidth}x${newHeight}, ${compressedBase64.length} bytes (${(compressedBase64.length / 1024 / 1024).toFixed(2)}MB)`);
      
      return `data:image/jpeg;base64,${compressedBase64}`;
    } catch (error) {
      log.error('Image compression failed:', error);
      // 压缩失败则返回原图
      return `data:image/png;base64,${base64}`;
    }
  }

  /**
   * 添加图片到历史（带压缩）
   */
  private addClipboardImage(dataUrl: string): void {
    // 检查是否已存在（避免重复）
    const exists = this.clipboardImageHistory.some(item => item.dataUrl === dataUrl);
    if (exists) {
      log.info('Image already in history, skipping');
      return;
    }

    // 创建定时器，30秒后自动删除
    const timerId = setTimeout(() => {
      this.removeClipboardImage(dataUrl);
    }, this.IMAGE_LIFETIME);

    // 添加到历史
    const image: ClipboardImage = {
      dataUrl,
      timestamp: Date.now(),
      timerId,
    };
    
    this.clipboardImageHistory.push(image);
    log.info(`Clipboard image added. Total: ${this.clipboardImageHistory.length}, will expire in 30s`);
  }

  /**
   * 删除图片
   */
  private removeClipboardImage(dataUrl: string): void {
    const index = this.clipboardImageHistory.findIndex(item => item.dataUrl === dataUrl);
    if (index !== -1) {
      const image = this.clipboardImageHistory[index];
      clearTimeout(image.timerId);
      this.clipboardImageHistory.splice(index, 1);
      log.info(`Clipboard image removed. Remaining: ${this.clipboardImageHistory.length}`);
    }
  }

  /**
   * 获取所有有效的历史图片
   */
  getClipboardHistory(): string[] {
    return this.clipboardImageHistory.map(item => item.dataUrl);
  }

  /**
   * 清空历史
   */
  clearClipboardHistory(): void {
    this.clipboardImageHistory.forEach(item => clearTimeout(item.timerId));
    this.clipboardImageHistory = [];
    log.info('Clipboard history cleared');
  }

  /**
   * 启动剪贴板监听（使用定时检查方式）
   */
  start(): void {
    try {
      // 每1000ms检查一次剪贴板（降低频率，减少CPU占用）
      this.clipboardMonitorInterval = setInterval(() => {
        try {
          const image = clipboard.readImage();
          
          if (!image.isEmpty()) {
            const png = image.toPNG();
            const base64 = png.toString('base64');
            
            // 使用hash来检测是否是新图片（避免重复添加）
            const hash = base64.substring(0, 100); // 使用前100个字符作为简单hash
            
            if (hash !== this.lastClipboardImageHash) {
              this.lastClipboardImageHash = hash;
              
              log.info(`📋 New clipboard image detected, original size: ${base64.length} bytes`);
              
              // 压缩图片后再添加到历史
              const compressedDataUrl = this.compressImage(base64);
              this.addClipboardImage(compressedDataUrl);
            }
          }
        } catch (error) {
          // 静默处理错误，避免日志刷屏
        }
      }, 1000);
      
      log.info('✅ Clipboard monitor started (polling every 1000ms)');
    } catch (error) {
      log.error('❌ Failed to start clipboard monitor:', error);
    }
  }

  /**
   * 停止剪贴板监听
   */
  stop(): void {
    if (this.clipboardMonitorInterval) {
      clearInterval(this.clipboardMonitorInterval);
      this.clipboardMonitorInterval = null;
    }
    this.clearClipboardHistory();
    this.lastClipboardImageHash = null;
    log.info('Clipboard monitor stopped');
  }
}

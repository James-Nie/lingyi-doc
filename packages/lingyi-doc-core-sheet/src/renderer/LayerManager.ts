import type { LayerIndex } from './types';

// ==================== LayerManager ====================

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirty: boolean;
}

export class LayerManager {
  private _layers: Layer[] = [];
  private _parent: HTMLElement;
  private _width = 0;
  private _height = 0;

  constructor(parent: HTMLElement) {
    this._parent = parent;
    this._createLayers();
  }

  getLayer(index: LayerIndex): CanvasRenderingContext2D {
    const layer = this._layers[index];
    if (!layer) {
      throw new Error(`LayerManager.getLayer: layer ${index} is not available (destroyed or not created)`);
    }
    return layer.ctx;
  }

  /** 图层是否仍可用（未 destroy） */
  isAlive(): boolean {
    return this._layers.length > 0;
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      // 使用 devicePixelRatio 确保高清显示
      const dpr = window.devicePixelRatio || 1;
      layer.canvas.width = width * dpr;
      layer.canvas.height = height * dpr;
      layer.canvas.style.width = `${width}px`;
      layer.canvas.style.height = `${height}px`;
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layer.dirty = true;
    }
  }

  clearLayer(index: LayerIndex): void {
    const layer = this._layers[index];
    layer.ctx.clearRect(0, 0, this._width, this._height);
    layer.dirty = false;
  }

  clearAll(): void {
    for (let i = 0; i < this._layers.length; i++) {
      this.clearLayer(i as LayerIndex);
    }
  }

  markDirty(index: LayerIndex): void {
    this._layers[index].dirty = true;
  }

  destroy(): void {
    for (const layer of this._layers) {
      layer.canvas.remove();
    }
    this._layers = [];
  }

  private _createLayers(): void {
    const layerNames = ['background', 'gridlines', 'merge-cells', 'content', 'selection', 'cursor', 'overlay'];

    for (let i = 0; i < layerNames.length; i++) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `
        position: absolute;
        left: 0; top: 0;
        pointer-events: none;
        z-index: ${i};
      `;
      canvas.setAttribute('data-layer', layerNames[i]);
      this._parent.appendChild(canvas);

      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      this._layers.push({ canvas, ctx, dirty: true });
    }
  }
}

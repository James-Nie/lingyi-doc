/**
 * 混合逻辑时钟类
 * @param nodeId 节点ID
 */
export class HybridLogicalClock {
  private physicalTime = 0;
  private logicalCounter = 0;

  constructor(private readonly nodeId: string) {}

  next(): string {
    const now = Date.now();
    if (now > this.physicalTime) {
      this.physicalTime = now;
      this.logicalCounter = 0;
    } else {
      this.logicalCounter += 1;
    }
    return `${this.physicalTime}:${this.logicalCounter}:${this.nodeId}`;
  }

  tick(): number {
    const now = Date.now();
    this.physicalTime = Math.max(now, this.physicalTime);
    return this.physicalTime;
  }
}

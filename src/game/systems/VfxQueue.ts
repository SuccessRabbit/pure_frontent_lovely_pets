/**
 * FIFO 表现队列：逻辑可立即结算，飞牌/粒子等按顺序播放。
 */
export class VfxQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue(task: () => void | Promise<void>): void {
    this.tail = this.tail.then(async () => {
      try {
        await task();
      } catch (e) {
        console.error('[VfxQueue] task failed', e);
      }
    });
  }
}

// 缓动函数
export const Easing = {
  linear: (t: number) => t,

  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

  easeInElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },

  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export type EasingFunction = (t: number) => number;

interface TweenTarget {
  [key: string]: number;
}

function isTweenTargetGone(target: unknown): boolean {
  if (target == null) return true;
  if (typeof target === 'object' && 'destroyed' in target) {
    return Boolean((target as { destroyed?: boolean }).destroyed);
  }
  return false;
}

class TweenInstance {
  private startValues: TweenTarget = {};
  private endValues: TweenTarget;
  private duration: number;
  private elapsed = 0;
  private easing: EasingFunction;
  private onComplete?: () => void;
  private isComplete = false;

  constructor(
    private target: any,
    endValues: TweenTarget,
    duration: number,
    easing: EasingFunction = Easing.linear,
    onComplete?: () => void
  ) {
    this.endValues = endValues;
    this.duration = duration / 1000; // 转换为秒
    this.easing = easing;
    this.onComplete = onComplete;

    // 记录起始值
    for (const key in endValues) {
      this.startValues[key] = target[key] || 0;
    }
  }

  public update(deltaTime: number): boolean {
    if (this.isComplete) return true;
    // 目标已被 Pixi destroy 或引用失效时结束并移除此 tween（避免对已销毁对象赋值）
    if (isTweenTargetGone(this.target)) {
      return true;
    }

    this.elapsed += deltaTime;
    const t = Math.min(this.elapsed / this.duration, 1);
    const easedT = this.easing(t);

    try {
      for (const key in this.endValues) {
        if (isTweenTargetGone(this.target)) {
          return true;
        }
        const start = this.startValues[key];
        const end = this.endValues[key];
        this.target[key] = start + (end - start) * easedT;
      }
    } catch {
      return true;
    }

    if (t >= 1) {
      this.isComplete = true;
      if (this.onComplete) {
        try {
          this.onComplete();
        } catch {
          /* ignore */
        }
      }
      return true;
    }

    return false;
  }

  public hasTarget(target: unknown): boolean {
    return this.target === target;
  }
}

class TweenManager {
  private tweens: TweenInstance[] = [];

  public to(
    target: any,
    endValues: TweenTarget,
    duration: number,
    easing: EasingFunction | string = Easing.linear,
    onComplete?: () => void
  ): TweenInstance {
    // 如果 easing 是字符串，转换为函数
    const easingFunc = typeof easing === 'string'
      ? (Easing as any)[easing] || Easing.linear
      : easing;

    const tween = new TweenInstance(target, endValues, duration, easingFunc, onComplete);
    this.tweens.push(tween);
    return tween;
  }

  public update(deltaTime: number) {
    // 关键修复：
    // tween.update() 的 onComplete 里可能继续 Tween.to(...)。
    // 之前用 filter 基于旧数组重建，会把回调里新 push 的 tween 覆盖丢失。
    // 这里改为对当前快照迭代，并把仍存活的 tween 追加回新的 this.tweens，
    // 这样 onComplete 中新建的 tween 会保留在 this.tweens 里，下一帧继续执行。
    const activeTweens = this.tweens;
    this.tweens = [];

    for (const tween of activeTweens) {
      const completed = tween.update(deltaTime);
      if (!completed) {
        this.tweens.push(tween);
      }
    }
  }

  public clear() {
    this.tweens = [];
  }

  /** 销毁显示对象前调用，立刻摘掉相关 tween（如手牌整排重建时） */
  public killTarget(target: unknown) {
    if (target == null) return;
    this.tweens = this.tweens.filter(t => !t.hasTarget(target));
  }
}

// 全局 Tween 管理器
export const Tween = new TweenManager();

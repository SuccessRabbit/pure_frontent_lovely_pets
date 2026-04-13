export interface MouseState {
  x: number;
  y: number;
  isDown: boolean;
  justPressed: boolean;
  justReleased: boolean;
}

export class InputManager {
  private mouse: MouseState = {
    x: 0,
    y: 0,
    isDown: false,
    justPressed: false,
    justReleased: false,
  };

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mousemove', this.onMouseMove);

    // 触摸事件（移动端支持）
    this.canvas.addEventListener('touchstart', this.onTouchStart);
    this.canvas.addEventListener('touchend', this.onTouchEnd);
    this.canvas.addEventListener('touchmove', this.onTouchMove);
  }

  private onMouseDown = (e: MouseEvent) => {
    this.mouse.isDown = true;
    this.mouse.justPressed = true;
    this.updateMousePosition(e.clientX, e.clientY);
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouse.isDown = false;
    this.mouse.justReleased = true;
    this.updateMousePosition(e.clientX, e.clientY);
  };

  private onMouseMove = (e: MouseEvent) => {
    this.updateMousePosition(e.clientX, e.clientY);
  };

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    this.mouse.isDown = true;
    this.mouse.justPressed = true;
    this.updateMousePosition(touch.clientX, touch.clientY);
  };

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    this.mouse.isDown = false;
    this.mouse.justReleased = true;
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    this.updateMousePosition(touch.clientX, touch.clientY);
  };

  private updateMousePosition(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = clientX - rect.left;
    this.mouse.y = clientY - rect.top;
  }

  public update() {
    // 重置单帧事件
    this.mouse.justPressed = false;
    this.mouse.justReleased = false;
  }

  public getMouse(): Readonly<MouseState> {
    return this.mouse;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
  }
}

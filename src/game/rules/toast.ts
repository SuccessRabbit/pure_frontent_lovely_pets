export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastMessage {
  text: string;
  tone: ToastTone;
  color?: number;
  holdMs?: number;
}

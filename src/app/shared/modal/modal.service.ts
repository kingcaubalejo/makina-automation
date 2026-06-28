import { Injectable, signal } from '@angular/core';

export type ModalVariant = 'primary' | 'danger' | 'ghost';

export interface ModalAction<T = unknown> {
  label: string;
  variant?: ModalVariant;
  value: T;
  autofocus?: boolean;
}

export type ModalKind = 'alert' | 'confirm' | 'prompt';

export interface ModalState<T = unknown> {
  kind: ModalKind;
  title: string;
  message?: string;
  inputValue?: string;
  inputPlaceholder?: string;
  actions: Array<ModalAction<T>>;
  dismissValue: T;
}

export interface AlertOptions {
  title?: string;
  message: string;
  actionLabel?: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  default?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly state = signal<ModalState | null>(null);
  private resolver: ((value: unknown) => void) | null = null;

  alert(opts: AlertOptions): Promise<void> {
    return this.open<void>({
      kind: 'alert',
      title: opts.title ?? 'Notice',
      message: opts.message,
      actions: [
        {
          label: opts.actionLabel ?? 'OK',
          variant: 'primary',
          value: undefined,
          autofocus: true,
        },
      ],
      dismissValue: undefined,
    });
  }

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return this.open<boolean>({
      kind: 'confirm',
      title: opts.title ?? 'Confirm',
      message: opts.message,
      actions: [
        { label: opts.cancelLabel ?? 'Cancel', variant: 'ghost', value: false },
        {
          label: opts.confirmLabel ?? 'OK',
          variant: opts.danger ? 'danger' : 'primary',
          value: true,
          autofocus: true,
        },
      ],
      dismissValue: false,
    });
  }

  prompt(opts: PromptOptions): Promise<string | null> {
    return this.open<string | null>({
      kind: 'prompt',
      title: opts.title ?? 'Input',
      message: opts.message,
      inputValue: opts.default ?? '',
      inputPlaceholder: opts.placeholder,
      actions: [
        { label: opts.cancelLabel ?? 'Cancel', variant: 'ghost', value: null },
        {
          label: opts.confirmLabel ?? 'OK',
          variant: 'primary',
          value: '__INPUT__',
          autofocus: false,
        },
      ],
      dismissValue: null,
    });
  }

  close(value: unknown): void {
    const resolver = this.resolver;
    this.resolver = null;
    this.state.set(null);
    resolver?.(value);
  }

  setInputValue(value: string): void {
    this.state.update((s) => (s ? { ...s, inputValue: value } : s));
  }

  private open<T>(state: ModalState<T>): Promise<T> {
    if (this.resolver) {
      this.resolver(state.dismissValue);
      this.resolver = null;
    }
    return new Promise<T>((resolve) => {
      this.resolver = resolve as (value: unknown) => void;
      this.state.set(state as ModalState<unknown>);
    });
  }
}

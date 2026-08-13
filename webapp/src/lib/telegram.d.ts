export {};

declare global {
  interface TelegramWebApp {
    initData: string;
    initDataUnsafe: { user?: { id: number; first_name?: string } };
    colorScheme: 'light' | 'dark';
    themeParams: Record<string, string>;
    ready(): void;
    expand(): void;
    close(): void;
    HapticFeedback?: {
      impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
      notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    };
    MainButton: {
      setText(t: string): void;
      show(): void;
      hide(): void;
      onClick(cb: () => void): void;
      offClick(cb: () => void): void;
    };
  }
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

import { InlineKeyboard, Keyboard } from 'grammy';
import { env } from '../config/env.js';

export const phoneKeyboard = new Keyboard()
  .requestContact('📱 Share my number')
  .resized()
  .oneTime();

export const removeKeyboard = { remove_keyboard: true as const };

/**
 * Telegram only accepts HTTPS urls for Web App buttons, so a local
 * `http://localhost:5173` cannot be attached. During local development we drop
 * the button instead of letting sendMessage fail with a 400.
 */
export function webAppAvailable(): boolean {
  return env.WEBAPP_URL.startsWith('https://');
}

export function appButton(): InlineKeyboard | undefined {
  if (!webAppAvailable()) return undefined;
  return new InlineKeyboard().webApp('📱 Open TMA', env.WEBAPP_URL);
}

export function blockStartKeyboard(blockId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('▶️ Started', `blk:start:${blockId}`)
    .text('⏭ Skip', `blk:skip:${blockId}`)
    .row()
    .text('⏰ Remind in 10 min', `blk:snooze:${blockId}`);
}

export function blockEndKeyboard(blockId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('1', `blk:focus:${blockId}:1`)
    .text('2', `blk:focus:${blockId}:2`)
    .text('3', `blk:focus:${blockId}:3`)
    .text('4', `blk:focus:${blockId}:4`)
    .text('5', `blk:focus:${blockId}:5`);
}

export function skipReasonKeyboard(blockId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('😴 Too tired', `skp:${blockId}:tired`)
    .text('🌀 Distracted', `skp:${blockId}:distracted`)
    .row()
    .text('📌 Something came up', `skp:${blockId}:other_task`)
    .text('⏱ Block too long', `skp:${blockId}:too_long`);
}

export function wakeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✅ I'm up", 'wake:up');
}

export function confirmKeyboard(pendingId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Apply', `pc:accept:${pendingId}`)
    .text('❌ No', `pc:reject:${pendingId}`);
}

export function recoveryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Replan the day', 'rec:yes')
    .text('Not now', 'rec:no');
}

export function vocabKeyboard(cardId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("❌ Didn't know", `voc:${cardId}:1`)
    .text('🤔 Hard', `voc:${cardId}:3`)
    .text('✅ Knew it', `voc:${cardId}:5`);
}

import { InlineKeyboard, Keyboard } from 'grammy';
import type { Block } from '../types/db.js';
import { hhmm } from '../lib/time.js';
import { env } from '../config/env.js';

/**
 * Persistent bottom menu. The labels double as commands: the text handler maps
 * them back to actions, so the user never has to remember a slash command.
 */
export const MENU = {
  today: '📅 Today',
  tomorrow: '📆 Tomorrow',
  plan: '✨ New plan',
  report: '📊 Report',
  settings: '⚙️ Settings',
  help: '❓ Help',
} as const;

export const mainMenu = new Keyboard()
  .text(MENU.today).text(MENU.tomorrow).row()
  .text(MENU.plan).text(MENU.report).row()
  .text(MENU.settings).text(MENU.help)
  .resized()
  .persistent();

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

/** /plan offers both paths: let the AI draft the day, or upload your own JSON. */
export function planKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✨ AI: today', 'plan:ai:today')
    .text('✨ AI: tomorrow', 'plan:ai:tomorrow')
    .row()
    .text('📄 Upload my own JSON', 'plan:json');
}

/**
 * The day rendered as a tappable checklist.
 *
 * Telegram's native checklists (sendChecklist) only work through a Business
 * connection, so this is the equivalent built from inline buttons: one row per
 * block, tapping a row toggles it and the same message is edited in place.
 */
export function checklistKeyboard(blocks: Block[], dateISO: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of blocks.slice(0, 40)) {
    const mark = b.status === 'done' ? '✅' : b.status === 'skipped' ? '❌' : '⬜';
    const label = `${mark} ${hhmm(b.start_time)} ${b.title}`.slice(0, 60);
    kb.text(label, `chk:${b.id}:${dateISO}`).row();
  }
  return kb;
}

/** Sent 5 minutes before a block ends. Stays tappable until answered. */
export function doneKeyboard(blockId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Did it', `cfm:done:${blockId}`)
    .text('❌ Did not', `cfm:miss:${blockId}`)
    .row()
    .text('⏳ Still working', `cfm:later:${blockId}`);
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

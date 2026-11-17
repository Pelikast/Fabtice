// The menu Fabtice (C6): a click on the logo, top left, opens the app's
// commands (`ui/commands.ts`, `FABTICE_MENU`). Two forms (C8):
//
//   - computer (wider than 760 px): a drop-down menu under the logo, submenus
//     to the right on hover or click, the whole of it usable from the keyboard
//     (arrows, Right opens a submenu, Left closes it, Enter, Escape, the first
//     letter), ARIA roles `menu` / `menuitem`, shortcuts shown on the right;
//   - phone: the same entries on a sheet over the whole screen; a submenu opens
//     at a touch as a list of its own, with « Retour »; no shortcuts shown.
//
// Entries that cannot run are greyed out (`aria-disabled`) and do nothing.
// A command that fails (« Ouvrir dans iReal Pro » without iReal Pro) opens the
// menu again on its entry, with the sentence under it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { t } from '../i18n';
import { getDesktopBridge, type RecentProject } from '../platform/desktopBridge';
import {
  COMMANDS,
  FABTICE_MENU,
  nodeEnabled,
  offeredNodes,
  onCommandFailure,
  openRecent,
  pathOf,
  runCommand,
  shortcutText,
  shortcutsUseCmd,
  useCommandContext,
  type CommandContext,
  type CommandId,
  type MenuNode,
  type SubmenuId,
} from '../ui/commands';
import { CloseIcon } from '../ui/icons';
import { PHONE_QUERY } from '../util/media';

// ---------------------------------------------------------------- state

export interface FabticeMenuState {
  open: boolean;
  /** Opened from the keyboard: the first entry takes the focus (with the mouse, the menu itself does). */
  byKey: boolean;
  /** The submenus open, from the top (computer), or the list shown (phone). */
  path: SubmenuId[];
  /** A command that could not do its work, and why. */
  error: { id: CommandId; message: string } | null;
}

export const fabticeMenu = createStore<FabticeMenuState>()(() => ({ open: false, byKey: false, path: [], error: null }));

export function openFabticeMenu(byKey = false, path: SubmenuId[] = []): void {
  fabticeMenu.setState({ open: true, byKey, path, error: null });
}

export function closeFabticeMenu(): void {
  cancelHover();
  if (fabticeMenu.getState().open) fabticeMenu.setState({ open: false, path: [], error: null });
}

// A failure comes back on its entry, wherever the command was asked from (the keyboard, the Mac menu bar).
onCommandFailure((id, message) => {
  fabticeMenu.setState({ open: true, byKey: true, path: pathOf(id) ?? [], error: { id, message } });
});

/**
 * The mouse on its way to an open submenu crosses the entries below: the submenu waits this long before it gives
 * way to them (cancelled as soon as the mouse is in the submenu).
 */
const HOVER_GRACE_MS = 250;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function cancelHover(): void {
  if (hoverTimer !== null) clearTimeout(hoverTimer);
  hoverTimer = null;
}

function hoverTo(path: SubmenuId[], wait: boolean): void {
  cancelHover();
  const apply = () => {
    hoverTimer = null;
    const cur = fabticeMenu.getState();
    if (cur.open && cur.path.join('/') !== path.join('/')) fabticeMenu.setState({ path, error: null });
  };
  if (wait) hoverTimer = setTimeout(apply, HOVER_GRACE_MS);
  else apply();
}

/** Runs an entry: the menu closes first (the command may open a window), then the command. */
function activate(id: CommandId, ctx: CommandContext): void {
  if (!COMMANDS[id].enabled(ctx)) return;
  closeFabticeMenu();
  void runCommand(id);
}

// ---------------------------------------------------------------- helpers

/**
 * The sheet replaces the drop-down on a phone, and also on any screen too short for the drop-down to fit (a phone on
 * its side: 390 px high is less than the ten entries and their separators), since the sheet scrolls.
 */
const SHEET_QUERY = `${PHONE_QUERY}, (max-height: 500px)`;

function subscribePhone(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}
const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;

/** The entries of a menu element (not those of its submenus). */
function itemsOf(menu: Element | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>(':scope > .menu-ligne > [role="menuitem"]')] : [];
}

function focusItem(el: HTMLElement | undefined): void {
  el?.focus({ preventScroll: true });
}

/** Lower case, without accents: the first letter of « Écran » is « e ». */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The Mac app's recent projects, read when their submenu is shown. */
function useRecent(shown: boolean): RecentProject[] | null {
  const [list, setList] = useState<RecentProject[] | null>(null);
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!shown || !bridge?.recentProjects) return;
    let live = true;
    bridge.recentProjects().then(
      (l) => live && setList(l.slice(0, RECENT_MAX)),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [shown]);
  return list;
}
const RECENT_MAX = 10;
const projectName = (p: RecentProject) => p.name.replace(/\.fab$/i, '');

const Arrow = () => (
  <svg className="menu-fleche" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 1.5 6.5 6 2 10.5" />
  </svg>
);

// ---------------------------------------------------------------- the logo and the menu

export function FabticeMenu() {
  const open = useStore(fabticeMenu, (s) => s.open);
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // A press outside closes it (the logo itself toggles).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (wrapRef.current?.contains(target) || sheetRef.current?.contains(target))) return;
      closeFabticeMenu();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const backToLogo = useCallback(() => {
    closeFabticeMenu();
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openFabticeMenu(true);
    }
  };

  return (
    <div className="marque-ancre" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="marque"
        id="menu-fabtice-bouton"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'menu-fabtice' : undefined}
        // `detail` is 0 for a click made with Enter or Space.
        onClick={(e) => (open ? closeFabticeMenu() : openFabticeMenu(e.detail === 0))}
        onKeyDown={onButtonKey}
      >
        <span>
          Fab<i>t</i>ice
        </span>
        <svg className="marque-chevron" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 2 6 6l4-4" />
        </svg>
      </button>
      {open && !phone && <DropDown onLeave={backToLogo} />}
      {open && phone && createPortal(<Sheet ref={sheetRef} onLeave={backToLogo} />, document.body)}
    </div>
  );
}

// ---------------------------------------------------------------- computer: the drop-down

function DropDown({ onLeave }: { onLeave: () => void }) {
  const ctx = useCommandContext();
  const ref = useRef<HTMLDivElement>(null);
  // Opened: the first entry has the focus (the keyboard goes on from there).
  useLayoutEffect(() => {
    const st = fabticeMenu.getState();
    if (st.error) {
      // Back on the entry that failed.
      focusItem(ref.current?.querySelector<HTMLElement>(`[data-commande="${st.error.id}"]`) ?? undefined);
    } else if (st.byKey) focusItem(itemsOf(ref.current)[0]);
    else ref.current?.focus({ preventScroll: true });
  }, []);
  return <MenuList menuRef={ref} nodes={FABTICE_MENU} depth={0} ctx={ctx} onLeave={onLeave} />;
}

interface ListProps {
  nodes: readonly MenuNode[];
  depth: number;
  ctx: CommandContext;
  onLeave: () => void;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  label?: string;
}

function MenuList({ nodes, depth, ctx, onLeave, menuRef, label }: ListProps) {
  const path = useStore(fabticeMenu, (s) => s.path);
  const error = useStore(fabticeMenu, (s) => s.error);
  const own = useRef<HTMLDivElement>(null);
  const ref = menuRef ?? own;
  const mac = shortcutsUseCmd();
  const openId = path[depth] ?? null;
  const shown = offeredNodes(nodes, ctx);

  const target = (id: SubmenuId | null) => {
    const next = path.slice(0, depth);
    if (id) next.push(id);
    return next;
  };
  const setOpen = (id: SubmenuId | null) => {
    cancelHover();
    const next = target(id);
    if (next.join('/') !== path.join('/')) fabticeMenu.setState({ path: next, error: null });
  };
  /** The mouse on an entry of this menu: its submenu opens, another one closes (after a grace, see `hoverTo`). */
  const hover = (id: SubmenuId | null) => hoverTo(target(id), openId !== null && openId !== id);
  /** Opens a submenu and puts the focus on its first entry. */
  const enter = (id: SubmenuId, button: HTMLElement) => {
    flushSync(() => setOpen(id));
    focusItem(itemsOf(button.parentElement?.querySelector(':scope > [role="menu"]') ?? null)[0]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed in a submenu are its own.
    if ((e.target as Element).closest('[role="menu"]') !== e.currentTarget) return;
    const items = itemsOf(e.currentTarget);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const current = items[at];
    const move = (i: number) => {
      e.preventDefault();
      focusItem(items[(i + items.length) % items.length]);
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(at + 1);
      case 'ArrowUp':
        return move(at < 0 ? items.length - 1 : at - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(items.length - 1);
      case 'ArrowRight': {
        e.preventDefault();
        const sub = current?.dataset.sousMenu as SubmenuId | undefined;
        if (sub && current?.getAttribute('aria-disabled') !== 'true') enter(sub, current!);
        return;
      }
      case 'ArrowLeft':
        e.preventDefault();
        if (depth > 0) {
          const parent = e.currentTarget.parentElement?.querySelector<HTMLElement>(':scope > [role="menuitem"]');
          flushSync(() => fabticeMenu.setState({ path: path.slice(0, depth - 1), error: null }));
          focusItem(parent ?? undefined);
        }
        return;
      case 'Escape': {
        e.preventDefault();
        // Never reaches the app's own Escape (which would close a panel or the dialog behind).
        e.stopPropagation();
        if (depth > 0) {
          const parent = e.currentTarget.parentElement?.querySelector<HTMLElement>(':scope > [role="menuitem"]');
          flushSync(() => fabticeMenu.setState({ path: path.slice(0, depth - 1), error: null }));
          focusItem(parent ?? undefined);
        } else onLeave();
        return;
      }
      case 'Tab':
        closeFabticeMenu();
        return;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.key === ' ') return;
        const letter = fold(e.key);
        const order = [...items.slice(at + 1), ...items.slice(0, at + 1)];
        const found = order.find((el) => fold(el.querySelector('.menu-texte')?.textContent ?? '').startsWith(letter));
        if (found) {
          e.preventDefault();
          focusItem(found);
        }
      }
    }
  };

  return (
    <div
      ref={ref}
      id={depth === 0 ? 'menu-fabtice' : undefined}
      role="menu"
      aria-label={label ?? t('menu.label')}
      aria-labelledby={depth === 0 ? 'menu-fabtice-bouton' : undefined}
      className={depth === 0 ? 'fenetre menu-fabtice' : 'fenetre menu-fabtice sous-menu'}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // The mouse reached this submenu: it stays.
      onPointerEnter={depth > 0 ? (e) => e.pointerType === 'mouse' && cancelHover() : undefined}
    >
      {shown.map((n, i) => {
        if (n.kind === 'separator') return <div key={`sep-${i}`} role="separator" className="menu-filet" />;
        if (n.kind === 'recent') return <RecentEntries key="recent" ctx={ctx} />;
        if (n.kind === 'submenu') {
          const enabled = nodeEnabled(n, ctx);
          const isOpen = openId === n.id && enabled;
          return (
            <div key={n.id} role="none" className="menu-ligne">
              <button
                type="button"
                role="menuitem"
                className="menu-entree"
                tabIndex={-1}
                data-sous-menu={n.id}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-disabled={enabled ? undefined : true}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  focusItem(e.currentTarget);
                  hover(enabled ? n.id : null);
                }}
                onClick={(e) => {
                  if (enabled) enter(n.id, e.currentTarget);
                }}
              >
                <span className="menu-texte">{t(n.label)}</span>
                <Arrow />
              </button>
              {isOpen && <MenuList nodes={n.children} depth={depth + 1} ctx={ctx} onLeave={onLeave} label={t(n.label)} />}
            </div>
          );
        }
        const c = COMMANDS[n.id];
        const enabled = c.enabled(ctx);
        return (
          <div key={n.id} role="none" className="menu-ligne">
            <button
              type="button"
              role="menuitem"
              className="menu-entree"
              tabIndex={-1}
              data-commande={n.id}
              aria-disabled={enabled ? undefined : true}
              aria-keyshortcuts={c.shortcut ? (mac ? 'Meta+' : 'Control+') + (c.shortcut.shift ? 'Shift+' : '') + c.shortcut.key.toUpperCase() : undefined}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return;
                focusItem(e.currentTarget);
                hover(null);
              }}
              onClick={() => activate(n.id, ctx)}
            >
              <span className="menu-texte">{c.label(ctx)}</span>
              {c.shortcut && <span className="menu-raccourci">{shortcutText(c.shortcut, mac)}</span>}
            </button>
            {error?.id === n.id && (
              <p className="menu-erreur" role="alert">
                {error.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** « Projets récents ▸ »: the list of the Mac app, or one greyed line when it is empty. */
function RecentEntries({ ctx, sheet = false }: { ctx: CommandContext; sheet?: boolean }) {
  const list = useRecent(true);
  const canOpen = !ctx.blocked && !ctx.busy;
  if (list === null) return null;
  const row = (key: string, content: ReactNode) => (
    <div key={key} role="none" className="menu-ligne">
      {content}
    </div>
  );
  if (list.length === 0) {
    return row(
      'none',
      <button type="button" role="menuitem" className="menu-entree" tabIndex={sheet ? 0 : -1} aria-disabled>
        <span className="menu-texte">{t('menu.recentNone')}</span>
      </button>,
    );
  }
  return (
    <>
      {list.map((p) =>
        row(
          p.token,
          <button
            type="button"
            role="menuitem"
            className="menu-entree menu-recent"
            tabIndex={sheet ? 0 : -1}
            data-recent={projectName(p)}
            title={p.folder}
            aria-disabled={canOpen ? undefined : true}
            onPointerEnter={(e) => {
              if (!sheet && e.pointerType === 'mouse') focusItem(e.currentTarget);
            }}
            onClick={() => {
              if (!canOpen) return;
              closeFabticeMenu();
              void openRecent(p.token);
            }}
          >
            <span className="menu-texte">{projectName(p)}</span>
            {sheet && <small>{p.folder}</small>}
          </button>,
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- phone: the sheet

/** The nodes of the list shown on the phone (the submenus of `path`, one inside the other). */
function levelOf(path: readonly SubmenuId[]): { nodes: readonly MenuNode[]; title: string | null } {
  let nodes: readonly MenuNode[] = FABTICE_MENU;
  let title: string | null = null;
  for (const id of path) {
    const sub = nodes.find((n): n is Extract<MenuNode, { kind: 'submenu' }> => n.kind === 'submenu' && n.id === id);
    if (!sub) break;
    nodes = sub.children;
    title = t(sub.label);
  }
  return { nodes, title };
}

function Sheet({ ref, onLeave }: { ref: React.Ref<HTMLDivElement>; onLeave: () => void }) {
  const ctx = useCommandContext();
  const path = useStore(fabticeMenu, (s) => s.path);
  const error = useStore(fabticeMenu, (s) => s.error);
  const { nodes, title } = levelOf(path);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = offeredNodes(nodes, ctx);
  const back = () => fabticeMenu.setState({ path: path.slice(0, -1), error: null });

  // Each list starts at its top, its first entry ready for the keyboard.
  useLayoutEffect(() => {
    listRef.current?.scrollTo?.({ top: 0 });
    const first = listRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus({ preventScroll: true });
  }, [path.join('/')]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (path.length) back();
    else onLeave();
  };

  return (
    <div ref={ref} className="feuille-menu" role="dialog" aria-modal="true" aria-label={t('menu.label')} onKeyDown={onKeyDown}>
      <div className="feuille-menu-tete">
        {path.length > 0 ? (
          <button type="button" className="feuille-menu-retour" onClick={back}>
            <svg viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 1.5 1.5 6 6 10.5" />
            </svg>
            {t('menu.back')}
          </button>
        ) : (
          <span className="libelle">{t('menu.label')}</span>
        )}
        <button type="button" className="fermer" aria-label={t('menu.close')} onClick={onLeave}>
          <CloseIcon />
        </button>
      </div>
      {title && <h2 className="feuille-menu-titre">{title}</h2>}
      <div ref={listRef} role="menu" aria-label={title ?? t('menu.label')} className="feuille-menu-liste">
        {shown.map((n, i) => {
          if (n.kind === 'separator') return <div key={`sep-${i}`} role="separator" className="menu-filet" />;
          if (n.kind === 'recent') return <RecentEntries key="recent" ctx={ctx} sheet />;
          if (n.kind === 'submenu') {
            const enabled = nodeEnabled(n, ctx);
            return (
              <div key={n.id} role="none" className="menu-ligne">
                <button
                  type="button"
                  role="menuitem"
                  className="menu-entree"
                  data-sous-menu={n.id}
                  aria-haspopup="menu"
                  aria-expanded={false}
                  aria-disabled={enabled ? undefined : true}
                  onClick={() => enabled && fabticeMenu.setState({ path: [...path, n.id], error: null })}
                >
                  <span className="menu-texte">{t(n.label)}</span>
                  <Arrow />
                </button>
              </div>
            );
          }
          const c = COMMANDS[n.id];
          const enabled = c.enabled(ctx);
          return (
            <div key={n.id} role="none" className="menu-ligne">
              <button type="button" role="menuitem" className="menu-entree" data-commande={n.id} aria-disabled={enabled ? undefined : true} onClick={() => activate(n.id, ctx)}>
                <span className="menu-texte">{c.label(ctx)}</span>
              </button>
              {error?.id === n.id && (
                <p className="menu-erreur" role="alert">
                  {error.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

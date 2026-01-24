/**
 * Keyboard Shortcuts Hook
 *
 * Provides keyboard shortcuts for popup interactions:
 * - Esc: Close popup
 * - Enter: Fill fields (when button is focused or no input focused)
 * - Arrow keys: Navigate field toggles
 */

import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  onEscape?: () => void;
  onEnter?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onEscape,
  onEnter,
  enabled = true,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      // Escape: Close popup
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
      }

      // Enter: Fill fields (only if not in an input)
      if (e.key === 'Enter' && onEnter && !isInput) {
        e.preventDefault();
        onEnter();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, onEnter, enabled]);
}

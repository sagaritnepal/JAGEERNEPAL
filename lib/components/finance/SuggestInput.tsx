// lib/components/finance/SuggestInput.tsx
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { readKey } from '../../utils/webKeys';
import { highlightText } from './Highlight';

export interface SuggestOption {
  key: string;
  label: string;
  hint?: string | null;
  /** A small line under the name - for a person, the Ledger type they are filed under. */
  sub?: string | null;
  /** 'add' draws the row as a "+ Add ..." action instead of a match. */
  kind?: 'add';
  /** Figures drawn in the list's `columns`, right-aligned, one per column (in place of `hint`). */
  cells?: { text: string; color?: string }[];
}

/** Columns the list draws as a small table: a title row, then each option's `cells` under them. */
export interface SuggestColumn {
  label: string;
  width: number;
}

export type PickVia = 'enter' | 'tab' | 'click';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  /** Already filtered for the current text - shown while the box is focused and non-empty. */
  options: SuggestOption[];
  onSelectOption: (option: SuggestOption, via: PickVia) => void;
  inputRef?: (el: TextInput | null) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Called for every key the suggestion list didn't consume (Enter, arrows...). */
  onKeyPress?: (e: unknown) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  accent: string;
  inputClassName?: string;
  inputStyle?: StyleProp<TextStyle>;
  /** Small indicator drawn inside the right edge of the box. */
  adornment?: ReactNode;
  adornmentWidth?: number;
  /** One text size down in the suggestion list (the box's own size comes from `inputClassName`). */
  compact?: boolean;
  /** Show the list as soon as the box is focused, even before anything is typed (a pick-from-all box). */
  showWhenEmpty?: boolean;
  /** Enter on a name nobody has takes the list's "Add ... as new" row - the owner then asks for confirmation -
   * instead of passing the typed name on unchecked. */
  enterAddsNew?: boolean;
  /** Draw the list as a small table (name first, then these columns), at least `listMinWidth` wide. */
  columns?: SuggestColumn[];
  listMinWidth?: number;
}

/** A text box with a typeahead list that is fully driven from the keyboard:
 * type to filter, Up/Down to highlight, Enter (or Tab) to take the highlighted
 * suggestion, Esc to dismiss. Anything else is passed on to `onKeyPress`, so
 * the owner can layer its own navigation (Enter = next cell, ...) on top. */
export function SuggestInput({
  value,
  onChangeText,
  options,
  onSelectOption,
  inputRef,
  onFocus,
  onBlur,
  onKeyPress,
  placeholder,
  accessibilityLabel,
  autoFocus,
  accent,
  inputClassName,
  inputStyle,
  adornment,
  adornmentWidth = 0,
  compact,
  showWhenEmpty,
  enterAddsNew,
  columns,
  listMinWidth,
}: Props) {
  // A table list is one size smaller and its rows tighter, so more fits without crowding.
  const small = compact || !!columns;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);

  const visible = open && (showWhenEmpty || value.trim().length > 0) && options.length > 0;
  const activeIndex = Math.min(index, options.length - 1);

  function choose(option: SuggestOption, via: PickVia) {
    setOpen(false);
    setIndex(-1);
    onSelectOption(option, via);
  }

  // Nothing highlighted with the arrows: Enter takes the name that exists - the one exactly as typed, else the
  // first that starts with what was typed, else the first the list has - so half a name and Enter is enough.
  // Tab (`exactOnly`) only takes a name that is exactly as typed, so leaving a new name with Tab never swaps it
  // for someone else. (An "Add ... as new" row is not a name that exists, so it is never taken this way; it is
  // reached when nothing the list has matches.)
  function autoPick(exactOnly = false): SuggestOption | undefined {
    const typed = value.trim().toLowerCase();
    // Nothing typed (a list opened on an empty box): Enter just moves on.
    if (!typed) return undefined;
    const existing = options.filter((o) => o.kind !== 'add');
    const label = (o: SuggestOption) => o.label.trim().toLowerCase();
    const exact = existing.find((o) => label(o) === typed);
    if (exact || exactOnly) return exact;
    return existing.find((o) => label(o).startsWith(typed)) ?? existing[0];
  }

  function handleKeyPress(e: unknown) {
    const k = readKey(e);
    if (visible) {
      if (k.key === 'ArrowDown') {
        k.prevent();
        setIndex(Math.min(activeIndex + 1, options.length - 1));
        return;
      }
      if (k.key === 'ArrowUp' && activeIndex >= 0) {
        k.prevent();
        setIndex(activeIndex - 1);
        return;
      }
      if (k.key === 'Enter' && !k.ctrl) {
        const pick = activeIndex >= 0 ? options[activeIndex] : autoPick();
        if (pick) {
          k.prevent();
          choose(pick, 'enter');
          return;
        }
        // A name nobody has: Enter asks to add it, rather than letting it through unchecked.
        const add = enterAddsNew && activeIndex < 0 ? options.find((o) => o.kind === 'add') : undefined;
        if (add) {
          k.prevent();
          choose(add, 'enter');
          return;
        }
      }
      if (k.key === 'Tab' && !k.shift) {
        const pick = activeIndex >= 0 ? options[activeIndex] : autoPick(true);
        if (pick) {
          choose(pick, 'tab');
          return;
        }
      }
      if (k.key === 'Escape') {
        k.prevent();
        setOpen(false);
        return;
      }
    }
    onKeyPress?.(e);
  }

  return (
    <View style={{ minWidth: 0, zIndex: visible ? 40 : 0 }}>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(v) => {
            setOpen(true);
            setIndex(-1);
            onChangeText(v);
          }}
          onFocus={() => {
            setOpen(true);
            setIndex(-1);
            onFocus?.();
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            onBlur?.();
          }}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          placeholderTextColor="#B2B8C1"
          accessibilityLabel={accessibilityLabel}
          autoFocus={autoFocus}
          selectTextOnFocus
          className={inputClassName}
          style={[inputStyle, adornmentWidth ? { paddingRight: adornmentWidth } : null]}
        />
        {adornment ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: 12 }}>
            {adornment}
          </View>
        ) : null}
      </View>

      {visible && (
        <View
          // Pressing the mouse on a suggestion would first blur the text box -
          // which closes this list before the click lands. Keeping the box
          // focused on mousedown lets the click select the suggestion.
          {...({ onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() } as object)}
          className="rounded-xl border border-gray-200 bg-white py-1"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            ...(listMinWidth ? { minWidth: listMinWidth } : null),
            zIndex: 50,
            marginTop: 2,
            boxShadow: '0 10px 28px rgba(16,24,40,0.14)',
          }}
        >
          {columns && (
            <View className="flex-row items-center border-b border-gray-100 px-3 pb-1 pt-0.5">
              <Text className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Item</Text>
              {columns.map((c) => (
                <Text key={c.label} className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400" style={{ width: c.width }}>
                  {c.label}
                </Text>
              ))}
            </View>
          )}
          <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
            {options.map((o, i) => (
              <Pressable
                key={o.key}
                tabIndex={-1}
                onPress={() => choose(o, 'click')}
                className={`flex-row items-center justify-between px-3 ${columns ? 'py-1.5' : 'py-2'} ${o.kind === 'add' && i > 0 ? 'mt-1 border-t border-gray-100' : ''}`}
                style={{ backgroundColor: i === activeIndex ? `${accent}14` : 'transparent' }}
              >
                {o.kind === 'add' ? (
                  <>
                    <Ionicons name="add-circle" size={16} color={accent} />
                    <Text
                      className={`ml-2 flex-1 font-semibold ${small ? 'text-xs' : 'text-sm'}`}
                      style={{ color: accent }}
                      numberOfLines={1}
                    >
                      {o.label}
                    </Text>
                  </>
                ) : (
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className={`text-gray-900 ${small ? 'text-xs' : 'text-sm'}`} numberOfLines={1}>
                      {highlightText(o.label, value)}
                    </Text>
                    {!!o.sub && (
                      <Text className="text-[10.5px] text-gray-400" numberOfLines={1}>
                        {o.sub}
                      </Text>
                    )}
                  </View>
                )}
                {columns && o.kind !== 'add'
                  ? columns.map((c, ci) => (
                      <Text
                        key={c.label}
                        className="text-right text-[11px] text-gray-500"
                        style={{ width: c.width, color: o.cells?.[ci]?.color, fontVariant: ['tabular-nums'] }}
                        numberOfLines={1}
                      >
                        {o.cells?.[ci]?.text ?? ''}
                      </Text>
                    ))
                  : !!o.hint && <Text className={`ml-2 text-gray-400 ${small ? 'text-[10px]' : 'text-[11px]'}`}>{o.hint}</Text>}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

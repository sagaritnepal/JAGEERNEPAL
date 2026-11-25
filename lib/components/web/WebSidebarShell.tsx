// lib/components/web/WebSidebarShell.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, Modal } from 'react-native';
import { router, usePathname, useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../hooks/useAuth';

export interface WebNavItem {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  // Sub-links shown nested under this item, always visible (no expand/
  // collapse dropdown) - for a section like Finance with several
  // destinations (Payment In, Purchase, Report, ...) that would otherwise
  // mean going back to a dashboard and re-picking a shortcut tile every time.
  // A child can have its own children too (e.g. Report's family of report
  // types under Finance), indented one step further each level down.
  children?: WebNavItem[];
}

/** One row of the nav list, indented by how deep it sits (0 = Home/Finance,
 * 1 = Finance's own children, 2 = a child's own children, ...), and its
 * children drawn the same way one level deeper. Defined outside
 * WebSidebarShell so its identity is stable across renders - an inline
 * component here would remount this whole branch (and its children) on
 * every render instead of just updating it. */
function hasActive(item: WebNavItem, isActive: (href: string) => boolean): boolean {
  return isActive(item.href) || !!item.children?.some((c) => hasActive(c, isActive));
}

function NavRow({
  item,
  depth,
  isActive,
  onNavigate,
  startOpen,
}: {
  item: WebNavItem;
  depth: number;
  isActive: (href: string) => boolean;
  /** A page was picked: the pop-out menu closes itself. */
  onNavigate?: () => void;
  /** This group opens with its list showing (the rail's icon for it was what was clicked). */
  startOpen?: boolean;
}) {
  const active = isActive(item.href);
  const top = depth === 0;
  // A group (Finance, Report) is a dropdown: open while one of its pages is showing; a click on its name
  // opens or closes it (it never leaves the page).
  const insideActive = !!item.children && hasActive(item, isActive);
  const [openState, setOpenState] = useState<boolean | null>(startOpen ? true : null);
  const open = openState ?? insideActive;
  useEffect(() => {
    if (insideActive) setOpenState(null);
  }, [insideActive]);
  return (
    <View>
      <Pressable
        onPress={() => {
          // A group (Finance, Report) has no page of its own here: its name only opens and closes its list.
          if (item.children) {
            setOpenState(!open);
            return;
          }
          router.push(item.href as any);
          onNavigate?.();
        }}
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        aria-current={active ? 'page' : undefined}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: top ? 12 : 10,
          paddingVertical: 10,
          paddingLeft: 14 + depth * 20,
          paddingRight: 14,
          borderRadius: top ? 10 : 8,
          backgroundColor: active ? '#EFF6FF' : 'transparent',
        }}
      >
        <Ionicons
          name={active ? item.icon : (`${item.icon}-outline` as keyof typeof Ionicons.glyphMap)}
          size={top ? 19 : 15}
          color={active ? '#2563EB' : top ? '#6B7280' : '#9CA3AF'}
        />
        <Text
          numberOfLines={top ? undefined : 1}
          style={{ flex: 1, fontSize: top ? 14 : 13, fontWeight: '600', color: active ? '#2563EB' : '#6B7280' }}
        >
          {item.label}
        </Text>
        {!!item.children && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />}
      </Pressable>

      {!!item.children && open && (
        <View style={{ marginTop: 2, marginBottom: 4, gap: 1 }}>
          {item.children.map((child) => (
            <NavRow key={child.href} item={child} depth={depth + 1} isActive={isActive} onNavigate={onNavigate} />
          ))}
        </View>
      )}
    </View>
  );
}

function initialsOf(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/** The Jageer Nepal logo large on a white card, over the page. Clicking outside it, the close button or Esc closes it. */
function LogoPopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!visible || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.6)' }}
      >
        {/* A press on the card itself does not close it - only outside it, or the close button. */}
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, alignItems: 'center', gap: 14, width: '100%', maxWidth: 440 }}
        >
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8} style={{ position: 'absolute', top: 12, right: 12 }}>
            <Ionicons name="close" size={22} color="#6B7280" />
          </Pressable>
          <Image source={require('../../../assets/jageer-logo.png')} style={{ width: '100%', aspectRatio: 1, maxWidth: 360 }} resizeMode="contain" />
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>Jageer Nepal</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// The content column's own max-width - wide enough to actually use laptop
// space (unlike the app-wide 640px WebFrame cap that applies pre-login),
// narrow enough that a plain mobile-first form/list still reads well
// instead of stretching to the sidebar's full remaining width.
export const CONTENT_MAX_WIDTH = 1120;

// Finance's book-style pages (tables, ledgers, the dashboard) fill the space
// beside the sidebar, so the gap on their left and right is just the page's
// own gutter on any laptop or desktop screen. The cap only matters on
// ultra-wide monitors, where an unbounded table would stretch past readable
// width. Only the routes a layout lists in `wideRoutes` get it.
export const WIDE_CONTENT_MAX_WIDTH = 1840;

// Below this viewport width, each _layout.tsx renders plain Tabs (bottom
// bar and all) instead of this shell - a phone browser hitting the website
// is still "web" (Platform.OS === 'web'), but a 240px sidebar plus content
// squeezed into a ~360-400px phone screen has nowhere near enough room and
// collapses into single characters per line. 768px comfortably fits the
// 240px sidebar plus a readable content column beside it.
export const WEB_SIDEBAR_MIN_WIDTH = 768;

/** Web-only desktop shell: a persistent left sidebar (the same sections as
 * the mobile bottom tabs, always visible) beside the actual screen content.
 * Mobile is untouched - each role's _layout.tsx only reaches for this on
 * Platform.OS === 'web', still rendering plain Tabs (bottom bar and all)
 * everywhere else. The Tabs navigator underneath keeps managing real
 * navigation state/headers/hidden routes exactly as before; this only adds
 * a parallel nav rail beside it and hides the now-redundant bottom bar. */
export function WebSidebarShell({
  items,
  roleLabel,
  profileHref,
  wideRoutes,
  children,
}: {
  items: WebNavItem[];
  roleLabel: string;
  /** Where the account block at the bottom leads (the role's profile screen). */
  profileHref?: string;
  /** Route paths (no route group, e.g. '/daybook') whose pages use the wider content column. */
  wideRoutes?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const contentMaxWidth = wideRoutes?.some((r) => pathname === r || pathname.startsWith(`${r}/`))
    ? WIDE_CONTENT_MAX_WIDTH
    : CONTENT_MAX_WIDTH;
  const searchParams = useGlobalSearchParams<Record<string, string>>();
  const profile = useAuthStore((state) => state.profile);
  const [showLogo, setShowLogo] = useState(false);
  // The full menu pops out over the page only when asked for (the rail's menu button, its logo, or a group's
  // icon - then that group's list shows), and closes by itself when a page is picked or outside it is clicked.
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const openMenu = (group: string | null = null) => {
    setOpenGroup(group);
    setMenuOpen(true);
  };
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  // A link in the rail is lit when it, or a page inside it, is open.
  const lit = (item: WebNavItem): boolean => isActive(item.href) || !!item.children?.some((c) => lit(c));

  // Several Finance sub-links share one route with a different `type` query
  // param (Payment In/Out both go to quick-payment, Sales/Purchase/Expenses
  // all go to transactions) - usePathname() never includes the query
  // string, so a plain pathname match would light up both Payment In and
  // Payment Out together. Split the query off the href and compare it
  // against the real URL's params too, so only the one actually open highlights.
  //
  // usePathname() also strips route-group segments (e.g. "(reseller)"),
  // while every href here is written the way router.push needs it, group
  // segment included - comparing them as-is against pathname never matched
  // anything, so nothing in this sidebar (not just the new children) ever
  // actually highlighted. Strip the same segments from the href side before
  // comparing.
  function withoutGroups(path: string): string {
    return path.replace(/\/\([^/]+\)/g, '') || '/';
  }

  function isActive(href: string): boolean {
    const [hrefPathRaw, hrefQuery] = href.split('?');
    const hrefPath = withoutGroups(hrefPathRaw);
    const pathMatches = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
    if (!pathMatches) return false;
    // A link with no query (Transactions) is the plain route - the same route
    // opened with ?type= is one of its siblings (Sales, Purchase, Expenses).
    if (!hrefQuery) return !searchParams.type;
    return Array.from(new URLSearchParams(hrefQuery).entries()).every(
      ([key, value]) => (searchParams[key] ?? '') === value
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#F9FAFB' }}>
      {/* The rail: always there, icons only - the page gets the rest of the width. */}
      <View
        style={{
          width: 64,
          flexShrink: 0,
          backgroundColor: '#fff',
          borderRightWidth: 1,
          borderRightColor: '#E5E7EB',
          paddingVertical: 14,
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Pressable onPress={() => openMenu()} accessibilityRole="button" accessibilityLabel="Open the menu" style={{ marginBottom: 10 }}>
          <Image source={require('../../../assets/jageer-logo.png')} style={{ width: 34, height: 34, borderRadius: 9 }} resizeMode="contain" />
        </Pressable>
        <Pressable
          onPress={() => openMenu()}
          accessibilityRole="button"
          accessibilityLabel="Open the menu"
          style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}
        >
          <Ionicons name="menu" size={22} color="#374151" />
        </Pressable>
        <ScrollView style={{ flex: 1, minHeight: 0, alignSelf: 'stretch' }} contentContainerStyle={{ alignItems: 'center', gap: 4 }} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const on = lit(item);
            return (
              <Pressable
                key={item.href}
                onPress={() => (item.children ? openMenu(item.href) : router.push(item.href as never))}
                accessibilityRole="link"
                accessibilityLabel={item.label}
                aria-label={item.label}
                {...({ title: item.label } as object)}
                style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#EFF6FF' : 'transparent' }}
              >
                <Ionicons name={on ? item.icon : (`${item.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={20} color={on ? '#2563EB' : '#6B7280'} />
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={profileHref ? () => router.push(profileHref as never) : undefined}
          disabled={!profileHref}
          accessibilityLabel="Account and store details"
          {...({ title: profile?.full_name ?? 'Account' } as object)}
          style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{initialsOf(profile?.full_name)}</Text>
        </Pressable>
      </View>

      {/* The full menu, popped out over the page; a click outside it closes it. */}
      {menuOpen && (
        <Pressable
          onPress={closeMenu}
          accessibilityLabel="Close the menu"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40, backgroundColor: 'rgba(15,23,42,0.25)' }}
        />
      )}
      {menuOpen && (
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
          width: 260,
          backgroundColor: '#fff',
          borderRightWidth: 1,
          borderRightColor: '#E5E7EB',
          paddingTop: 20,
          paddingBottom: 14,
          paddingHorizontal: 14,
          boxShadow: '0 10px 40px rgba(15,23,42,0.18)',
        } as object}
      >
        {/* The brand mark: the app's own logo and name. The logo opens large in a popup; the name goes back
            to the role's first page (the Dashboard for a reseller). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 20 }}>
          <Pressable onPress={() => setShowLogo(true)} accessibilityRole="button" accessibilityLabel="View the logo">
            <Image source={require('../../../assets/jageer-logo.png')} style={{ width: 34, height: 34, borderRadius: 9 }} resizeMode="contain" />
          </Pressable>
          <Pressable
            onPress={() => {
              if (items[0]) router.push(items[0].href as never);
              closeMenu();
            }}
            accessibilityRole="link"
            accessibilityLabel="Go to the dashboard"
            style={{ flex: 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Jageer Nepal</Text>
          </Pressable>
          <Pressable onPress={closeMenu} hitSlop={8} accessibilityLabel="Close the menu">
            <Ionicons name="close" size={20} color="#6B7280" />
          </Pressable>
        </View>

        {/* The nav list scrolls on its own (minHeight: 0 lets a flex child
            shrink below its content), so a long open submenu like Finance's
            can never push the account block below the fold - it stays
            pinned at the bottom of the panel instead. */}
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ gap: 2 }}
          showsVerticalScrollIndicator={false}
        >
          {/* A parent (Finance, Report, ...) is "active" only by its own href, not by
              whichever descendant route is open - that one carries its own highlight
              instead, so the parent doesn't stay lit up while browsing a child. */}
          {items.map((item) => (
            <NavRow key={item.href} item={item} depth={0} isActive={isActive} onNavigate={closeMenu} startOpen={openGroup === item.href} />
          ))}
        </ScrollView>

        <Pressable
          onPress={
            profileHref
              ? () => {
                  router.push(profileHref as any);
                  closeMenu();
                }
              : undefined
          }
          disabled={!profileHref}
          accessibilityLabel="Account and store details"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 8,
            paddingTop: 12,
            paddingHorizontal: 8,
            borderTopWidth: 1,
            borderTopColor: '#F3F4F6',
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              backgroundColor: '#2563EB',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{initialsOf(profile?.full_name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
              {profile?.full_name ?? 'Account'}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>{roleLabel}</Text>
          </View>
        </Pressable>
      </View>
      )}
      <LogoPopup visible={showLogo} onClose={() => setShowLogo(false)} />

      {/* `alignItems: 'center'` here (rather than `marginHorizontal: 'auto'`
          on the capped child) made the capped child fall back to
          content-based sizing on react-native-web instead of filling the
          row's remaining space - `flex-row` children collapsed to a sliver
          just wide enough for one category icon, wrapping every subsequent
          word/icon onto its own line. Default `alignItems: 'stretch'` (by
          simply not setting it) lets the child fill available width first,
          then centers within that via auto margins. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flex: 1, width: '100%', maxWidth: contentMaxWidth, marginHorizontal: 'auto' }}>
          {children}
        </View>
      </View>
    </View>
  );
}

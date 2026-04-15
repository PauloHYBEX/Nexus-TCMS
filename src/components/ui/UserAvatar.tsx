import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ProfileData {
  display_name?: string | null;
  avatar_url?: string | null;
}

const cache = new Map<string, ProfileData>();
const pending = new Map<string, Promise<ProfileData>>();

async function fetchProfileData(userId: string): Promise<ProfileData> {
  if (cache.has(userId)) return cache.get(userId)!;
  if (pending.has(userId)) return pending.get(userId)!;
  const p = (async (): Promise<ProfileData> => {
    try {
      const { data } = await supabase
        .from('profiles' as any)
        .select('display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        const r: ProfileData = { display_name: (data as any).display_name, avatar_url: (data as any).avatar_url };
        cache.set(userId, r);
        return r;
      }
    } catch {}
    try {
      const { data: a } = await supabase.auth.getUser();
      if (a?.user?.id === userId) {
        const r: ProfileData = {
          display_name: (a.user.user_metadata as any)?.full_name || a.user.email,
          avatar_url: (a.user.user_metadata as any)?.avatar_url,
        };
        cache.set(userId, r);
        return r;
      }
    } catch {}
    const empty: ProfileData = {};
    cache.set(userId, empty);
    return empty;
  })();
  pending.set(userId, p);
  p.finally(() => pending.delete(userId));
  return p;
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/[\s@._-]+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-fuchsia-500', 'bg-sky-500', 'bg-lime-600', 'bg-orange-500',
];

function colorCls(seed: string): string {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) & 0xffff;
  return COLORS[n % COLORS.length];
}

/** Clears the profile cache and notifies all mounted UserAvatar components to re-fetch */
export function invalidateUserAvatarCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
  window.dispatchEvent(new CustomEvent('avatarCacheInvalidated', { detail: { userId } }));
}

interface UserAvatarProps {
  /** UUID of the user — will fetch display_name + avatar_url from profiles table */
  userId?: string;
  /** Fallback plain name/label when userId is not provided */
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const UserAvatar = ({ userId, name, size = 'sm', className }: UserAvatarProps) => {
  const [profileData, setProfileData] = useState<ProfileData | null>(() =>
    userId && cache.has(userId) ? cache.get(userId)! : null
  );
  const [fetchVersion, setFetchVersion] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) {
        setFetchVersion((v) => v + 1);
      }
    };
    window.addEventListener('avatarCacheInvalidated', handler);
    return () => window.removeEventListener('avatarCacheInvalidated', handler);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchProfileData(userId).then((d) => { if (alive) setProfileData(d); });
    return () => { alive = false; };
  }, [userId, fetchVersion]);

  const displayName =
    (userId ? profileData?.display_name : undefined) ||
    name ||
    '?';

  const initials = getInitials(displayName);
  const fallbackColor = colorCls(displayName);
  const sizeCls = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs';

  return (
    <Avatar className={cn(sizeCls, 'flex-shrink-0', className)} title={displayName}>
      {userId && profileData?.avatar_url && (
        <AvatarImage src={profileData.avatar_url} alt={displayName} />
      )}
      <AvatarFallback className={cn('font-bold text-white', fallbackColor)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};

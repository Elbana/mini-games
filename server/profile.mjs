const AVATARS = ['star', 'candy', 'fox', 'cat', 'bear', 'frog', 'alien', 'crown', 'fish', 'sprout', 'bolt', 'ghost'];

export function cleanName(value) {
  const name = String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return name;
}

export function cleanAvatar(value) {
  const raw = String(value || '').trim();
  if (AVATARS.includes(raw)) return raw;
  if (/^https:\/\/\S{8,300}$/.test(raw)) return raw;
  return 'star';
}

export function readProfile(session) {
  const profile = session?.profile || {};
  return {
    name: cleanName(profile.name),
    avatar: cleanAvatar(profile.avatar),
  };
}

export function writeProfile(session, input) {
  const next = {
    name: cleanName(input?.name),
    avatar: cleanAvatar(input?.avatar || session?.profile?.avatar),
  };
  session.profile = next;
  return next;
}

export function displayName(session) {
  return readProfile(session).name || 'Player';
}

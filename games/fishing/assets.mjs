/** Load manifest and resolve swappable asset URLs. */
export async function loadFishingManifest() {
  try {
    const res = await fetch('/fishing/assets/manifest.json');
    if (!res.ok) throw new Error('manifest missing');
    return res.json();
  } catch {
    return { fish: {}, bait: {}, background: {}, ui: {}, sounds: {} };
  }
}

export function baitImage(manifest, baitId) {
  return manifest?.bait?.[baitId] || null;
}

export function fishImage(manifest, fishId) {
  return manifest?.fish?.[fishId] || null;
}

export function waterBackground(manifest) {
  return manifest?.background?.water || '/fishing/assets/images/water.jpg';
}

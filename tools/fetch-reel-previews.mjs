const sounds = [
  { id: 509902, url: 'https://freesound.org/people/tosha73/sounds/509902/' },
  { id: 440956, url: 'https://freesound.org/people/l_q/sounds/440956/' },
  { id: 789552, url: 'https://freesound.org/people/Omiranda14/sounds/789552/' },
  { id: 789553, url: 'https://freesound.org/people/Omiranda14/sounds/789553/' },
  { id: 408252, url: 'https://freesound.org/people/170129/sounds/408252/' },
  { id: 326105, url: 'https://freesound.org/people/LuannWepener/sounds/326105/' },
];
const outDir = new URL('../games/fishing/assets/sounds/_dl/', import.meta.url);
const fs = await import('node:fs/promises');

for (const { id, url: pageUrl } of sounds) {
  try {
    const res = await fetch(pageUrl);
    const html = await res.text();
    const m = html.match(/cdn\.freesound\.org\/previews\/\d+\/\d+_[^"']+-lq\.mp3/);
    if (!m) {
      console.log(`${id}: no preview (${html.length} bytes)`);
      continue;
    }
    const url = `https://${m[0]}`;
    const hq = url.replace('-lq.mp3', '-hq.mp3');
    let audio = await fetch(hq);
    if (!audio.ok) audio = await fetch(url);
    if (!audio.ok) {
      console.log(`${id}: download failed ${audio.status}`);
      continue;
    }
    const buf = Buffer.from(await audio.arrayBuffer());
    const path = new URL(`freesound-${id}.mp3`, outDir);
    await fs.writeFile(path, buf);
    console.log(`${id}: OK ${buf.length} bytes`);
  } catch (e) {
    console.log(`${id}: err ${e.message}`);
  }
}

const ids = [509902, 440956, 789552, 789553, 408252, 326105];
for (const id of ids) {
  const res = await fetch(`https://freesound.org/s/${id}/`);
  const html = await res.text();
  const title = html.match(/<title>Freesound - ([^<]+) by/)?.[1] || '?';
  const license = html.includes('Creative Commons Zero') ? 'CC0' : html.includes('Attribution') ? 'CC-BY' : '?';
  console.log(id, license, title);
}

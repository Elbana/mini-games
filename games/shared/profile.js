(function () {
  const FACES = {
    star: ['🌟', '#7c4dff'],
    candy: ['🍭', '#ff6bcb'],
    fox: ['🦊', '#ff9f43'],
    cat: ['🐱', '#ffd56e'],
    bear: ['🐻', '#c47a4a'],
    frog: ['🐸', '#5dffb0'],
    alien: ['👾', '#6ecbff'],
    crown: ['👑', '#ffe08a'],
    fish: ['🐟', '#3db7ff'],
    sprout: ['🌱', '#7dffb2'],
    bolt: ['⚡', '#ffb15a'],
    ghost: ['👻', '#d7d3ff'],
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function faceHtml(avatar, label) {
    if (String(avatar).startsWith('https://')) {
      return `<img class="player-face-img" src="${escapeHtml(avatar)}" alt="">`;
    }
    const face = FACES[avatar] || FACES.star;
    return `<span class="player-face" style="background:${face[1]}" aria-hidden="true">${face[0]}</span>`;
  }

  function paint(profile) {
    document.querySelectorAll('.player-chip').forEach((chip) => {
      const name = profile.displayName || 'Player';
      chip.hidden = false;
      chip.dataset.playerId = profile.playerId || '';
      chip.innerHTML = `${faceHtml(profile.avatar, name)}<span class="player-name">${escapeHtml(name)}</span>`;
      chip.setAttribute('aria-label', `Profile, ${name}`);
    });
    document.querySelectorAll('.lb-face').forEach((el) => {
      el.innerHTML = faceHtml(el.dataset.avatar || 'star');
    });
  }

  let current = null;

  function sheet(profile) {
    const existing = document.getElementById('profile-sheet');
    if (existing) existing.remove();
    const root = document.createElement('div');
    root.id = 'profile-sheet';
    root.className = 'profile-sheet';
    const faces = Object.entries(FACES)
      .map(
        ([id, face]) =>
          `<button type="button" class="profile-face${id === profile.avatar ? ' selected' : ''}" data-avatar="${id}" style="background:${face[1]}" aria-label="${id}">${face[0]}</button>`
      )
      .join('');
    root.innerHTML = `<div class="profile-card">
      <h2>Your profile</h2>
      <p>This name and picture show in the games and on the rankings.</p>
      <label class="profile-label" for="profile-name">Name</label>
      <input id="profile-name" class="profile-input" maxlength="16" value="${escapeHtml(profile.name || '')}" placeholder="Your name">
      <div class="profile-faces">${faces}</div>
      <div class="profile-actions">
        <button type="button" class="btn btn-ghost" id="profile-cancel">Close</button>
        <button type="button" class="btn btn-gold" id="profile-save">Save</button>
      </div>
    </div>`;
    document.body.appendChild(root);
    let avatar = FACES[profile.avatar] ? profile.avatar : 'star';
    root.querySelectorAll('.profile-face').forEach((btn) => {
      btn.addEventListener('click', () => {
        avatar = btn.dataset.avatar;
        root.querySelectorAll('.profile-face').forEach((el) => el.classList.toggle('selected', el === btn));
      });
    });
    root.querySelector('#profile-cancel').addEventListener('click', () => root.remove());
    root.addEventListener('click', (event) => {
      if (event.target === root) root.remove();
    });
    root.querySelector('#profile-save').addEventListener('click', async () => {
      try {
        const saved = await Arcade.post('/api/v1/profile', {
          name: root.querySelector('#profile-name').value,
          avatar,
        });
        current = saved;
        paint(saved);
        root.remove();
      } catch (err) {
        Arcade.toast(err.message, 'lose');
      }
    });
  }

  async function mount() {
    if (!document.querySelector('.player-chip')) return;
    let profile = { name: '', avatar: 'star', displayName: 'Player', playerId: Arcade.player };
    try {
      profile = await Arcade.get('/api/v1/profile');
      const hintName = Arcade.hintedName || '';
      const hintAvatar = Arcade.hintedAvatar || '';
      if ((hintName && hintName !== profile.name) || (hintAvatar && hintAvatar !== profile.avatar)) {
        profile = await Arcade.post('/api/v1/profile', {
          name: hintName || profile.name,
          avatar: hintAvatar || profile.avatar,
        });
      }
    } catch {
      /* keep the placeholder chip */
    }
    current = profile;
    paint(profile);
    document.querySelectorAll('.player-chip').forEach((chip) => {
      chip.addEventListener('click', () => sheet(current));
    });
  }

  window.ArcadeFaces = { html: faceHtml, paint };
  document.addEventListener('DOMContentLoaded', mount);
})();

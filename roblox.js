// Retire les [préfixes] et (suffixes) puis teste chaque mot comme pseudo Roblox
function candidatsPseudo(pseudo) {
  const propre = pseudo.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, ' ').trim();
  return propre.split(/\s+/).filter(m => /^[A-Za-z0-9_]{3,20}$/.test(m)).slice(0, 3);
}

async function trouverCompteRoblox(pseudoDiscord) {
  for (const nom of candidatsPseudo(pseudoDiscord)) {
    try {
      const res = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [nom], excludeBannedUsers: false }),
      });
      if (!res.ok) continue;
      const { data } = await res.json();
      if (data && data[0]) {
        return { id: data[0].id, nom: data[0].name, affichage: data[0].displayName };
      }
    } catch (err) {
      console.error('Erreur API Roblox :', err);
    }
  }
  return null;
}

async function avatarRoblox(id) {
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`
    );
    const { data } = await res.json();
    return data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

module.exports = { trouverCompteRoblox, avatarRoblox };

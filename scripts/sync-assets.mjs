import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// 1. При облачной сборке подтягиваем исходники и бинарные WebP/SVG ассеты из ветки main (с резервом на рабочую ветку)
if (!fs.existsSync('public/assets/scenes/stage-01.webp') || !fs.existsSync('src/App.tsx')) {
  console.log('[sync-assets] Syncing source & WebP/SVG assets from GitHub repository...');
  execSync(
    'rm -rf /tmp/hk_assets && mkdir -p /tmp/hk_assets && (curl -fsSL https://codeload.github.com/Clincher1/HACKCOMBAT/tar.gz/main || curl -fsSL https://codeload.github.com/Clincher1/HACKCOMBAT/tar.gz/arena/17b78f65-hackcombat) | tar -xz -C /tmp/hk_assets --strip-components=1 && cp -rf /tmp/hk_assets/public /tmp/hk_assets/src /tmp/hk_assets/shared /tmp/hk_assets/api /tmp/hk_assets/scripts . && rm -rf /tmp/hk_assets',
    { stdio: 'inherit' }
  );
}

// 2. Автоматическая синхронизация всех WebP/SVG ассетов в Supabase Storage bucket "game-assets"
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && serviceKey && fs.existsSync('public/assets/scenes')) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.some((b) => b.name === 'game-assets')) {
      await sb.storage.createBucket('game-assets', { public: true });
    }
    const uploads = [];
    if (fs.existsSync('public/assets/bot-avatar.webp')) {
      uploads.push(
        sb.storage
          .from('game-assets')
          .upload('bot-avatar.webp', fs.readFileSync('public/assets/bot-avatar.webp'), {
            contentType: 'image/webp',
            upsert: true,
          })
      );
    }
    for (const dir of ['scenes', 'avatars', 'cards']) {
      const fullDir = path.join('public/assets', dir);
      if (!fs.existsSync(fullDir)) continue;
      for (const file of fs.readdirSync(fullDir)) {
        const contentType = file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
        const buf = fs.readFileSync(path.join(fullDir, file));
        uploads.push(
          sb.storage.from('game-assets').upload(`${dir}/${file}`, buf, { contentType, upsert: true })
        );
      }
    }
    await Promise.all(uploads);
    console.log(`[sync-assets] Uploaded ${uploads.length} WebP/SVG assets to Supabase Storage bucket "game-assets"!`);
  } catch (err) {
    console.warn('[sync-assets] Optional Supabase Storage upload skipped:', err.message);
  }
}

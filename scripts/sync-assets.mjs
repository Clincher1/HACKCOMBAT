import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// 1. При облачной сборке подтягиваем src/ и бинарные WebP/SVG ассеты public/ из ветки GitHub, если они отсутствуют
if (!fs.existsSync('public/assets/scenes/stage-01.webp') || !fs.existsSync('src/App.tsx')) {
  console.log('[sync-assets] Syncing source & WebP/SVG assets from GitHub repository...');
  execSync(
    'rm -rf /tmp/hk_assets && mkdir -p /tmp/hk_assets && curl -fsSL https://codeload.github.com/Clincher1/HACKCOMBAT/tar.gz/arena/ae658c18-hackcombat | tar -xz -C /tmp/hk_assets --strip-components=1 && cp -rn /tmp/hk_assets/public /tmp/hk_assets/src . && rm -rf /tmp/hk_assets',
    { stdio: 'inherit' }
  );
}

// 2. Автоматическая загрузка картинок в Supabase Storage (раздел 6 ТЗ: Supabase Storage + GitHub)
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && serviceKey && fs.existsSync('public/assets/scenes')) {
  try {
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.some((b) => b.name === 'game-assets')) {
      await sb.storage.createBucket('game-assets', { public: true });
    }
    for (const dir of ['scenes', 'avatars', 'cards']) {
      const fullDir = path.join('public/assets', dir);
      if (!fs.existsSync(fullDir)) continue;
      for (const file of fs.readdirSync(fullDir)) {
        const contentType = file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
        const buf = fs.readFileSync(path.join(fullDir, file));
        await sb.storage
          .from('game-assets')
          .upload(`${dir}/${file}`, buf, { contentType, upsert: true });
      }
    }
    console.log('[sync-assets] Uploaded all WebP/SVG assets to Supabase Storage bucket "game-assets"!');
  } catch (err) {
    console.warn('[sync-assets] Optional Supabase Storage upload skipped:', err.message);
  }
}

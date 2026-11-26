#!/usr/bin/env node
/**
 * QA: конфиг выкатки (land-release.yml + vercel.json).
 *
 * Зачем отдельный сьют: `TARGET_BRANCH` — это ветка, в которую workflow делает
 * `git push --force-with-lease` и из которой открывает PR в main. Если однажды
 * кто-то поставит сюда `main` (соблазн большой: «ветка же влита»), пайплайн
 * начнёт пушить в main в обход PR, а `gh pr create --base main --head main`
 * упадёт. Эти проверки ловят такую ошибку до раннера.
 *
 * Запуск: node scripts/qa/release-branch.mjs   (входит в `npm run qa:all`)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

let pass = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS — ${name}${detail ? ` :: ${detail}` : ''}`);
  } else {
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`);
    failures.push(name);
  }
}

let workflow = '';
let vercel = {};
try {
  workflow = read('.github/workflows/land-release.yml');
  vercel = JSON.parse(read('vercel.json'));
} catch (err) {
  check('конфиги выкатки читаются', false, String(err));
}

const branchMatch = workflow.match(/^\s*TARGET_BRANCH:\s*(\S+)\s*$/m);
const target = branchMatch ? branchMatch[1] : '';

check('TARGET_BRANCH задан', target.length > 0, target || 'не найден');
check('TARGET_BRANCH не main и не master', !!target && !['main', 'master'].includes(target), target);
check('TARGET_BRANCH не совпадает с веткой арены',
  !!target && !target.startsWith('arena/'), target);

// force-push обязан идти в TARGET_BRANCH, а не в захардкоженную ветку
check('force-push идёт в $TARGET_BRANCH',
  workflow.includes('git push --force-with-lease origin "HEAD:refs/heads/$TARGET_BRANCH"'));
check('в workflow нет пуша в main',
  !/git push[^\n]*refs\/heads\/main/.test(workflow));
check('workflow запускается только вручную (dispatch), без push-триггера',
  /^on:\s*$/m.test(workflow) && !/^  push:\s*$/m.test(workflow) && /^  workflow_dispatch:\s*$/m.test(workflow));
check('PR открывается из ветки выкатки в main',
  workflow.includes('open_pr "$TARGET_BRANCH" main'));

// vercel: ветка выкатки не должна авто-деплоиться превью
const deploymentEnabled = vercel?.git?.deploymentEnabled ?? {};
check('vercel.json выключает авто-деплой ветки выкатки',
  !!target && deploymentEnabled[target] === false,
  `deploymentEnabled['${target}'] = ${deploymentEnabled[target]}`);

// патч vercel.json внутри workflow берёт ветку из env, а не из хардкода
check('workflow патчит vercel.json через process.env.TARGET_BRANCH',
  workflow.includes("process.env.TARGET_BRANCH"));
check('в workflow не осталось хардкода снесённой ветки v3',
  !workflow.includes("'feat/gameplay-v3'") && !/^\s*TARGET_BRANCH:\s*feat\/gameplay-v3\s*$/m.test(workflow));

console.log(`\nИТОГО: ${pass} pass / ${failures.length} fail`);
if (failures.length === 0) console.log(`RELEASE_QA_OK ${pass}`);
else {
  console.log('Провалы:', failures.join(', '));
  process.exit(1);
}

// 엔진을 index.html 안에 합쳐 한 파일짜리 버전을 만든다 (아티팩트·메신저 공유용).
// 실행: node build.js  →  dist/tycoon.html
'use strict';
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const scene = fs.readFileSync(path.join(__dirname, 'scene.js'), 'utf8');
const scene3d = fs.readFileSync(path.join(__dirname, 'scene3d.js'), 'utf8');
const three = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');
const extra = ['decor.js', 'music.js', 'community.js', 'homeui.js', 'minigame.js'];
const out = html
  .replace('<script src="engine.js"></script>', () => '<script>\n' + engine + '\n</script>')
  .replace('<script src="vendor/three.min.js"></script>', () => '<script>\n' + three + '\n</script>')
  .replace('<script src="scene.js"></script>', () => '<script>\n' + scene + '\n</script>')
  .replace('<script src="scene3d.js"></script>', () => '<script>\n' + scene3d + '\n</script>')
  .replace(', viewport-fit=cover', '');
let out2 = out;
for (const f of extra) { const p = path.join(__dirname, f); out2 = out2.replace(`<script src="${f}"></script>`, () => fs.existsSync(p) ? '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>' : ''); }
if (/<script src=/.test(out2)) throw new Error('engine.js 합치기 실패');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'tycoon.html'), out2);
console.log('dist/tycoon.html', out2.length, 'bytes');

// 엔진을 index.html 안에 합쳐 한 파일짜리 버전을 만든다 (아티팩트·메신저 공유용).
// 실행: node build.js  →  dist/tycoon.html
'use strict';
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const out = html
  .replace('<script src="engine.js"></script>', () => '<script>\n' + engine + '\n</script>')
  .replace(', viewport-fit=cover', '');
if (out.includes('src="engine.js"')) throw new Error('engine.js 합치기 실패');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'tycoon.html'), out);
console.log('dist/tycoon.html', out.length, 'bytes');

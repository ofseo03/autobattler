// 엔진 번들러 — src/*.js 를 순서대로 이어 붙여 하나의 <script> 본문으로 만든다.
// 빌드 도구가 아니라 단순 문자열 결합이다. 산출물은 index.html 에 그대로 붙여 넣는다.
//   node scripts/bundle.js              → dist/engine.js 생성
//   node scripts/bundle.js index.html   → index.html 의 <!-- engine:start --> … <!-- engine:end --> 사이를 교체
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var files = fs.readdirSync(path.join(root, 'src')).filter(function (f) { return /^\d\d_.*\.js$/.test(f); }).sort();
var body = files.map(function (f) { return fs.readFileSync(path.join(root, 'src', f), 'utf8').trim(); }).join('\n\n');
var target = process.argv[2];
if (!target) {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'engine.js'), body + '\n');
  console.log('dist/engine.js (' + files.length + ' files, ' + body.length + ' bytes)');
} else {
  var html = fs.readFileSync(path.join(root, target), 'utf8');
  var start = '<!-- engine:start -->', end = '<!-- engine:end -->';
  var a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error(target + ' 에 ' + start + ' / ' + end + ' 마커가 없습니다'); process.exit(1); }
  var out = html.slice(0, a + start.length) + '\n<script>\n' + body + '\n</script>\n' + html.slice(b);
  fs.writeFileSync(path.join(root, target), out);
  console.log(target + ' 엔진 교체 완료');
}

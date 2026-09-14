// Node 에서 엔진 전체를 불러오는 헬퍼 (브라우저에서는 index.html 이 같은 순서로 <script> 포함)
'use strict';
var path = require('path');
['01_constants', '02_state', '03_generator', '04_synergy', '05_sim', '06_game'].forEach(function (f) {
  require(path.join(__dirname, '..', 'src', f + '.js'));
});
module.exports = globalThis.AB;

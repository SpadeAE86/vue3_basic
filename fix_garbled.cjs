const fs = require('fs');
const path = 'src/components/video_match/VideoMatchShotsTable.vue';
let content = fs.readFileSync(path, 'utf-8');

const replacements = {
  'label="鍙ｆ挱鏂囨"': 'label="口播文案"',
  'label="鍖归厤鐘舵€? width="96"': 'label="匹配状态" width="96"',
  'label="鏃堕暱(s)"': 'label="时长(s)"',
  'label="鍙ｆ挱闊抽 (OBS)"': 'label="口播音频 (OBS)"',
  '鐢熸垚鏈楄': '生成朗读',
  '閲嶆柊鐢熸垚鏈楄': '重新生成朗读',
  'label="鐢婚潰鎻忚堪"': 'label="画面描述"',
  '鏈垎闀滄绱㈤摼璺€楁椂锛堟绉掞紝鍚帓闃燂級': '本分镜检索链路耗时（毫秒，含排队）',
  '<span>鑰楁椂</span>': '<span>耗时</span>',
  'label="Top1 瑙嗛"': 'label="Top1 视频"',
  '鍛戒腑 {{ row.match_hit_count }} 鏉?': '命中 {{ row.match_hit_count }} 条',
  'label="杞啓鎿嶄綔"': 'label="转写操作"',
  '鏌ョ湅杞啓': '查看转写',
  'label="鍖归厤鎿嶄綔"': 'label="匹配操作"',
  '鏌ョ湅鍖归厤': '查看匹配',
  '閲嶈瘯': '重试',
  '鐢ㄦ湰鍒嗛暅鏍囩涓庡綋鏃跺尮閰嶇瓥鐣ユ墦寮€瑙嗛鍒嗘瀽锛屽苟鑷姩鍏ㄥ簱鎼滅储': '用本分镜标签与当时匹配策略打开视频分析，并自动全库搜索',
  '璺宠浆瑙嗛鍒嗘瀽': '跳转视频分析',
  '鈥?': '—'
};

for (const [bad, good] of Object.entries(replacements)) {
  content = content.split(bad).join(good);
}

fs.writeFileSync(path, content, 'utf-8');
console.log('Fixed garbled text!');

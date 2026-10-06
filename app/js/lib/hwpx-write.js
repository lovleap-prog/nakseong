// 결재용 한글 문서(.hwpx) 생성 — OWPML 최소 구성.
// 줄글(나이스 결재 본문)과 표(주간활동계획·월중계획 서식) 둘 다 만든다.
// 표는 실제 학교 문서의 hp:tbl 구조를 그대로 본떴다. 칸 병합(rowSpan·colSpan)까지 낸다.
// 그래도 안 열리는 한글 버전이 있을 수 있어 buildHtmlForHwp() 폴백을 함께 둔다.
import { zip } from './zip.js';
import { TIGHT_PCT } from './fitline.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\u0000/g, '');

const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];

function fontfaces(hangul, latin) {
  return `<hh:fontfaces itemCnt="${LANGS.length}">` + LANGS.map((lang) => {
    const face = lang === 'LATIN' ? latin : hangul;
    return `<hh:fontface lang="${lang}" fontCnt="1">` +
      `<hh:font id="0" face="${esc(face)}" type="TTF" isEmbedded="0">` +
      `<hh:typeInfo familyType="FCAT_UNKNOWN" serifStyle="OSS_UNKNOWN" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/>` +
      `</hh:font></hh:fontface>`;
  }).join('') + `</hh:fontfaces>`;
}

/**
 * 글자 모양: 0=본문, 1=제목(굵게·크게), 2=작은 글씨, 3=머리글(굵게),
 *            4·5=본문을 자간만 좁힌 것 (한두 글자가 넘치는 칸을 한 줄에 앉힌다)
 */
function charProperties(baseSize) {
  const pr = (id, height, bold, spacing = 0) =>
    `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
    `<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
    `<hh:spacing hangul="${spacing}" latin="${spacing}" hanja="${spacing}" japanese="${spacing}" other="${spacing}" symbol="${spacing}" user="${spacing}"/>` +
    `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
    `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    (bold ? '<hh:bold/>' : '') +
    `</hh:charPr>`;
  const tight = TIGHT_PCT.slice(1)
    .map((pct, i) => pr(TIGHT_BASE + i, baseSize, false, pct)).join('');
  return `<hh:charProperties itemCnt="${4 + TIGHT_PCT.length - 1}">` +
    `${pr(0, baseSize, false)}${pr(1, Math.round(baseSize * 1.35), true)}` +
    `${pr(2, Math.round(baseSize * 0.85), false)}${pr(3, baseSize, true)}${tight}</hh:charProperties>`;
}

/** 자간을 좁힌 글자 모양의 첫 번호. 0~3 은 이미 쓰고 있다. */
const TIGHT_BASE = 4;
/** 이 칸이 쓸 글자 모양 번호 */
const charPrOf = (x) => (x.tight > 0 && x.tight < TIGHT_PCT.length ? TIGHT_BASE + x.tight - 1 : 0);

/** 문단 모양: 0=왼쪽, 1=가운데 */
function paraProperties() {
  const pr = (id, align) =>
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
    `<hh:align horizontal="${align}" vertical="BASELINE"/>` +
    `<hh:heading type="NONE" idRef="0" level="0"/>` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
    `<hh:switch><hh:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
    `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:case>` +
    `<hh:default>` +
    `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:default></hh:switch>` +
    `<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
    `</hh:paraPr>`;
  return `<hh:paraProperties itemCnt="2">${pr(0, 'JUSTIFY')}${pr(1, 'CENTER')}</hh:paraProperties>`;
}

function headerXml(opt) {
  const base = Math.round((opt.fontSize || 11) * 100);
  return XMLH +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" version="1.4" secCnt="1">` +
    `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>` +
    `<hh:refList>` +
    fontfaces(opt.font || '함초롬바탕', opt.fontLatin || '함초롬바탕') +
    `<hh:borderFills itemCnt="${1 + BF_COMBOS.length}">` +
      borderFill(1, { type: 'NONE' }) +
      BF_COMBOS.map((k, i) => borderFill(BF_BASE + i, k)).join('') +
    `</hh:borderFills>` +
    charProperties(base) +
    `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
    `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">` +
      [1, 2, 3, 4, 5, 6, 7].map((l) =>
        `<hh:paraHead start="1" level="${l}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^${l}.</hh:paraHead>`).join('') +
    `</hh:numbering></hh:numberings>` +
    paraProperties() +
    `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>` +
    `</hh:refList>` +
    `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>` +
    `</hh:head>`;
}

// 한 칸의 테두리·바탕 조합. 하루에 활동이 둘 이상이면 그 사이를 점선으로 끊고
// 한 줄 걸러 옅은 바탕을 깔아, 어디까지가 같은 날인지 눈으로 바로 잡히게 한다.
// 학교에서 쓰는 실제 주간계획 문서도 꼭 이 방식(DASH + winBrush)으로 되어 있다.
// 칸 바탕색. 회색 하나뿐이었는데, 출장 줄과 방과후 줄을 갈라 보여야 해서 셋으로 늘렸다.
// 결재 문서라 색은 아주 옅게 — 흑백으로 뽑아도 글씨가 묻히지 않을 만큼만.
export const SHADES = ['', 'grey', 'yellow', 'blue'];
const SHADE_COLOR = { grey: '#F2F2F2', yellow: '#FFF7D6', blue: '#EAF1FA' };
/** 옛 자료의 shade:true 는 회색으로 본다. */
const shadeIdx = (v) => {
  if (!v) return 0;
  if (v === true) return 1;
  const i = SHADES.indexOf(v);
  return i < 0 ? 1 : i;
};
const BF_BASE = 2;
// 번호를 고정하려고 열여섯 가지를 모두 미리 적어 둔다. 머리글은 본문과 따로 만들어지니
// 쓰인 것만 골라 담을 수가 없다. 칸 하나가 고르는 번호는 bfIdOf() 가 같은 순서로 셈한다.
const BF_COMBOS = [...Array(16).keys()].map((n) => ({
  type: 'SOLID',
  dashTop: !!(n & 1),
  dashBottom: !!(n & 2),
  shade: SHADES[(n >> 2) & 3],
}));

/** 칸이 쓸 borderFill 번호. BF_COMBOS 의 차례와 반드시 같아야 한다. */
export function bfIdOf(x) {
  if (!x) return BF_BASE;
  return BF_BASE + (x.dashTop ? 1 : 0) + (x.dashBottom ? 2 : 0) + shadeIdx(x.shade) * 4;
}

function borderFill(id, k) {
  const line = (dir, type) => `<hh:${dir} type="${type}" width="0.12 mm" color="#000000"/>`;
  const t = k.type || 'SOLID';
  const fill = k.shade
    ? `<hc:fillBrush><hc:winBrush faceColor="${SHADE_COLOR[k.shade] || SHADE_COLOR.grey}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`
    : '';
  return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    line('leftBorder', t) + line('rightBorder', t) +
    line('topBorder', k.dashTop ? 'DASH' : t) + line('bottomBorder', k.dashBottom ? 'DASH' : t) +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` + fill + `</hh:borderFill>`;
}

const LINESEG = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>';

function secPr(opt = {}) {
  return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
    `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strtnum="0"/>` +
    `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
    `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
    `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
    `<hp:pagePr landscape="WIDELY" width="${PAGE_W}" height="${PAGE_H}" gutterType="LEFT_ONLY">` +
      `<hp:margin header="2834" footer="2834" gutter="0" left="${opt.marginX || 8504}" right="${opt.marginX || 8504}" top="${opt.marginY || 5668}" bottom="${opt.marginY || 4252}"/></hp:pagePr>` +
    `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
      `<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>` +
      `<hp:noteSpacing betweenNotes="850" belowLine="567" aboveLine="850"/>` +
      `<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
    `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
      `<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>` +
      `<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>` +
      `<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
    ['BOTH', 'EVEN', 'ODD'].map((t) =>
      `<hp:pageBorderFill type="${t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">` +
      `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`).join('') +
    `</hp:secPr>`;
}

/** 문단 하나. kind: 'title' | 'body' | 'small' */
function para(id, text, kind = 'body', first = false, opt = {}, brk) {
  const charPr = kind === 'title' || kind === 'banner' ? 1 : kind === 'small' ? 2 : 0;
  const paraPr = kind === 'title' || kind === 'banner' ? 1 : 0;
  const inner = first ? firstCtrl(opt) : '';
  const t = text ? `<hp:t>${esc(text)}</hp:t>` : '<hp:t></hp:t>';
  // brk 를 켜면 이 문단부터 새 쪽에서 시작한다. 주간 서식의 교과교담 시간표가 쓴다.
  return `<hp:p id="${id}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="${brk ? 1 : 0}" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${charPr}">${inner}${t}</hp:run>${LINESEG}</hp:p>`;
}

// ── 표(hp:tbl) ─────────────────────────────────────────────
// A4 세로, HWPUNIT(1/7200인치) 기준. 210mm = 59528.
const PAGE_W = 59528;
const PAGE_H = 84188;

/** 칸 배치를 격자에 앉혀 colAddr/rowAddr 을 구한다. 세로 병합된 자리는 건너뛴다. */
function layoutCells(rows, colCount) {
  const taken = new Set();
  return rows.map((row, r) => {
    let c = 0;
    return row.map((raw) => {
      const x = cellOf(raw);
      while (taken.has(`${r},${c}`) && c < colCount) c++;
      const at = { ...x, r, c };
      for (let dr = 0; dr < x.rowSpan; dr++) {
        for (let dc = 0; dc < x.colSpan; dc++) taken.add(`${r + dr},${c + dc}`);
      }
      c += x.colSpan;
      return at;
    });
  });
}

function tblXml(t, opt, id) {
  const fs = opt.fontSize || 11;
  const usable = PAGE_W - (opt.marginX || 4251) * 2;
  const head = (t.head || []).length ? [t.head] : [];
  const all = [...head, ...(t.rows || [])];
  const colCount = (t.cols || []).length
    || all.reduce((m, r) => Math.max(m, r.reduce((n, c) => n + cellOf(c).colSpan, 0)), 1);

  // 열 너비: 비율(%)을 HWPUNIT 으로 바꾸고 반올림 오차는 마지막 열이 흡수한다.
  const pct = (t.cols && t.cols.length === colCount) ? t.cols : Array(colCount).fill(100 / colCount);
  const colW = pct.map((p) => Math.round((usable * p) / 100));
  colW[colCount - 1] = usable - colW.slice(0, -1).reduce((a, b) => a + b, 0);

  const grid = layoutCells(all, colCount);
  const lineH = Math.round(fs * 100 * 1.35);
  const rowH = grid.map((row) => {
    const n = row.reduce((m, x) => (x.rowSpan === 1 ? Math.max(m, x.t.split('\n').length) : m), 1);
    return n * lineH + 568;
  });
  const tblH = rowH.reduce((a, b) => a + b, 0);

  const span = (arr, from, n) => arr.slice(from, from + n).reduce((a, b) => a + b, 0);
  const isHead = (r) => head.length && r === 0;

  const trs = grid.map((row, r) => '<hp:tr>' + row.map((x) => {
    const paras = x.t.split('\n');
    const paraPr = x.align === 'left' ? 0 : 1;
    const charPr = isHead(r) ? 3 : charPrOf(x);
    const inner = paras.map((line) =>
      `<hp:p id="2147483648" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
      `<hp:run charPrIDRef="${charPr}"><hp:t>${esc(line)}</hp:t></hp:run>${LINESEG}</hp:p>`).join('');
    return `<hp:tc name="" header="${isHead(r) ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bfIdOf(isHead(r) ? { ...x, shade: 'grey' } : x)}">` +
      `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
      inner + `</hp:subList>` +
      `<hp:cellAddr colAddr="${x.c}" rowAddr="${x.r}"/>` +
      `<hp:cellSpan colSpan="${x.colSpan}" rowSpan="${x.rowSpan}"/>` +
      `<hp:cellSz width="${span(colW, x.c, x.colSpan)}" height="${span(rowH, x.r, x.rowSpan)}"/>` +
      `<hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
  }).join('') + '</hp:tr>').join('');

  return `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" ` +
    `lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${grid.length}" colCnt="${colCount}" ` +
    `cellSpacing="0" borderFillIDRef="2" noAdjust="0">` +
    `<hp:sz width="${usable}" widthRelTo="ABSOLUTE" height="${tblH}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" ` +
    `vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="141"/>` +
    `<hp:inMargin left="141" right="141" top="141" bottom="141"/>` +
    trs + `</hp:tbl>`;
}

const firstCtrl = (opt) =>
  `${secPr(opt)}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;

/** 표 하나를 담은 문단 */
function tablePara(id, table, opt, first) {
  return `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="0">${first ? firstCtrl(opt) : ''}${tblXml(table, opt, 1000 + id)}</hp:run>${LINESEG}</hp:p>`;
}

function sectionXml(blocks, opt = {}) {
  const body = blocks.map((b, i) => (b.kind === 'table'
    ? tablePara(i, b.table, opt, i === 0)
    : para(i, b.text, b.kind, i === 0, opt, !!b.brk))).join('');
  return XMLH +
    `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">` +
    body + `</hs:sec>`;
}

const CONTAINER = XMLH +
  `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">` +
  `<ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`;

const MANIFEST = XMLH +
  `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" version="1.0">` +
  `<odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>` +
  `<odf:file-entry odf:full-path="Contents/content.hpf" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="settings.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="version.xml" odf:media-type="application/xml"/>` +
  `</odf:manifest>`;

const VERSION = XMLH +
  `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" ` +
  `major="5" minor="0" micro="5" buildNumber="0" os="10" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="9, 0, 0, 0"/>`;

const SETTINGS = XMLH +
  `<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="http://www.hancom.co.kr/hwpml/2011/config-item">` +
  `<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`;

function contentHpf(title) {
  return XMLH +
    `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${esc(title)}</opf:title><opf:language>ko</opf:language>` +
    `<opf:meta name="creator" content="학교 교육활동 관리"/></opf:metadata>` +
    `<opf:manifest>` +
    `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
    `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>` +
    `<opf:item id="settings" href="settings.xml" media-type="application/xml"/>` +
    `</opf:manifest>` +
    `<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>` +
    `</opf:package>`;
}

/**
 * 줄글 텍스트 → .hwpx Blob
 * @param {string} text  줄바꿈으로 구분된 본문
 * @param {object} opt   { title, font, fontSize, titleLine }
 */
export async function buildHwpx(text, opt = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  if (opt.titleLine) { blocks.push({ text: opt.titleLine, kind: 'title' }); blocks.push({ text: '', kind: 'body' }); }
  for (const l of lines) blocks.push({ text: l, kind: 'body' });
  if (!blocks.length) blocks.push({ text: '', kind: 'body' });

  return zip([
    // mimetype 은 반드시 첫 항목 + 무압축이어야 한다.
    { name: 'mimetype', data: 'application/hwp+zip', store: true },
    { name: 'version.xml', data: VERSION },
    { name: 'settings.xml', data: SETTINGS },
    { name: 'META-INF/container.xml', data: CONTAINER },
    { name: 'META-INF/manifest.xml', data: MANIFEST },
    { name: 'Contents/content.hpf', data: contentHpf(opt.title || '교육활동') },
    { name: 'Contents/header.xml', data: headerXml(opt) },
    { name: 'Contents/section0.xml', data: sectionXml(blocks, opt) },
  ]);
}

/**
 * 표가 들어간 .hwpx — 주간활동계획 · 월중계획 서식에 쓴다.
 * @param {Array} blocks  [{kind:'title'|'body'|'small'|'banner', text} | {kind:'table', table}]
 * @param {object} opt     { title, font, fontSize, marginX, marginY }
 */
export async function buildHwpxDoc(blocks, opt = {}) {
  const list = blocks.length ? blocks : [{ kind: 'body', text: '' }];
  return zip([
    { name: 'mimetype', data: 'application/hwp+zip', store: true },
    { name: 'version.xml', data: VERSION },
    { name: 'settings.xml', data: SETTINGS },
    { name: 'META-INF/container.xml', data: CONTAINER },
    { name: 'META-INF/manifest.xml', data: MANIFEST },
    { name: 'Contents/content.hpf', data: contentHpf(opt.title || '교육활동') },
    { name: 'Contents/header.xml', data: headerXml(opt) },
    { name: 'Contents/section0.xml', data: sectionXml(list, opt) },
  ]);
}

/**
 * 칸 하나를 { t, rowSpan, colSpan, align, dashTop, dashBottom, shade } 꼴로 맞춘다.
 * 글자만 준 경우도 받는다. dashTop·dashBottom 은 같은 날 안에서 활동을 끊는 점선,
 * shade 는 한 줄 걸러 까는 옅은 바탕(주말·공휴일 칸에도 쓴다).
 */
export function cellOf(c) {
  if (c && typeof c === 'object') {
    return {
      t: String(c.t == null ? '' : c.t),
      rowSpan: c.rowSpan || 1, colSpan: c.colSpan || 1, align: c.align || 'center',
      dashTop: !!c.dashTop, dashBottom: !!c.dashBottom, shade: c.shade || '',
      tight: c.tight || 0,
    };
  }
  return { t: String(c == null ? '' : c), rowSpan: 1, colSpan: 1, align: 'center',
    dashTop: false, dashBottom: false, shade: '', tight: 0 };
}

/**
 * 한글이 확실히 여는 폴백: A4 서식이 들어간 HTML.
 * 한글에서 [불러오기] → 파일 형식 'HTML 문서' 로 열면 표까지 그대로 들어온다.
 * 표는 { cols(너비 %), head, rows } 이고 칸은 글자 또는 { t, rowSpan, colSpan, align } 이다.
 */
export function buildHtmlForHwp({
  title, paragraphs = [], tables = [], blocks = null,
  font = '함초롬바탕', fontSize = 11, margin = '20mm 15mm', showTitle = true,
}) {
  const body = blocks ? blocks.map(blockHtml).join('\n') : [
    showTitle ? `<h1>${esc(title)}</h1>` : '',
    paragraphs.map((p) => `<p>${esc(p) || '&nbsp;'}</p>`).join('\n'),
    tables.map((t) => (t.caption ? `<h2>${esc(t.caption)}</h2>` : '') + tableHtml(t)).join('\n'),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: ${margin}; }
  body { font-family: "${esc(font)}", "맑은 고딕", serif; font-size: ${fontSize}pt; line-height: 1.5; color:#000; }
  h1 { font-size: ${(fontSize * 1.5).toFixed(0)}pt; text-align: center; margin: 0 0 18pt; }
  h2 { font-size: ${(fontSize * 1.1).toFixed(0)}pt; margin: 14pt 0 5pt; }
  p  { margin: 0 0 2pt; white-space: pre-wrap; }
  p.small { font-size: ${(fontSize * 0.9).toFixed(0)}pt; }
  p.banner { text-align:center; font-weight:700; font-size:${(fontSize * 1.4).toFixed(0)}pt;
             border:1px solid #000; padding:8pt 4pt; margin:0 0 8pt; line-height:1.4; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 3pt 4pt; font-size: ${(fontSize * 0.95).toFixed(0)}pt;
           text-align: center; vertical-align: middle; white-space: pre-wrap;
           word-break: keep-all; overflow-wrap: break-word; }
  td.t1 { letter-spacing: -0.04em; }
  td.t2 { letter-spacing: -0.08em; }
  td.l { text-align: left; }
  td.dt { border-top-style: dashed; }
  td.db { border-bottom-style: dashed; }
  td.sh { background: #F2F2F2; }
  td.sh-y { background: #FFF7D6; }
  td.sh-b { background: #EAF1FA; }
  .pb { break-before: page; page-break-before: always; }
  th { background: #eee; }
</style></head>
<body>
${body}
</body></html>`;
}

/** 화면 미리보기·인쇄에 쓰는 본문만(문서 껍데기 없이) */
export function renderBlocksHtml(blocks) {
  return blocks.map(blockHtml).join('\n');
}

/** 칸 바탕색 → CSS 이름 */
const shadeCls = (v) => {
  if (!v) return '';
  const k = v === true ? 'grey' : v;
  return { grey: 'sh', yellow: 'sh-y', blue: 'sh-b' }[k] || 'sh';
};

function blockHtml(b) {
  const pb = b.brk ? ' class="pb"' : '';
  if (b.kind === 'table') return b.brk ? `<div class="pb">${tableHtml(b.table)}</div>` : tableHtml(b.table);
  if (b.kind === 'title') return `<h2${pb}>${esc(b.text)}</h2>`;
  if (b.kind === 'banner') return `<p class="banner">${esc(b.text).replace(/\n/g, '<br>')}</p>`;
  if (b.kind === 'small') return `<p class="small">${esc(b.text) || '&nbsp;'}</p>`;
  return `<p>${esc(b.text) || '&nbsp;'}</p>`;
}

function tableHtml(t) {
  const cells = (r, tag) => r.map((c) => {
    const x = cellOf(c);
    const sp = (x.rowSpan > 1 ? ` rowspan="${x.rowSpan}"` : '') + (x.colSpan > 1 ? ` colspan="${x.colSpan}"` : '');
    const names = [x.align === 'left' ? 'l' : '', x.dashTop ? 'dt' : '',
      x.dashBottom ? 'db' : '', shadeCls(x.shade),
      x.tight ? `t${x.tight}` : ''].filter(Boolean);
    const cls = names.length ? ` class="${names.join(' ')}"` : '';
    return `<${tag}${sp}${cls}>${esc(x.t).replace(/\n/g, '<br>') || '&nbsp;'}</${tag}>`;
  }).join('');
  const colgroup = (t.cols || []).length
    ? `<colgroup>${t.cols.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>` : '';
  const head = (t.head || []).length ? `<thead><tr>${cells(t.head, 'th')}</tr></thead>` : '';
  return `<table>${colgroup}${head}<tbody>${(t.rows || []).map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`;
}

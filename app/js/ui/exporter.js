// 결재 문구 / 메신저 안내 / 한글 파일 내보내기 모달
import { h, openModal, toast, copyText, download } from '../lib/dom.js';
import { dailyPlanText, periodText } from '../lib/neis.js';
import { tripsOn } from '../views/trips.js';
import { dailyTail } from '../links.js';
import { buildHwpx, buildHwpxDoc, buildHtmlForHwp, renderBlocksHtml } from '../lib/hwpx-write.js';
import { weeklyForm, monthlyForm } from '../lib/formdoc.js';
import { dayBundle, periodBundle, afterSchoolFor } from '../select.js';
import { fmtK, parseYmd, WEEKDAY } from '../model.js';
import { loadConfig } from '../config.js';

const fileDate = (d) => String(d).replace(/-/g, '');

export function openDayExport(date) {
  const cfg = loadConfig();
  const bundle = dayBundle(date);
  const school = { ...cfg.school };

  const out = h('textarea', { class: 'input mono', rows: 22, spellcheck: 'false' });

  // 결재용과 메신저용이 사실상 같은 글이라 한 칸으로 합쳤다. 학교가 쓰던 안내문 모양
  // 그대로 내고, 되풀이되는 * · - 문단은 [설정] 의 고정 문구에서 가져온다.
  const render = () => {
    out.value = dailyPlanText({
      date, activities: bundle.activities, trips: tripsOn(date),
      tail: dailyTail(), school,
    });
  };

  const body = h('div', {},
    out,
    h('p', { class: 'muted small' },
      '문구는 바로 고칠 수 있습니다. 고친 내용 그대로 복사·내려받기 됩니다. ',
      '날마다 되풀이되는 아래 문단은 [설정] → 일일 안내문 고정 문구 에서 고칩니다.'));

  render();

  openModal(`${fmtK(date)} 일일교육활동 안내문`, body, [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '복사',
      onClick: async () => {
        const ok = await copyText(out.value);
        toast(ok ? '복사했습니다. 나이스/메신저에 붙여넣으세요.' : '복사에 실패했습니다.', ok ? 'ok' : 'warn');
      },
    },
    {
      label: '한글용 HTML',
      onClick: () => {
        const html = buildHtmlForHwp({
          title: `${fmtK(date)} 일일교육활동`,
          paragraphs: out.value.split('\n').slice(1),
          tables: bundle.afterSchool.length ? [afterSchoolTable(date)] : [],
          font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
        });
        download(`일일교육활동_${fileDate(date)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
        toast('한글에서 [불러오기] → 파일 형식 "HTML 문서"로 열면 됩니다.', 'ok');
      },
    },
    {
      label: '한글(.hwpx)',
      class: 'btn-primary',
      onClick: async () => {
        try {
          const lines = out.value.split('\n');
          const blob = await buildHwpx(lines.slice(1).join('\n'), {
            title: `${fmtK(date)} 일일교육활동`,
            titleLine: lines[0],
            font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
          });
          download(`일일교육활동_${fileDate(date)}.hwpx`, blob);
          toast('내려받았습니다. 열리지 않으면 [한글용 HTML]을 쓰세요.', 'ok');
        } catch (e) {
          console.error(e);
          toast('한글 파일 생성에 실패했습니다: ' + e.message, 'warn');
        }
      },
    },
  ]);
}

function afterSchoolTable(date) {
  const rows = afterSchoolFor(date).map((c) => [c.time || '', c.name || '', c.grade || '', c.room || '', c.teacher || '', c.enrolled || '']);
  return { caption: `방과후학교 운영 현황 (${fmtK(date)})`, head: ['시간', '강좌명', '대상', '장소', '강사', '인원'], rows };
}

/**
 * 주간·월간 내보내기.
 * 기본은 **학교 서식**(표)이다. 결재는 줄글로 못 올리기 때문이다.
 * 줄글 요약은 메신저에 붙일 때 쓰라고 옆 칸에 남겨 두었다.
 * @param {'weekly'|'monthly'} form
 */
export function openPeriodExport(from, to, title, form = 'weekly') {
  const cfg = loadConfig();
  // 주간은 두 판을 낸다. 교담 시간표가 붙은 온판과, 주요 교육활동만 있는 낱장이다.
  // 시간표가 그 주에 바뀔 일이 없으면 굳이 같이 돌리지 않는 분들이 있어서다.
  const full = form === 'monthly' ? monthlyForm(from) : weeklyForm(from, to);
  const lite = form === 'monthly' ? null : weeklyForm(from, to, { timetable: false });
  // 주간은 '주요 활동만' 을 먼저 보여준다. 시간표가 바뀌는 주가 드물어 이쪽을 더 자주 쓴다.
  let doc = lite || full;
  const margin = form === 'monthly' ? '15mm' : '10mm';
  const marginX = form === 'monthly' ? 4251 : 2834;
  const baseName = form === 'monthly' ? '월중교육활동계획' : '주간활동계획';
  const fileName = () =>
    `${baseName}${doc === lite ? '(주요활동)' : ''}_${fileDate(from)}`;

  const days = periodBundle(from, to).filter((d) => d.activities.length || d.recurring.length || d.afterSchool.length);
  const plain = periodText({ from, to, days, title });

  // 서식 미리보기 — 내려받기 전에 눈으로 확인하고 인쇄까지 여기서 한다.
  const sheet = h('div', { class: 'formdoc' });
  const draw = () => { sheet.innerHTML = renderBlocksHtml(doc.blocks); };
  draw();
  const preview = h('div', { class: 'formdoc-wrap' }, sheet);

  const out = h('textarea', { class: 'input mono', rows: 18, spellcheck: 'false' });
  out.value = plain;
  const plainBox = h('div', { style: { display: 'none' } }, out,
    h('p', { class: 'muted small' }, '메신저·게시판에 붙일 때 쓰세요. 결재에는 왼쪽 서식을 쓰십시오.'));

  // 맨 끝 칸이 줄글, 그 앞이 서식이다.
  const TABS = lite ? ['주요 활동만', '학교 서식', '줄글 요약'] : ['학교 서식', '줄글 요약'];
  const DOCS = lite ? [lite, full] : [full];
  const plainIdx = TABS.length - 1;
  const seg = h('div', { class: 'seg' },
    ...TABS.map((t, i) => h('button', {
      class: `seg-btn${i === 0 ? ' on' : ''}`,
      onClick: (e) => {
        for (const b of e.currentTarget.parentNode.children) b.classList.remove('on');
        e.currentTarget.classList.add('on');
        if (i < plainIdx) { doc = DOCS[i]; draw(); }
        preview.style.display = i < plainIdx ? '' : 'none';
        plainBox.style.display = i < plainIdx ? 'none' : '';
      },
    }, t)));

  const body = h('div', {}, seg, preview, plainBox,
    h('p', { class: 'muted small' },
      '승인된 일정만 담깁니다. 대기 중인 건은 먼저 승인해 주세요.'));

  const htmlDoc = () => buildHtmlForHwp({
    title: doc.title, blocks: doc.blocks, margin: `15mm ${margin}`,
    font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
  });

  openModal(`${title} 내보내기`, body, [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '인쇄',
      onClick: () => { printSheet(sheet.innerHTML); },
    },
    {
      label: '복사(줄글)',
      onClick: async () => { await copyText(out.value); toast('줄글 요약을 복사했습니다.', 'ok'); },
    },
    {
      label: '한글용 HTML',
      onClick: () => {
        download(`${fileName()}.html`, new Blob([htmlDoc()], { type: 'text/html;charset=utf-8' }));
        toast('한글에서 [불러오기] → 파일 형식 "HTML 문서"로 열면 표째로 들어옵니다.', 'ok');
      },
    },
    {
      label: '한글(.hwpx)',
      class: 'btn-primary',
      onClick: async () => {
        try {
          const blob = await buildHwpxDoc(doc.blocks, {
            title: doc.title, font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
            marginX, marginY: 2834,
          });
          download(`${fileName()}.hwpx`, blob);
          toast('내려받았습니다. 열리지 않으면 [한글용 HTML]을 쓰세요.', 'ok');
        } catch (e) {
          console.error(e);
          toast('한글 파일 생성에 실패했습니다: ' + e.message, 'warn');
        }
      },
    },
  ]);
}

/**
 * 화면에 있는 서식을 그대로 인쇄한다.
 * 새 창은 휴대폰·회사 브라우저에서 막히는 일이 잦아, 본문 옆에 인쇄용 칸을 만들어 쓴다.
 */
function printSheet(html) {
  const prev = document.getElementById('print-area');
  if (prev) prev.remove();
  const area = h('div', { id: 'print-area' });
  area.innerHTML = html;
  document.body.appendChild(area);
  document.body.classList.add('printing');

  const done = () => {
    document.body.classList.remove('printing');
    const a = document.getElementById('print-area');
    if (a) a.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
}

/** 방과후학교 시간표만 따로 표로 내보내기 */
export function openAfterSchoolExport(programs) {
  const cfg = loadConfig();
  const head = ['요일', '시간', '강좌명', '대상', '장소', '강사', '정원', '현원', '수강료', '비고'];
  const rows = programs.map((p) => [
    (p.weekdays || []).map((w) => WEEKDAY[w]).join('·'),
    p.time || '', p.name || '', p.grade || '', p.room || '', p.teacher || '',
    p.capacity || '', p.enrolled || '', p.fee || '', p.note || '',
  ]);
  const title = `방과후학교 운영 시간표${cfg.school.name ? ` - ${cfg.school.name}` : ''}`;
  const html = buildHtmlForHwp({ title, paragraphs: [], tables: [{ caption: '', head, rows }], font: cfg.hwp.font, fontSize: cfg.hwp.fontSize });

  openModal('방과후학교 시간표 내보내기', h('div', {},
    h('p', {}, `총 ${programs.length}개 강좌를 표로 내보냅니다.`),
    h('p', { class: 'muted small' }, '표가 들어간 문서는 HTML로 내보내 한글에서 여는 쪽이 서식이 가장 깨끗합니다.')), [
    { label: '닫기', onClick: (c) => c() },
    {
      label: 'CSV(엑셀)',
      onClick: () => {
        const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        download('방과후학교시간표.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      },
    },
    {
      label: '한글용 HTML',
      class: 'btn-primary',
      onClick: () => {
        download('방과후학교시간표.html', new Blob([html], { type: 'text/html;charset=utf-8' }));
        toast('한글에서 [불러오기] → "HTML 문서"로 열면 표 그대로 들어옵니다.', 'ok');
      },
    },
  ]);
}

export { parseYmd };

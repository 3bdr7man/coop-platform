<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
security_headers();
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
if (!installed()) { http_response_code(503); exit('المنصة غير مثبّتة.'); }

const CRITERIA = ['الانضباط والحضور في المواعيد', 'الالتزام بأنظمة العمل وتعليماته', 'المهارات الفنية في مجال التخصص', 'سرعة التعلم واكتساب المهارات', 'جودة العمل وإتقانه', 'التعاون والعمل ضمن الفريق', 'التواصل مع الزملاء والرؤساء', 'المبادرة وتحمل المسؤولية', 'تقبّل التوجيهات والملاحظات', 'السلوك والمظهر العام'];
const SCALE = [5 => 'ممتاز', 4 => 'جيد جداً', 3 => 'جيد', 2 => 'مقبول', 1 => 'ضعيف'];
const RECOMMEND = ['أوصي بتوظيفه', 'أوصي به مع التطوير', 'لا أوصي به'];

start_session();
$token = preg_replace('/[^a-f0-9]/', '', (string)($_GET['t'] ?? ''));
$t = strlen($token) === 32 ? one('SELECT id, name, acad, dept, specialty, entity, field_supervisor, field_supervisor_phone FROM trainees WHERE eval_token = ?', [$token]) : null;
$prev = $t ? one('SELECT submitted_at FROM field_evals WHERE trainee_id = ? ORDER BY id DESC LIMIT 1', [$t['id']]) : null;
$err = ''; $ok = false;

if ($t && !$prev && $_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!hash_equals((string)$_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) throw new RuntimeException('انتهت صلاحية الصفحة. حدّثها وأعد تعبئة النموذج.');
        $recent = (int)val('SELECT COUNT(*) FROM field_evals WHERE ip = ? AND submitted_at > (NOW() - INTERVAL 1 HOUR)', [client_ip()]);
        if ($recent > 30) throw new RuntimeException('طلبات كثيرة من نفس الجهاز. أعد المحاولة لاحقاً.');
        $name = mb_substr(trim((string)($_POST['evaluator_name'] ?? '')), 0, 150);
        if ($name === '') throw new RuntimeException('اكتب اسم المقيّم.');
        $scores = [];
        foreach (CRITERIA as $i => $c) {
            $s = (int)($_POST['s' . $i] ?? 0);
            if ($s < 1 || $s > 5) throw new RuntimeException('قيّم جميع البنود قبل الإرسال (البند: ' . $c . ').');
            $scores[] = $s;
        }
        $total = round(array_sum($scores) / (count($scores) * 5) * 100, 1);
        $rec = in_array($_POST['recommend'] ?? '', RECOMMEND, true) ? $_POST['recommend'] : null;
        q('INSERT INTO field_evals (trainee_id, evaluator_name, evaluator_title, evaluator_phone, scores, total, recommend, comments, ip) VALUES (?,?,?,?,?,?,?,?,?)', [
            $t['id'], $name, mb_substr(trim((string)($_POST['evaluator_title'] ?? '')), 0, 150) ?: null,
            digits_only($_POST['evaluator_phone'] ?? '') ?: null, json_encode($scores), $total, $rec,
            mb_substr(trim((string)($_POST['comments'] ?? '')), 0, 3000) ?: null, client_ip(),
        ]);
        audit('field_eval', 'trainee', $t['id'], $name . ' ' . $total . '%');
        $ok = true;
    } catch (RuntimeException $e) { $err = $e->getMessage(); }
}
$college = setting('college_name', 'الكلية التقنية ببيشة');
$logo = is_file(__DIR__ . '/uploads/brand/logo.png') ? 'uploads/brand/logo.png' : '';
$v = fn($k, $d = '') => h($_POST[$k] ?? $d);
?><!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>تقييم المتدرب – <?= h($college) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css">
<style>
.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.scale label{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid var(--line);border-radius:8px;padding:8px 2px;cursor:pointer;font-size:12.5px;font-weight:500;text-align:center;background:var(--paper)}
.scale input{position:absolute;opacity:0;pointer-events:none}
.scale label:has(input:checked){background:var(--pine);color:var(--pine-ink);border-color:var(--pine)}
.scale label:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:2px}
.crit{padding:14px 0;border-top:1px solid var(--line)}
.crit>b{display:block;margin-bottom:8px;font-weight:600}
</style>
</head><body>
<header class="top"><div class="wrap"><div class="brand"><?php if ($logo): ?><span class="mark"><img src="<?= h($logo) ?>" alt=""></span><?php endif; ?><div><b>تقييم المتدرب من جهة التدريب</b><span><?= h($college) ?> – التدريب التعاوني</span></div></div></div></header>
<main><div class="wrap" style="max-width:760px">
<?php if (!$t): ?>
  <div class="panel empty"><h2>الرابط غير صالح</h2><p>قد يكون الرابط ناقصاً أو استُبدل برابط جديد. اطلب الرابط الصحيح من مشرف الكلية.</p></div>
<?php elseif ($ok || $prev): ?>
  <div class="panel empty"><h2><?= $ok ? 'شكراً لكم، وصل التقييم' : 'قُدّم تقييم هذا المتدرب مسبقاً' ?></h2><p>تقييم المتدرب <b><?= h($t['name']) ?></b><?= $prev && !$ok ? ' بتاريخ ' . h(substr($prev['submitted_at'], 0, 10)) : '' ?>. إن احتجتم تعديله فتواصلوا مع مشرف الكلية.</p></div>
<?php else: ?>
  <div class="panel stack">
    <div><h2>تقييم أداء المتدرب</h2><p class="muted" style="margin:0">نشكر لكم تدريب متدربنا. يستغرق النموذج دقيقتين، ولا يحتاج إلى حساب.</p></div>
    <dl class="kv" style="margin:0"><dt>المتدرب</dt><dd><b><?= h($t['name']) ?></b></dd><dt>التخصص</dt><dd><?= h($t['specialty'] ?: $t['dept']) ?></dd><dt>جهة التدريب</dt><dd><?= h($t['entity'] ?: '—') ?></dd></dl>
    <?php if ($err): ?><div class="callout" style="border-color:var(--danger);background:var(--danger-soft)" role="alert"><?= h($err) ?></div><?php endif; ?>
    <form method="post" novalidate>
      <input type="hidden" name="csrf" value="<?= h($_SESSION['csrf']) ?>">
      <div class="form">
        <label>اسم المقيّم<input name="evaluator_name" required value="<?= $v('evaluator_name', (string)$t['field_supervisor']) ?>"></label>
        <label>الصفة الوظيفية<input name="evaluator_title" value="<?= $v('evaluator_title') ?>" placeholder="مثال: مشرف قسم الصيانة"></label>
        <label class="full">رقم الجوال (اختياري)<input name="evaluator_phone" dir="ltr" inputmode="tel" value="<?= $v('evaluator_phone', (string)$t['field_supervisor_phone']) ?>"></label>
      </div>
      <h3 style="margin-top:22px">بنود التقييم</h3>
      <?php foreach (CRITERIA as $i => $c): ?>
        <fieldset class="crit" style="border-inline:0;border-bottom:0;margin:0;padding-inline:0"><legend style="display:contents"></legend><b><?= ($i + 1) . '. ' . h($c) ?></b>
          <div class="scale" role="radiogroup" aria-label="<?= h($c) ?>"><?php foreach (SCALE as $n => $l): ?><label><input type="radio" name="s<?= $i ?>" value="<?= $n ?>" <?= (string)($_POST['s' . $i] ?? '') === (string)$n ? 'checked' : '' ?>><span class="num"><?= $n ?></span><?= h($l) ?></label><?php endforeach; ?></div>
        </fieldset>
      <?php endforeach; ?>
      <div class="form" style="margin-top:14px">
        <label class="full">التوصية<select name="recommend"><option value="">— اختر —</option><?php foreach (RECOMMEND as $r): ?><option <?= ($_POST['recommend'] ?? '') === $r ? 'selected' : '' ?>><?= h($r) ?></option><?php endforeach; ?></select></label>
        <label class="full">ملاحظات أخرى<textarea name="comments" placeholder="نقاط القوة، وما يحتاج المتدرب إلى تطويره"><?= $v('comments') ?></textarea></label>
      </div>
      <div class="actions"><button class="btn primary" type="submit">إرسال التقييم</button></div>
    </form>
  </div>
<?php endif; ?>
</div></main></body></html>

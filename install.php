<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
security_headers();
header('Content-Type: text/html; charset=utf-8');

$checks = [
    ['PHP 8.0 أو أحدث', version_compare(PHP_VERSION, '8.0.0', '>='), PHP_VERSION],
    ['امتداد PDO MySQL', extension_loaded('pdo_mysql'), ''],
    ['امتداد fileinfo (فحص الملفات المرفوعة)', extension_loaded('fileinfo'), ''],
    ['امتداد zip (استيراد ملفات Excel)', class_exists('ZipArchive'), 'اختياري: بدونه يُستورد CSV فقط'],
    ['امتداد gd (شعار الكلية)', function_exists('imagecreatefromstring'), 'اختياري'],
    ['مجلد app قابل للكتابة', is_writable(APP_DIR), 'لإنشاء ملف الإعدادات'],
    ['مجلد app/storage قابل للكتابة', is_writable(STORAGE_DIR), 'للتقارير المرفوعة'],
    ['مجلد uploads قابل للكتابة', is_writable(__DIR__ . '/uploads'), 'لشعار الكلية'],
];
$required = [0, 1, 2, 5, 6];
$ready = true; foreach ($required as $i) if (!$checks[$i][1]) $ready = false;

$err = ''; $done = false;
if (installed()) { $done = 'already'; }
elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && $ready) {
    $f = fn($k) => trim((string)($_POST[$k] ?? ''));
    try {
        $cfg = ['db_host' => $f('db_host') ?: 'localhost', 'db_port' => (int)($f('db_port') ?: 3306), 'db_name' => $f('db_name'), 'db_user' => $f('db_user'), 'db_pass' => (string)($_POST['db_pass'] ?? '')];
        if ($cfg['db_name'] === '' || $cfg['db_user'] === '') throw new RuntimeException('أكمل اسم قاعدة البيانات واسم المستخدم.');
        $emp = digits_only($f('admin_user')); $name = $f('admin_name'); $pw = (string)($_POST['admin_pass'] ?? '');
        if ($name === '' || !preg_match('/^\d{3,20}$/', $emp)) throw new RuntimeException('أكمل اسم المسؤول ورقمه الوظيفي (أرقام فقط).');
        if (mb_strlen($pw) < 8 || !preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) throw new RuntimeException('كلمة مرور المسؤول 8 خانات على الأقل وتجمع بين حروف إنجليزية وأرقام.');
        if ($pw !== (string)($_POST['admin_pass2'] ?? '')) throw new RuntimeException('كلمتا المرور غير متطابقتين.');
        $start = $f('semester_start'); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) throw new RuntimeException('حدّد تاريخ بداية الفصل.');
        try {
            $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $cfg['db_host'], $cfg['db_port'], $cfg['db_name']), $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        } catch (PDOException $e) { throw new RuntimeException('تعذّر الاتصال بقاعدة البيانات. تحقّق من البيانات. (' . $e->getCode() . ')'); }
        foreach (array_filter(array_map('trim', explode(';', preg_replace('/^--.*$/m', '', (string)file_get_contents(APP_DIR . '/schema.sql'))))) as $sql) $pdo->exec($sql);
        if ((int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn() > 0) throw new RuntimeException('قاعدة البيانات تحتوي على منصة مثبّتة مسبقاً. استخدم قاعدة بيانات فارغة، أو أعد ملف app/config.php القديم.');
        $pdo->prepare("INSERT INTO users (role, username, name, password_hash) VALUES ('admin', ?, ?, ?)")->execute([$emp, $name, password_hash($pw, PASSWORD_DEFAULT)]);
        $set = $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
        foreach (['college_name' => $f('college_name') ?: 'الكلية التقنية ببيشة', 'semester_label' => $f('semester_label'), 'semester_start' => $start, 'semester_weeks' => (string)max(1, min(30, (int)$f('semester_weeks') ?: 17)), 'admin_contact' => $name, 'require_visit_report' => '1', 'max_upload_mb' => '10'] as $k => $v) $set->execute([$k, $v]);
        $php = "<?php\n// أُنشئ بواسطة install.php — لا تشارك هذا الملف\nreturn " . var_export($cfg, true) . ";\n";
        if (file_put_contents(APP_DIR . '/config.php', $php) === false) throw new RuntimeException('تعذّرت كتابة ملف الإعدادات app/config.php. تحقّق من صلاحيات المجلد.');
        @chmod(APP_DIR . '/config.php', 0640);
        $done = 'ok';
    } catch (RuntimeException $e) { $err = $e->getMessage(); }
    catch (Throwable $e) { $err = 'حدث خطأ أثناء التثبيت: ' . $e->getMessage(); }
}
$v = fn($k, $d = '') => h($_POST[$k] ?? $d);
?><!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>تثبيت منصة التدريب التعاوني</title>
<link rel="stylesheet" href="assets/app.css">
</head><body>
<main class="wrap" style="max-width:760px;padding-block:32px">
<div class="panel stack">
  <div><h2>تثبيت منصة التدريب التعاوني وشؤون الخريجين</h2><p class="muted" style="margin:0">خطوة واحدة: بيانات قاعدة البيانات، وحساب المسؤول، وبداية الفصل التدريبي.</p></div>
<?php if ($done === 'already'): ?>
  <div class="callout ok">المنصة مثبّتة. <b>احذف ملف install.php من الخادم الآن</b> لأسباب أمنية، ثم <a href="./">افتح المنصة</a>.</div>
<?php elseif ($done === 'ok'): ?>
  <div class="callout ok"><b>اكتمل التثبيت.</b><br>١. احذف ملف <b>install.php</b> من الخادم الآن.<br>٢. <a href="./">افتح المنصة</a> وادخل من تبويب «المسؤول» برقمك الوظيفي وكلمة المرور.<br>٣. من «الإعدادات» ارفع شعار الكلية، ثم استورد كشف المتدربين.</div>
<?php else: ?>
  <table class="list"><tbody>
  <?php foreach ($checks as $i => [$label, $ok, $note]): ?>
    <tr><td><?= h($label) ?></td><td style="text-align:end"><?= $ok ? '<span class="tag">متوفر</span>' : (in_array($i, $required, true) ? '<span class="tag bad">مطلوب</span>' : '<span class="tag warn">غير متوفر</span>') ?> <span class="note"><?= h($note) ?></span></td></tr>
  <?php endforeach; ?>
  </tbody></table>
  <?php if (!$ready): ?><div class="callout">أكمل المتطلبات المشار إليها بـ«مطلوب» ثم حدّث الصفحة. يمكن ضبط صلاحيات المجلدات من مدير الملفات في لوحة الاستضافة (755 أو 775).</div><?php endif; ?>
  <?php if ($err): ?><div class="callout" style="border-color:var(--danger);background:var(--danger-soft)"><?= h($err) ?></div><?php endif; ?>
  <form method="post" class="form" autocomplete="off">
    <h3 class="full" style="margin:6px 0 0">قاعدة البيانات (MySQL)</h3>
    <label>الخادم<input name="db_host" dir="ltr" value="<?= $v('db_host', 'localhost') ?>"></label>
    <label>المنفذ<input name="db_port" dir="ltr" inputmode="numeric" value="<?= $v('db_port', '3306') ?>"></label>
    <label>اسم قاعدة البيانات<input name="db_name" dir="ltr" required value="<?= $v('db_name') ?>"></label>
    <label>اسم المستخدم<input name="db_user" dir="ltr" required value="<?= $v('db_user') ?>"></label>
    <label class="full">كلمة مرور قاعدة البيانات<input name="db_pass" type="password" dir="ltr"></label>
    <h3 class="full" style="margin:10px 0 0">الكلية والفصل التدريبي</h3>
    <label class="full">اسم الكلية<input name="college_name" value="<?= $v('college_name', 'الكلية التقنية ببيشة') ?>"></label>
    <label class="full">اسم الفصل<input name="semester_label" value="<?= $v('semester_label', 'الفصل التدريبي الأول 1448هـ') ?>"></label>
    <label>تاريخ بداية الفصل (ميلادي)<input name="semester_start" type="date" required value="<?= $v('semester_start', '2026-09-06') ?>"></label>
    <label>عدد الأسابيع<input name="semester_weeks" inputmode="numeric" value="<?= $v('semester_weeks', '17') ?>"></label>
    <h3 class="full" style="margin:10px 0 0">حساب مسؤول التدريب التعاوني</h3>
    <label class="full">الاسم الكامل<input name="admin_name" required value="<?= $v('admin_name') ?>"></label>
    <label>الرقم الوظيفي<input name="admin_user" dir="ltr" inputmode="numeric" required value="<?= $v('admin_user') ?>"></label>
    <span></span>
    <label>كلمة المرور<input name="admin_pass" type="password" dir="ltr" required><span class="hint">8 خانات على الأقل، حروف إنجليزية وأرقام.</span></label>
    <label>تأكيد كلمة المرور<input name="admin_pass2" type="password" dir="ltr" required></label>
    <div class="full actions"><button class="btn primary" type="submit" <?= $ready ? '' : 'disabled' ?>>تثبيت المنصة</button></div>
  </form>
<?php endif; ?>
</div></main></body></html>

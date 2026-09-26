<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sheet.php';

const VISIT_TYPES = ['زيارة ميدانية', 'زيارة ميدانية ختامية', 'متابعة هاتفية'];
const ATTEND = ['منتظم', 'متأخر أحياناً', 'متغيب'];
const RATING = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];
const SECTORS = ['حكومي', 'صحي', 'خيري وأهلي', 'خاص', 'تعليمي', 'داخل الكلية'];
const REG = ['مكتمل', 'غير مكتمل', 'تم الاتصال', 'خريج', 'مطوي قيده'];
const START_ST = ['مباشر', 'غير مباشر'];
const GRAD_ST = ['يعمل', 'يبحث عن عمل', 'يكمل دراسته', 'غير معروف'];
const OK_MIME = ['application/pdf' => 'pdf', 'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
const EVAL_CRITERIA = ['الانضباط والحضور في المواعيد', 'الالتزام بأنظمة العمل وتعليماته', 'المهارات الفنية في مجال التخصص', 'سرعة التعلم واكتساب المهارات', 'جودة العمل وإتقانه', 'التعاون والعمل ضمن الفريق', 'التواصل مع الزملاء والرؤساء', 'المبادرة وتحمل المسؤولية', 'تقبّل التوجيهات والملاحظات', 'السلوك والمظهر العام'];

class ApiError extends Exception {
    public int $status;
    public function __construct(string $m, int $status = 400) { parent::__construct($m); $this->status = $status; }
}

function out($data = null, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => $status < 400, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $status = 400): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function me(): ?array { return $_SESSION['user'] ?? null; }
function need(string ...$roles): array {
    $u = me();
    if (!$u) throw new ApiError('انتهت الجلسة. سجّل الدخول مرة أخرى.', 401);
    if ($roles && !in_array($u['role'], $roles, true)) throw new ApiError('لا تملك صلاحية تنفيذ هذا الإجراء.', 403);
    return $u;
}
function in_list($v, array $list, string $label): string {
    $v = trim((string)$v);
    if ($v === '') return '';
    if (!in_array($v, $list, true)) throw new ApiError('قيمة غير صحيحة في حقل ' . $label . '.');
    return $v;
}
function str_in(array $in, string $k, int $max = 200): string { return mb_substr(trim((string)($in[$k] ?? '')), 0, $max); }
function nullish(string $s): ?string { return $s === '' ? null : $s; }

function trainee_row(int $id): array {
    $t = one('SELECT * FROM trainees WHERE id = ?', [$id]);
    if (!$t) throw new ApiError('المتدرب غير موجود.', 404);
    return $t;
}
function can_touch_trainee(array $u, array $t, bool $allowUnassigned = true): bool {
    if ($u['role'] === 'admin') return true;
    if ($u['role'] === 'supervisor') return (int)$t['supervisor_id'] === (int)$u['id'] || ($allowUnassigned && $t['supervisor_id'] === null);
    return false;
}

function save_upload(string $field, bool $required): ?array {
    $f = $_FILES[$field] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        if ($required) throw new ApiError('أرفق الملف قبل الحفظ.');
        return null;
    }
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) throw new ApiError('حجم الملف أكبر من المسموح في الخادم.');
    if ($f['error'] !== UPLOAD_ERR_OK) throw new ApiError('تعذّر رفع الملف. أعد المحاولة.');
    $max = (int)setting('max_upload_mb', '10') * 1048576;
    if ($f['size'] > $max) throw new ApiError('حجم الملف أكبر من ' . setting('max_upload_mb', '10') . ' ميجابايت.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!isset(OK_MIME[$mime])) throw new ApiError('نوع الملف غير مدعوم. أرفق ملف PDF أو صورة (PNG أو JPG).');
    $dir = STORAGE_DIR . '/files';
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    $name = bin2hex(random_bytes(16)) . '.' . OK_MIME[$mime];
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) throw new ApiError('تعذّر حفظ الملف في الخادم.', 500);
    return ['file' => $name, 'name' => mb_substr(basename((string)$f['name']), 0, 200)];
}
function drop_file(?string $name): void {
    if ($name && preg_match('/^[a-f0-9]{32}\.[a-z]{3,4}$/', $name)) @unlink(STORAGE_DIR . '/files/' . $name);
}

function csv_out(string $filename, array $rows): void {
    header('Content-Type: text/csv; charset=utf-8');
    header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($filename));
    header('Cache-Control: no-store');
    $fh = fopen('php://output', 'w');
    fwrite($fh, "\xEF\xBB\xBF");
    foreach ($rows as $r) fputcsv($fh, array_map(fn($c) => $c === null ? '' : (string)$c, $r), ',', '"', '');
    fclose($fh);
    exit;
}

function login_blocked(string $username): bool {
    $u = (int)val('SELECT COUNT(*) FROM login_attempts WHERE username = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)', [$username]);
    $i = (int)val('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)', [client_ip()]);
    return $u >= 5 || $i >= 30;
}
function note_attempt(string $username, bool $ok): void {
    q('INSERT INTO login_attempts (username, ip, success) VALUES (?,?,?)', [$username, client_ip(), $ok ? 1 : 0]);
    if (random_int(1, 50) === 1) q('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 30 DAY)');
}
function valid_password(string $p): bool { return mb_strlen($p) >= 8 && preg_match('/[A-Za-z]/', $p) && preg_match('/\d/', $p); }
const PW_RULE = 'كلمة المرور 8 خانات على الأقل، وتجمع بين حروف إنجليزية وأرقام.';

function set_session_user(array $u): void {
    session_regenerate_id(true);
    $tid = null;
    if ($u['role'] === 'trainee') $tid = val('SELECT id FROM trainees WHERE user_id = ?', [$u['id']]);
    $_SESSION['user'] = ['id' => (int)$u['id'], 'role' => $u['role'], 'name' => $u['name'], 'username' => $u['username'], 'trainee_id' => $tid ? (int)$tid : null, 'must_change' => (int)$u['must_change'] === 1];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    q('UPDATE users SET last_login = NOW() WHERE id = ?', [$u['id']]);
}

function public_settings(): array {
    return [
        'college' => setting('college_name', 'الكلية التقنية ببيشة'),
        'org' => setting('org_name', 'المؤسسة العامة للتدريب التقني والمهني'),
        'semester' => setting('semester_label', 'الفصل التدريبي الأول 1448هـ'),
        'start' => sem_start()->format('Y-m-d'),
        'weeks' => sem_weeks(),
        'week' => current_week(),
        'today' => date('Y-m-d'),
        'contact' => setting('admin_contact', ''),
        'logo' => is_file(ROOT_DIR . '/uploads/brand/logo.png') ? 'uploads/brand/logo.png?v=' . filemtime(ROOT_DIR . '/uploads/brand/logo.png') : '',
        'banner' => is_file(ROOT_DIR . '/uploads/brand/banner.jpg') ? 'uploads/brand/banner.jpg?v=' . filemtime(ROOT_DIR . '/uploads/brand/banner.jpg') : '',
        'maxUpload' => (int)setting('max_upload_mb', '10'),
        'requireReport' => setting('require_visit_report', '1') === '1',
        'lists' => ['visitTypes' => VISIT_TYPES, 'attend' => ATTEND, 'rating' => RATING, 'sectors' => SECTORS, 'reg' => REG, 'start' => START_ST, 'grad' => GRAD_ST, 'criteria' => EVAL_CRITERIA],
    ];
}
function base_url(): string {
    $scheme = https() ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $scheme . '://' . $host . $dir . '/';
}

/* ================================================================== */
function handle(string $a, array $in): void {
    switch ($a) {

    /* ---------- session ---------- */
    case 'session':
        $u = me();
        out(['user' => $u, 'csrf' => $_SESSION['csrf'], 'settings' => public_settings()]);

    case 'login': {
        $kind = $in['kind'] ?? 'staff';
        $username = digits_only($in['username'] ?? '');
        $pw = (string)($in['password'] ?? '');
        if ($username === '' || $pw === '') throw new ApiError('أدخل رقم الدخول وكلمة المرور.');
        if (login_blocked($username)) throw new ApiError('محاولات كثيرة غير صحيحة. أعد المحاولة بعد 15 دقيقة.', 429);
        $u = $kind === 'trainee'
            ? one("SELECT * FROM users WHERE role = 'trainee' AND username = ?", [$username])
            : one("SELECT * FROM users WHERE role IN ('admin','supervisor') AND username = ?", [$username]);
        if ($u && !$u['password_hash'] && $u['activation_code']) { note_attempt($username, false); throw new ApiError('حسابك غير مفعّل بعد. اختر «فعّل حسابك برمز التفعيل» أسفل نموذج الدخول.'); }
        if (!$u || !$u['password_hash'] || !password_verify($pw, $u['password_hash'])) {
            note_attempt($username, false);
            audit('login_fail', 'user', $username);
            throw new ApiError($kind === 'trainee' ? 'الرقم التدريبي أو كلمة المرور غير صحيحة.' : 'الرقم الوظيفي أو كلمة المرور غير صحيحة.');
        }
        if (!(int)$u['active']) throw new ApiError('الحساب موقوف. تواصل مع مسؤول التدريب التعاوني.', 403);
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        note_attempt($username, true);
        set_session_user($u);
        audit('login', 'user', $u['id']);
        out(['user' => me(), 'csrf' => $_SESSION['csrf']]);
    }

    case 'activate': {
        $acad = digits_only($in['acad'] ?? '');
        $code = norm_code($in['code'] ?? '');
        $pw = (string)($in['password'] ?? '');
        if ($acad === '' || $code === '') throw new ApiError('أدخل الرقم التدريبي ورمز التفعيل.');
        if (login_blocked($acad)) throw new ApiError('محاولات كثيرة غير صحيحة. أعد المحاولة بعد 15 دقيقة.', 429);
        $u = one("SELECT * FROM users WHERE role = 'trainee' AND username = ?", [$acad]);
        if (!$u || !$u['activation_code'] || !hash_equals($u['activation_code'], $code)) { note_attempt($acad, false); throw new ApiError('الرقم التدريبي أو رمز التفعيل غير صحيح، أو استُخدم الرمز من قبل.'); }
        if (!(int)$u['active']) throw new ApiError('الحساب موقوف. تواصل مع مسؤول التدريب التعاوني.', 403);
        if (!valid_password($pw)) throw new ApiError(PW_RULE);
        q('UPDATE users SET password_hash = ?, activation_code = NULL, must_change = 0 WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        note_attempt($acad, true);
        $u = one('SELECT * FROM users WHERE id = ?', [$u['id']]);
        set_session_user($u);
        audit('activate', 'user', $u['id']);
        out(['user' => me(), 'csrf' => $_SESSION['csrf']]);
    }

    case 'logout':
        audit('logout', 'user', me()['id'] ?? null);
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
        out(['csrf' => $_SESSION['csrf']]);

    case 'password': {
        $u = need();
        $cur = (string)($in['current'] ?? ''); $new = (string)($in['new'] ?? '');
        $row = one('SELECT * FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify($cur, (string)$row['password_hash'])) throw new ApiError('كلمة المرور الحالية غير صحيحة.');
        if (!valid_password($new)) throw new ApiError(PW_RULE);
        if ($new === $cur) throw new ApiError('اختر كلمة مرور مختلفة عن الحالية.');
        q('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        $_SESSION['user']['must_change'] = false;
        audit('password', 'user', $u['id']);
        out(['user' => me()]);
    }

    /* ---------- staff data bundle ---------- */
    case 'bootstrap': {
        $u = need('admin', 'supervisor');
        $isAdmin = $u['role'] === 'admin';
        $cols = 't.id, t.acad, t.name, t.phone, t.dept, t.specialty, t.entity, t.sector, t.field_supervisor, t.field_supervisor_phone, t.supervisor_id, t.reg_status, t.start_status, t.notes, t.eval_token'
              . ($isAdmin ? ', t.nid, t.gpa, t.letter_no, t.user_id, us.activation_code, (us.password_hash IS NOT NULL) AS activated, us.active AS account_active, us.last_login AS trainee_last_login' : ', t.gpa');
        $trainees = all("SELECT $cols FROM trainees t LEFT JOIN users us ON us.id = t.user_id ORDER BY t.dept, t.name");
        $visits = all('SELECT v.id, v.trainee_id, v.visit_date, v.type, v.attendance, v.rating, v.met_field, v.notes, v.report_file IS NOT NULL AS has_file, v.report_name, v.report_url, v.created_by, v.created_at FROM visits v ORDER BY v.visit_date DESC, v.id DESC');
        $staff = all("SELECT id, role, username, name, phone, active, last_login, must_change FROM users WHERE role IN ('admin','supervisor') ORDER BY role, name");
        $weekly = all('SELECT id, trainee_id, week, status, submitted_at, reviewed_at FROM weekly_reports');
        $evals = all('SELECT id, trainee_id, total, recommend, submitted_at, evaluator_name FROM field_evals ORDER BY submitted_at DESC');
        $notices = all("SELECT id, title, body, audience, created_at FROM notices WHERE audience IN ('all','supervisors'" . ($isAdmin ? ",'trainees'" : '') . ") ORDER BY created_at DESC LIMIT 100");
        out(compact('trainees', 'visits', 'staff', 'weekly', 'evals', 'notices'));
    }

    /* ---------- trainees ---------- */
    case 'trainee.save': {
        need('admin');
        $id = (int)($in['id'] ?? 0);
        $d = [
            'acad' => digits_only($in['acad'] ?? ''),
            'name' => str_in($in, 'name', 150),
            'nid' => nullish(digits_only($in['nid'] ?? '')),
            'phone' => nullish(digits_only($in['phone'] ?? '')),
            'dept' => nullish(str_in($in, 'dept', 100)),
            'specialty' => nullish(str_in($in, 'specialty', 100)),
            'gpa' => nullish(str_in($in, 'gpa', 10)),
            'entity' => nullish(str_in($in, 'entity', 200)),
            'sector' => nullish(in_list($in['sector'] ?? '', SECTORS, 'القطاع')),
            'field_supervisor' => nullish(str_in($in, 'field_supervisor', 150)),
            'field_supervisor_phone' => nullish(digits_only($in['field_supervisor_phone'] ?? '')),
            'supervisor_id' => ($in['supervisor_id'] ?? '') === '' ? null : (int)$in['supervisor_id'],
            'reg_status' => nullish(in_list($in['reg_status'] ?? '', REG, 'اكتمال التسجيل')),
            'start_status' => nullish(in_list($in['start_status'] ?? '', START_ST, 'المباشرة')),
            'letter_no' => nullish(str_in($in, 'letter_no', 50)),
            'notes' => nullish(str_in($in, 'notes', 2000)),
        ];
        if ($d['name'] === '' || !preg_match('/^\d{5,20}$/', $d['acad'])) throw new ApiError('أكمل اسم المتدرب والرقم التدريبي (أرقام فقط).');
        if ($d['supervisor_id'] !== null && !val("SELECT id FROM users WHERE id = ? AND role = 'supervisor'", [$d['supervisor_id']])) throw new ApiError('المشرف المختار غير موجود.');
        $dup = val('SELECT id FROM trainees WHERE acad = ? AND id <> ?', [$d['acad'], $id]);
        if ($dup) throw new ApiError('يوجد متدرب آخر بهذا الرقم التدريبي.');
        if ($id) {
            $old = trainee_row($id);
            $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($d)));
            q("UPDATE trainees SET $set WHERE id = :id", $d + ['id' => $id]);
            if ($old['user_id'] && $old['acad'] !== $d['acad']) q('UPDATE users SET username = ?, name = ? WHERE id = ?', [$d['acad'], $d['name'], $old['user_id']]);
            elseif ($old['user_id']) q('UPDATE users SET name = ?, phone = ? WHERE id = ?', [$d['name'], $d['phone'], $old['user_id']]);
            audit('update', 'trainee', $id, $d['name']);
        } else {
            $keys = array_keys($d);
            q('INSERT INTO trainees (' . implode(',', $keys) . ') VALUES (:' . implode(',:', $keys) . ')', $d);
            $id = (int)db()->lastInsertId();
            audit('create', 'trainee', $id, $d['name']);
        }
        out(['id' => $id]);
    }

    case 'trainee.delete': {
        need('admin');
        $t = trainee_row((int)($in['id'] ?? 0));
        foreach (all('SELECT report_file FROM visits WHERE trainee_id = ?', [$t['id']]) as $v) drop_file($v['report_file']);
        foreach (all('SELECT file FROM weekly_reports WHERE trainee_id = ?', [$t['id']]) as $v) drop_file($v['file']);
        q('DELETE FROM trainees WHERE id = ?', [$t['id']]);
        if ($t['user_id']) q('DELETE FROM users WHERE id = ?', [$t['user_id']]);
        audit('delete', 'trainee', $t['id'], $t['name']);
        out();
    }

    case 'trainee.assign': {
        need('admin');
        $sup = ($in['supervisor_id'] ?? '') === '' ? null : (int)$in['supervisor_id'];
        if ($sup !== null && !val("SELECT id FROM users WHERE id = ? AND role = 'supervisor'", [$sup])) throw new ApiError('المشرف المختار غير موجود.');
        $ids = array_map('intval', (array)($in['ids'] ?? []));
        if (!empty($in['entity'])) $n = q('UPDATE trainees SET supervisor_id = ? WHERE entity = ?', [$sup, (string)$in['entity']])->rowCount();
        elseif ($ids) { $ph = implode(',', array_fill(0, count($ids), '?')); $n = q("UPDATE trainees SET supervisor_id = ? WHERE id IN ($ph)", array_merge([$sup], $ids))->rowCount(); }
        else throw new ApiError('اختر الجهة أو المتدربين.');
        audit('assign', 'trainee', null, 'عدد ' . $n);
        out(['count' => $n]);
    }

    case 'trainee.status': {
        $u = need('admin', 'supervisor');
        $t = trainee_row((int)($in['id'] ?? 0));
        if (!can_touch_trainee($u, $t, false)) throw new ApiError('هذا المتدرب غير مسند إليك.', 403);
        $st = nullish(in_list($in['start_status'] ?? '', START_ST, 'المباشرة'));
        q('UPDATE trainees SET start_status = ? WHERE id = ?', [$st, $t['id']]);
        audit('start_status', 'trainee', $t['id'], (string)$st);
        out();
    }

    /* ---------- import ---------- */
    case 'import.preview': {
        need('admin');
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) throw new ApiError('اختر ملف الكشف.');
        $rows = read_sheet($f['tmp_name'], (string)$f['name']);
        $rows = array_values(array_filter($rows, fn($r) => implode('', $r) !== ''));
        if (count($rows) < 2) throw new ApiError('الملف لا يحتوي على بيانات.');
        $hi = 0;
        foreach (array_slice($rows, 0, 10) as $i => $r) { if (count(guess_mapping($r)) >= 2) { $hi = $i; break; } }
        $headers = $rows[$hi];
        $data = array_slice($rows, $hi + 1);
        $token = bin2hex(random_bytes(12));
        $dir = STORAGE_DIR . '/tmp'; if (!is_dir($dir)) mkdir($dir, 0750, true);
        foreach (glob($dir . '/*.json') ?: [] as $old) if (filemtime($old) < time() - 3600) @unlink($old);
        file_put_contents("$dir/$token.json", json_encode(['headers' => $headers, 'rows' => $data], JSON_UNESCAPED_UNICODE));
        out(['token' => $token, 'headers' => $headers, 'sample' => array_slice($data, 0, 5), 'count' => count($data), 'mapping' => guess_mapping($headers)]);
    }

    case 'import.commit': {
        need('admin');
        $token = preg_replace('/[^a-f0-9]/', '', (string)($in['token'] ?? ''));
        $file = STORAGE_DIR . "/tmp/$token.json";
        if (!$token || !is_file($file)) throw new ApiError('انتهت صلاحية الملف المرفوع. ارفعه مرة أخرى.');
        $pack = json_decode((string)file_get_contents($file), true);
        $map = array_filter((array)($in['mapping'] ?? []), fn($v) => $v !== '' && $v !== null);
        $target = ($in['target'] ?? 'trainees') === 'graduates' ? 'graduates' : 'trainees';
        if (!isset($map['acad']) || !isset($map['name'])) throw new ApiError('حدّد عمود الرقم التدريبي وعمود الاسم.');
        $sups = [];
        foreach (all("SELECT id, name FROM users WHERE role = 'supervisor'") as $s) $sups[preg_replace('/\s+/u', ' ', trim($s['name']))] = (int)$s['id'];
        $get = fn($r, $k) => isset($map[$k]) ? trim((string)($r[(int)$map[$k]] ?? '')) : null;
        $added = 0; $updated = 0; $skipped = 0; $unknownSup = [];
        db()->beginTransaction();
        try {
            foreach ($pack['rows'] as $r) {
                $acad = digits_only($get($r, 'acad'));
                $name = mb_substr((string)$get($r, 'name'), 0, 150);
                if (!preg_match('/^\d{5,20}$/', $acad) || $name === '') { $skipped++; continue; }
                if ($target === 'graduates') {
                    $d = ['acad' => $acad, 'name' => $name, 'phone' => nullish(digits_only((string)$get($r, 'phone'))), 'dept' => nullish(mb_substr((string)$get($r, 'dept'), 0, 100)), 'specialty' => nullish(mb_substr((string)$get($r, 'specialty'), 0, 100)), 'gpa' => nullish(mb_substr((string)$get($r, 'gpa'), 0, 10))];
                    $d = array_filter($d, fn($v) => $v !== null);
                    $ex = val('SELECT id FROM graduates WHERE acad = ?', [$acad]);
                    if ($ex) { $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($d))); q("UPDATE graduates SET $set WHERE id = :id", $d + ['id' => $ex]); $updated++; }
                    else { $keys = array_keys($d); q('INSERT INTO graduates (' . implode(',', $keys) . ') VALUES (:' . implode(',:', $keys) . ')', $d); $added++; }
                    continue;
                }
                $d = ['name' => $name];
                foreach (['nid', 'phone', 'field_supervisor_phone'] as $k) { $v = $get($r, $k); if ($v !== null && $v !== '') $d[$k] = digits_only($v); }
                foreach (['dept' => 100, 'specialty' => 100, 'gpa' => 10, 'entity' => 200, 'field_supervisor' => 150, 'letter_no' => 50] as $k => $len) { $v = $get($r, $k); if ($v !== null && $v !== '') $d[$k] = mb_substr($v, 0, $len); }
                $sec = $get($r, 'sector'); if ($sec !== null && in_array($sec, SECTORS, true)) $d['sector'] = $sec;
                $sn = $get($r, 'supervisor_name');
                if ($sn !== null && $sn !== '') { $key = preg_replace('/\s+/u', ' ', $sn); if (isset($sups[$key])) $d['supervisor_id'] = $sups[$key]; else $unknownSup[$sn] = true; }
                $ex = val('SELECT id FROM trainees WHERE acad = ?', [$acad]);
                if ($ex) { $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($d))); q("UPDATE trainees SET $set WHERE id = :id", $d + ['id' => $ex]); $updated++; }
                else { $d['acad'] = $acad; $keys = array_keys($d); q('INSERT INTO trainees (' . implode(',', $keys) . ') VALUES (:' . implode(',:', $keys) . ')', $d); $added++; }
            }
            db()->commit();
        } catch (Throwable $e) { db()->rollBack(); throw $e; }
        @unlink($file);
        audit('import', $target, null, "أضيف $added، حُدّث $updated، تُجوهل $skipped");
        out(['added' => $added, 'updated' => $updated, 'skipped' => $skipped, 'unknownSupervisors' => array_keys($unknownSup)]);
    }

    /* ---------- visits ---------- */
    case 'visit.save': {
        $u = need('admin', 'supervisor');
        $t = trainee_row((int)($in['trainee_id'] ?? 0));
        if (!can_touch_trainee($u, $t)) throw new ApiError('هذا المتدرب مسند إلى مشرف آخر.', 403);
        $date = (string)($in['visit_date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date > date('Y-m-d', strtotime('+1 day'))) throw new ApiError('حدّد تاريخ زيارة صحيحاً، ولا يكون في المستقبل.');
        $url = trim((string)($in['report_url'] ?? ''));
        if ($url !== '' && !preg_match('#^https://#i', $url)) throw new ApiError('رابط التقرير يجب أن يبدأ بـ https://');
        $file = save_upload('file', $url === '' && setting('require_visit_report', '1') === '1');
        try {
            q('INSERT INTO visits (trainee_id, visit_date, type, attendance, rating, met_field, notes, report_file, report_name, report_url, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
                $t['id'], $date, in_list($in['type'] ?? VISIT_TYPES[0], VISIT_TYPES, 'نوع الزيارة') ?: VISIT_TYPES[0],
                nullish(in_list($in['attendance'] ?? '', ATTEND, 'الانتظام')), nullish(in_list($in['rating'] ?? '', RATING, 'الأداء')),
                !empty($in['met_field']) && $in['met_field'] !== '0' ? 1 : 0, nullish(str_in($in, 'notes', 4000)),
                $file['file'] ?? null, $file['name'] ?? null, nullish(mb_substr($url, 0, 500)), $u['id'],
            ]);
        } catch (Throwable $e) { drop_file($file['file'] ?? null); throw $e; }
        $id = (int)db()->lastInsertId();
        if ($t['supervisor_id'] === null && $u['role'] === 'supervisor') q('UPDATE trainees SET supervisor_id = ? WHERE id = ?', [$u['id'], $t['id']]);
        audit('create', 'visit', $id, $t['name'] . ' ' . $date);
        out(['id' => $id]);
    }

    case 'visit.delete': {
        $u = need('admin', 'supervisor');
        $v = one('SELECT * FROM visits WHERE id = ?', [(int)($in['id'] ?? 0)]);
        if (!$v) throw new ApiError('الزيارة غير موجودة.', 404);
        if ($u['role'] !== 'admin' && (int)$v['created_by'] !== (int)$u['id']) throw new ApiError('يحذف الزيارة من سجّلها أو المسؤول فقط.', 403);
        q('DELETE FROM visits WHERE id = ?', [$v['id']]);
        drop_file($v['report_file']);
        audit('delete', 'visit', $v['id']);
        out();
    }

    /* ---------- weekly reports ---------- */
    case 'weekly.list': {
        $u = need('admin', 'supervisor');
        $tid = (int)($in['trainee_id'] ?? 0);
        $sql = 'SELECT w.id, w.trainee_id, w.week, w.tasks, w.skills, w.challenges, w.hours, w.file IS NOT NULL AS has_file, w.file_name, w.status, w.sup_comment, w.reviewed_at, w.submitted_at, t.name AS trainee_name, t.entity FROM weekly_reports w JOIN trainees t ON t.id = w.trainee_id WHERE 1=1';
        $args = [];
        if ($u['role'] === 'supervisor') { $sql .= ' AND t.supervisor_id = ?'; $args[] = $u['id']; }
        if ($tid) { $sql .= ' AND w.trainee_id = ?'; $args[] = $tid; }
        if (($in['status'] ?? '') !== '') { $sql .= ' AND w.status = ?'; $args[] = (string)$in['status']; }
        $sql .= ' ORDER BY w.submitted_at DESC LIMIT 500';
        out(all($sql, $args));
    }

    case 'weekly.review': {
        $u = need('admin', 'supervisor');
        $w = one('SELECT w.*, t.supervisor_id FROM weekly_reports w JOIN trainees t ON t.id = w.trainee_id WHERE w.id = ?', [(int)($in['id'] ?? 0)]);
        if (!$w) throw new ApiError('التقرير غير موجود.', 404);
        if ($u['role'] !== 'admin' && (int)$w['supervisor_id'] !== (int)$u['id']) throw new ApiError('هذا التقرير لمتدرب غير مسند إليك.', 403);
        $status = in_array($in['status'] ?? '', ['reviewed', 'returned'], true) ? $in['status'] : 'reviewed';
        if ($status === 'returned' && str_in($in, 'comment', 2000) === '') throw new ApiError('اكتب سبب الإعادة ليعرف المتدرب ما يعدّله.');
        q('UPDATE weekly_reports SET status = ?, sup_comment = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [$status, nullish(str_in($in, 'comment', 2000)), $u['id'], $w['id']]);
        audit('review', 'weekly', $w['id'], $status);
        out();
    }

    case 'weekly.submit': {
        $u = need('trainee');
        $tid = (int)$u['trainee_id'];
        if (!$tid) throw new ApiError('حسابك غير مرتبط بسجل متدرب.', 403);
        $week = (int)($in['week'] ?? 0);
        if ($week < 1 || $week > sem_weeks() || $week > max(1, current_week())) throw new ApiError('اختر أسبوعاً صحيحاً لم يأتِ بعد.');
        $tasks = str_in($in, 'tasks', 4000);
        if (mb_strlen($tasks) < 20) throw new ApiError('اكتب المهام التي أنجزتها هذا الأسبوع بتفصيل أكثر (20 حرفاً على الأقل).');
        $ex = one('SELECT * FROM weekly_reports WHERE trainee_id = ? AND week = ?', [$tid, $week]);
        if ($ex && $ex['status'] === 'reviewed') throw new ApiError('روجع تقرير هذا الأسبوع ولا يمكن تعديله.');
        $file = save_upload('file', false);
        $hours = ($in['hours'] ?? '') === '' ? null : max(0, min(80, (float)to_ascii_digits((string)$in['hours'])));
        $vals = [$tasks, nullish(str_in($in, 'skills', 2000)), nullish(str_in($in, 'challenges', 2000)), $hours];
        if ($ex) {
            if ($file) drop_file($ex['file']);
            q('UPDATE weekly_reports SET tasks = ?, skills = ?, challenges = ?, hours = ?, file = ?, file_name = ?, status = \'submitted\', submitted_at = NOW() WHERE id = ?',
              array_merge($vals, [$file['file'] ?? $ex['file'], $file['name'] ?? $ex['file_name'], $ex['id']]));
        } else {
            q('INSERT INTO weekly_reports (trainee_id, week, tasks, skills, challenges, hours, file, file_name) VALUES (?,?,?,?,?,?,?,?)',
              array_merge([$tid, $week], $vals, [$file['file'] ?? null, $file['name'] ?? null]));
        }
        audit('submit', 'weekly', $tid, 'الأسبوع ' . $week);
        out();
    }

    /* ---------- field supervisor evaluation ---------- */
    case 'eval.link': {
        $u = need('admin', 'supervisor');
        $t = trainee_row((int)($in['trainee_id'] ?? 0));
        if (!can_touch_trainee($u, $t, false)) throw new ApiError('هذا المتدرب غير مسند إليك.', 403);
        $tok = $t['eval_token'];
        if (!$tok || !empty($in['renew'])) { $tok = bin2hex(random_bytes(16)); q('UPDATE trainees SET eval_token = ? WHERE id = ?', [$tok, $t['id']]); audit('eval_link', 'trainee', $t['id']); }
        out(['url' => base_url() . 'eval.php?t=' . $tok, 'token' => $tok]);
    }

    case 'eval.get': {
        $u = need('admin', 'supervisor');
        $e = one('SELECT e.*, t.supervisor_id, t.name AS trainee_name FROM field_evals e JOIN trainees t ON t.id = e.trainee_id WHERE e.id = ?', [(int)($in['id'] ?? 0)]);
        if (!$e) throw new ApiError('التقييم غير موجود.', 404);
        if ($u['role'] !== 'admin' && (int)$e['supervisor_id'] !== (int)$u['id']) throw new ApiError('لا تملك صلاحية عرض هذا التقييم.', 403);
        $e['scores'] = json_decode($e['scores'], true);
        unset($e['ip']);
        out($e);
    }

    case 'eval.delete': {
        need('admin');
        q('DELETE FROM field_evals WHERE id = ?', [(int)($in['id'] ?? 0)]);
        audit('delete', 'eval', (int)($in['id'] ?? 0));
        out();
    }

    /* ---------- trainee accounts ---------- */
    case 'access.issue': {
        need('admin');
        $ids = array_map('intval', (array)($in['ids'] ?? []));
        $reset = !empty($in['reset']);
        if (!empty($in['all'])) $ids = array_map('intval', array_column(all('SELECT id FROM trainees WHERE user_id IS NULL'), 'id'));
        $n = 0;
        foreach ($ids as $id) {
            $t = one('SELECT * FROM trainees WHERE id = ?', [$id]); if (!$t) continue;
            $code = rand_code(8);
            if ($t['user_id']) {
                if (!$reset) continue;
                q('UPDATE users SET activation_code = ?, password_hash = NULL, active = 1 WHERE id = ?', [$code, $t['user_id']]);
            } else {
                $ex = val("SELECT id FROM users WHERE role = 'trainee' AND username = ?", [$t['acad']]);
                if ($ex) q('UPDATE users SET activation_code = ?, password_hash = NULL, active = 1, name = ? WHERE id = ?', [$code, $t['name'], $ex]);
                else { q("INSERT INTO users (role, username, name, phone, activation_code) VALUES ('trainee', ?, ?, ?, ?)", [$t['acad'], $t['name'], $t['phone'], $code]); $ex = (int)db()->lastInsertId(); }
                q('UPDATE trainees SET user_id = ? WHERE id = ?', [$ex, $t['id']]);
            }
            $n++;
        }
        audit('access_issue', 'trainee', null, 'عدد ' . $n . ($reset ? ' (إعادة تعيين)' : ''));
        out(['count' => $n]);
    }

    case 'access.toggle': {
        need('admin');
        $t = trainee_row((int)($in['id'] ?? 0));
        if (!$t['user_id']) throw new ApiError('لم يُفعَّل حساب لهذا المتدرب بعد.');
        q('UPDATE users SET active = 1 - active WHERE id = ?', [$t['user_id']]);
        audit('access_toggle', 'trainee', $t['id']);
        out();
    }

    /* ---------- staff ---------- */
    case 'staff.save': {
        $me = need('admin');
        $id = (int)($in['id'] ?? 0);
        $name = str_in($in, 'name', 150);
        $username = digits_only($in['username'] ?? '');
        $phone = nullish(digits_only($in['phone'] ?? ''));
        if ($name === '' || !preg_match('/^\d{3,20}$/', $username)) throw new ApiError('أكمل الاسم والرقم الوظيفي (أرقام فقط).');
        if (val("SELECT id FROM users WHERE role IN ('admin','supervisor') AND username = ? AND id <> ?", [$username, $id])) throw new ApiError('هذا الرقم الوظيفي مسجّل مسبقاً.');
        $pw = null;
        if ($id) {
            $old = one("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor')", [$id]);
            if (!$old) throw new ApiError('الحساب غير موجود.', 404);
            $role = ($in['role'] ?? $old['role']) === 'admin' ? 'admin' : 'supervisor';
            if ($id === (int)$me['id']) $role = 'admin';
            q('UPDATE users SET name = ?, username = ?, phone = ?, role = ? WHERE id = ?', [$name, $username, $phone, $role, $id]);
            if ($id === (int)$me['id']) { $_SESSION['user']['name'] = $name; $_SESSION['user']['username'] = $username; }
            audit('update', 'staff', $id, $name);
        } else {
            $pw = rand_code(10);
            q("INSERT INTO users (role, username, name, phone, password_hash, must_change) VALUES (?, ?, ?, ?, ?, 1)", [($in['role'] ?? '') === 'admin' ? 'admin' : 'supervisor', $username, $name, $phone, password_hash($pw, PASSWORD_DEFAULT)]);
            $id = (int)db()->lastInsertId();
            audit('create', 'staff', $id, $name);
        }
        out(['id' => $id, 'tempPassword' => $pw]);
    }

    case 'staff.reset': {
        need('admin');
        $u = one("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor') AND id <> ?", [(int)($in['id'] ?? 0), (int)me()['id']]);
        if (!$u) throw new ApiError('الحساب غير موجود.', 404);
        $pw = rand_code(10);
        q('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        audit('reset_password', 'staff', $u['id'], $u['name']);
        out(['tempPassword' => $pw]);
    }

    case 'staff.toggle': {
        need('admin');
        q("UPDATE users SET active = 1 - active WHERE id = ? AND role IN ('admin','supervisor') AND id <> ?", [(int)($in['id'] ?? 0), (int)me()['id']]);
        audit('toggle', 'staff', (int)($in['id'] ?? 0));
        out();
    }

    case 'staff.delete': {
        need('admin');
        $u = one("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor') AND id <> ?", [(int)($in['id'] ?? 0), (int)me()['id']]);
        if (!$u) throw new ApiError('الحساب غير موجود.', 404);
        q('DELETE FROM users WHERE id = ?', [$u['id']]);
        audit('delete', 'staff', $u['id'], $u['name']);
        out();
    }

    /* ---------- login support (admin) ---------- */
    case 'support.search': {
        need('admin');
        $qs = trim((string)($in['q'] ?? ''));
        $filter = (string)($in['filter'] ?? '');
        $sql = "SELECT u.id, u.role, u.username, u.name, u.phone, u.active, u.must_change, u.last_login, u.created_at,
                  (u.password_hash IS NOT NULL) AS has_password, (u.activation_code IS NOT NULL) AS has_code, u.activation_code,
                  t.id AS trainee_id, t.dept, t.specialty, t.entity,
                  (SELECT COUNT(*) FROM login_attempts a WHERE a.username = u.username AND a.success = 0 AND a.created_at > (NOW() - INTERVAL 15 MINUTE)) AS fails_recent,
                  (SELECT COUNT(*) FROM login_attempts a WHERE a.username = u.username AND a.success = 0 AND a.created_at > (NOW() - INTERVAL 7 DAY)) AS fails_week,
                  (SELECT MAX(a.created_at) FROM login_attempts a WHERE a.username = u.username AND a.success = 0) AS last_fail
                FROM users u LEFT JOIN trainees t ON t.user_id = u.id WHERE 1=1";
        $args = [];
        if ($qs !== '') { $like = '%' . $qs . '%'; $d = digits_only($qs); $dl = $d === '' ? $like : '%' . $d . '%'; $sql .= ' AND (u.name LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)'; array_push($args, $like, $dl, $dl); }
        if ($filter === 'staff') $sql .= " AND u.role IN ('admin','supervisor')";
        elseif ($filter === 'trainee') $sql .= " AND u.role = 'trainee'";
        elseif ($filter === 'locked') $sql .= " AND (SELECT COUNT(*) FROM login_attempts a WHERE a.username = u.username AND a.success = 0 AND a.created_at > (NOW() - INTERVAL 15 MINUTE)) >= 5";
        elseif ($filter === 'inactive') $sql .= ' AND u.active = 0';
        elseif ($filter === 'pending') $sql .= ' AND (u.password_hash IS NULL OR u.must_change = 1)';
        $sql .= " ORDER BY FIELD(u.role,'admin','supervisor','trainee'), u.name LIMIT 300";
        $rows = all($sql, $args);
        $unknown = all("SELECT a.username, COUNT(*) AS n, MAX(a.created_at) AS last FROM login_attempts a LEFT JOIN users u ON u.username = a.username
                        WHERE a.success = 0 AND a.created_at > (NOW() - INTERVAL 7 DAY) AND u.id IS NULL GROUP BY a.username ORDER BY last DESC LIMIT 30");
        $stats = one("SELECT SUM(role='trainee') AS trainees, SUM(role<>'trainee') AS staff, SUM(active=0) AS inactive,
                        SUM(password_hash IS NULL OR must_change=1) AS pending FROM users");
        $stats['locked'] = (int)val("SELECT COUNT(*) FROM (SELECT username FROM login_attempts WHERE success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE) GROUP BY username HAVING COUNT(*) >= 5) x");
        out(['rows' => $rows, 'unknown' => $unknown, 'stats' => $stats, 'me' => (int)me()['id']]);
    }

    case 'support.attempts': {
        need('admin');
        $u = one('SELECT username FROM users WHERE id = ?', [(int)($in['id'] ?? 0)]);
        $name = $u ? $u['username'] : digits_only($in['username'] ?? '');
        out(all('SELECT success, ip, created_at FROM login_attempts WHERE username = ? ORDER BY id DESC LIMIT 20', [$name]));
    }

    case 'support.unlock': {
        need('admin');
        $u = one('SELECT id, username, name FROM users WHERE id = ?', [(int)($in['id'] ?? 0)]);
        $name = $u ? $u['username'] : digits_only($in['username'] ?? '');
        if ($name === '') throw new ApiError('الحساب غير موجود.', 404);
        $n = q('DELETE FROM login_attempts WHERE username = ? AND success = 0', [$name])->rowCount();
        audit('unlock', 'user', $u['id'] ?? $name, ($u['name'] ?? $name) . ' – ' . $n);
        out(['cleared' => $n]);
    }

    case 'support.logout': {
        $me = need('admin');
        $id = (int)($in['id'] ?? 0);
        if ($id === (int)$me['id']) throw new ApiError('لا يمكنك إنهاء جلستك من هنا. استخدم «خروج».');
        $n = q('DELETE FROM app_sessions WHERE data LIKE ?', ['%s:2:"id";i:' . $id . ';s:4:"role"%'])->rowCount();
        audit('force_logout', 'user', $id, 'جلسات: ' . $n);
        out(['sessions' => $n]);
    }

    case 'support.reset': {
        $me = need('admin');
        $u = one('SELECT * FROM users WHERE id = ?', [(int)($in['id'] ?? 0)]);
        if (!$u) throw new ApiError('الحساب غير موجود.', 404);
        if ((int)$u['id'] === (int)$me['id']) throw new ApiError('لتغيير كلمة مرورك استخدم «الإعدادات» ← «حسابي».');
        q('DELETE FROM login_attempts WHERE username = ? AND success = 0', [$u['username']]);
        q('DELETE FROM app_sessions WHERE data LIKE ?', ['%s:2:"id";i:' . (int)$u['id'] . ';s:4:"role"%']);
        if ($u['role'] === 'trainee') {
            $code = rand_code(8);
            q('UPDATE users SET activation_code = ?, password_hash = NULL, must_change = 0, active = 1 WHERE id = ?', [$code, $u['id']]);
            audit('reset_access', 'trainee', $u['id'], $u['name']);
            out(['kind' => 'code', 'value' => $code]);
        }
        $pw = rand_code(10);
        q('UPDATE users SET password_hash = ?, must_change = 1, active = 1 WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        audit('reset_password', 'staff', $u['id'], $u['name']);
        out(['kind' => 'password', 'value' => $pw]);
    }

    case 'support.toggle': {
        $me = need('admin');
        $u = one('SELECT id, name, active FROM users WHERE id = ?', [(int)($in['id'] ?? 0)]);
        if (!$u) throw new ApiError('الحساب غير موجود.', 404);
        if ((int)$u['id'] === (int)$me['id']) throw new ApiError('لا يمكنك إيقاف حسابك.');
        q('UPDATE users SET active = 1 - active WHERE id = ?', [$u['id']]);
        if ((int)$u['active']) q('DELETE FROM app_sessions WHERE data LIKE ?', ['%s:2:"id";i:' . (int)$u['id'] . ';s:4:"role"%']);
        audit((int)$u['active'] ? 'deactivate' : 'activate_account', 'user', $u['id'], $u['name']);
        out(['active' => (int)$u['active'] ? 0 : 1]);
    }

    case 'support.delete': {
        $me = need('admin');
        $u = one('SELECT * FROM users WHERE id = ?', [(int)($in['id'] ?? 0)]);
        if (!$u) throw new ApiError('الحساب غير موجود.', 404);
        if ((int)$u['id'] === (int)$me['id']) throw new ApiError('لا يمكنك حذف حسابك.');
        $mode = ($in['mode'] ?? 'account') === 'all' ? 'all' : 'account';
        q('DELETE FROM app_sessions WHERE data LIKE ?', ['%s:2:"id";i:' . (int)$u['id'] . ';s:4:"role"%']);
        q('DELETE FROM login_attempts WHERE username = ?', [$u['username']]);
        if ($u['role'] === 'trainee' && $mode === 'all') {
            $t = one('SELECT * FROM trainees WHERE user_id = ?', [$u['id']]);
            if ($t) {
                foreach (all('SELECT report_file FROM visits WHERE trainee_id = ?', [$t['id']]) as $v) drop_file($v['report_file']);
                foreach (all('SELECT file FROM weekly_reports WHERE trainee_id = ?', [$t['id']]) as $v) drop_file($v['file']);
                q('DELETE FROM trainees WHERE id = ?', [$t['id']]);
            }
        }
        q('DELETE FROM users WHERE id = ?', [$u['id']]);
        audit('delete', $u['role'] === 'trainee' ? ($mode === 'all' ? 'trainee' : 'user') : 'staff', $u['id'], $u['name'] . ($mode === 'all' ? ' (مع كل بياناته)' : ' (الحساب فقط)'));
        out();
    }

    /* ---------- graduates ---------- */
    case 'grad.list':
        need('admin');
        out(all('SELECT * FROM graduates ORDER BY grad_term DESC, name'));

    case 'grad.save': {
        need('admin');
        $id = (int)($in['id'] ?? 0);
        $d = [
            'acad' => nullish(digits_only($in['acad'] ?? '')), 'name' => str_in($in, 'name', 150),
            'phone' => nullish(digits_only($in['phone'] ?? '')), 'email' => nullish(str_in($in, 'email', 150)),
            'dept' => nullish(str_in($in, 'dept', 100)), 'specialty' => nullish(str_in($in, 'specialty', 100)),
            'gpa' => nullish(str_in($in, 'gpa', 10)), 'grad_term' => nullish(str_in($in, 'grad_term', 40)),
            'status' => in_list($in['status'] ?? 'غير معروف', GRAD_ST, 'الحالة') ?: 'غير معروف',
            'employer' => nullish(str_in($in, 'employer', 200)), 'job_title' => nullish(str_in($in, 'job_title', 150)),
            'sector' => nullish(in_list($in['sector'] ?? '', SECTORS, 'القطاع')),
            'employed_on' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['employed_on'] ?? '')) ? $in['employed_on'] : null,
            'last_contact' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['last_contact'] ?? '')) ? $in['last_contact'] : null,
            'notes' => nullish(str_in($in, 'notes', 2000)),
        ];
        if ($d['name'] === '') throw new ApiError('أدخل اسم الخريج.');
        if ($d['email'] !== null && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) throw new ApiError('البريد الإلكتروني غير صحيح.');
        if ($id) { $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($d))); q("UPDATE graduates SET $set WHERE id = :id", $d + ['id' => $id]); audit('update', 'graduate', $id, $d['name']); }
        else { $keys = array_keys($d); q('INSERT INTO graduates (' . implode(',', $keys) . ') VALUES (:' . implode(',:', $keys) . ')', $d); $id = (int)db()->lastInsertId(); audit('create', 'graduate', $id, $d['name']); }
        out(['id' => $id]);
    }

    case 'grad.delete':
        need('admin');
        q('DELETE FROM graduates WHERE id = ?', [(int)($in['id'] ?? 0)]);
        audit('delete', 'graduate', (int)($in['id'] ?? 0));
        out();

    case 'grad.fromTrainees': {
        need('admin');
        $ids = array_map('intval', (array)($in['ids'] ?? []));
        $term = mb_substr(trim((string)($in['term'] ?? setting('semester_label', ''))), 0, 40);
        $n = 0;
        foreach ($ids as $id) {
            $t = one('SELECT * FROM trainees WHERE id = ?', [$id]); if (!$t) continue;
            if (val('SELECT id FROM graduates WHERE acad = ?', [$t['acad']])) continue;
            q('INSERT INTO graduates (acad, name, phone, dept, specialty, gpa, grad_term) VALUES (?,?,?,?,?,?,?)', [$t['acad'], $t['name'], $t['phone'], $t['dept'], $t['specialty'], $t['gpa'], $term]);
            q("UPDATE trainees SET reg_status = 'خريج' WHERE id = ?", [$id]);
            $n++;
        }
        audit('graduate', 'trainee', null, 'عدد ' . $n);
        out(['count' => $n]);
    }

    /* ---------- notices ---------- */
    case 'notice.save': {
        $u = need('admin');
        $title = str_in($in, 'title', 150);
        if ($title === '') throw new ApiError('اكتب عنوان الإعلان.');
        $aud = in_array($in['audience'] ?? '', ['all', 'trainees', 'supervisors'], true) ? $in['audience'] : 'trainees';
        q('INSERT INTO notices (title, body, audience, created_by) VALUES (?,?,?,?)', [$title, nullish(str_in($in, 'body', 3000)), $aud, $u['id']]);
        audit('create', 'notice', db()->lastInsertId(), $title);
        out();
    }
    case 'notice.delete':
        need('admin');
        q('DELETE FROM notices WHERE id = ?', [(int)($in['id'] ?? 0)]);
        audit('delete', 'notice', (int)($in['id'] ?? 0));
        out();

    /* ---------- trainee portal ---------- */
    case 'portal': {
        $u = need('trainee');
        $t = one('SELECT t.acad, t.name, t.dept, t.specialty, t.entity, t.sector, t.field_supervisor, t.field_supervisor_phone, t.reg_status, t.start_status, s.name AS supervisor_name, s.phone AS supervisor_phone FROM trainees t LEFT JOIN users s ON s.id = t.supervisor_id WHERE t.id = ?', [(int)$u['trainee_id']]);
        if (!$t) throw new ApiError('لم يُعثر على سجل تدريبك. تواصل مع مسؤول التدريب التعاوني.', 404);
        $visits = all('SELECT visit_date, type, attendance, rating, met_field FROM visits WHERE trainee_id = ? ORDER BY visit_date DESC', [(int)$u['trainee_id']]);
        $weekly = all('SELECT id, week, tasks, skills, challenges, hours, file_name, file IS NOT NULL AS has_file, status, sup_comment, submitted_at, reviewed_at FROM weekly_reports WHERE trainee_id = ? ORDER BY week DESC', [(int)$u['trainee_id']]);
        $notices = all("SELECT id, title, body, created_at FROM notices WHERE audience IN ('all','trainees') ORDER BY created_at DESC LIMIT 50");
        out(compact('t', 'visits', 'weekly', 'notices'));
    }

    /* ---------- admin: settings, audit ---------- */
    case 'settings.save': {
        need('admin');
        $start = (string)($in['semester_start'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) throw new ApiError('حدّد تاريخ بداية الفصل.');
        $weeks = (int)($in['semester_weeks'] ?? 17);
        if ($weeks < 1 || $weeks > 30) throw new ApiError('عدد الأسابيع بين 1 و30.');
        set_setting('college_name', str_in($in, 'college_name', 150) ?: 'الكلية التقنية ببيشة');
        set_setting('semester_label', str_in($in, 'semester_label', 100));
        set_setting('semester_start', $start);
        set_setting('semester_weeks', (string)$weeks);
        set_setting('admin_contact', str_in($in, 'admin_contact', 200));
        set_setting('require_visit_report', !empty($in['require_visit_report']) ? '1' : '0');
        set_setting('max_upload_mb', (string)max(1, min(50, (int)($in['max_upload_mb'] ?? 10))));
        audit('settings', 'settings');
        out();
    }

    case 'brand.upload': {
        need('admin');
        $kind = ($in['kind'] ?? '') === 'banner' ? 'banner' : 'logo';
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) throw new ApiError('اختر صورة.');
        if ($f['size'] > 3 * 1048576) throw new ApiError('حجم الصورة أكبر من 3 ميجابايت.');
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true)) throw new ApiError('ارفع صورة PNG أو JPG.');
        $dir = ROOT_DIR . '/uploads/brand'; if (!is_dir($dir)) mkdir($dir, 0755, true);
        $dest = $dir . '/' . ($kind === 'logo' ? 'logo.png' : 'banner.jpg');
        if (function_exists('imagecreatefromstring')) {
            $img = @imagecreatefromstring((string)file_get_contents($f['tmp_name']));
            if (!$img) throw new ApiError('تعذّرت قراءة الصورة.');
            if ($kind === 'logo') { imagesavealpha($img, true); imagepng($img, $dest); } else imagejpeg($img, $dest, 85);
            imagedestroy($img);
        } else move_uploaded_file($f['tmp_name'], $dest);
        audit('brand', 'settings', $kind);
        out(public_settings());
    }

    case 'audit.list': {
        need('admin');
        $kind = (string)($in['kind'] ?? '');
        $sql = 'SELECT id, user_name, action, target, target_id, details, ip, created_at FROM audit_log';
        $args = [];
        if ($kind === 'login') $sql .= " WHERE action IN ('login','login_fail','logout','activate')";
        elseif ($kind === 'changes') $sql .= " WHERE action NOT IN ('login','login_fail','logout','activate')";
        $sql .= ' ORDER BY id DESC LIMIT 300';
        $stats = one("SELECT SUM(action='login' AND created_at >= CURDATE()) AS today, SUM(action='login' AND created_at >= CURDATE() - INTERVAL 6 DAY) AS week, SUM(action='login_fail' AND created_at >= CURDATE() - INTERVAL 6 DAY) AS fails FROM audit_log");
        $roles = all("SELECT role, COUNT(*) AS n, SUM(last_login IS NOT NULL) AS logged FROM users GROUP BY role");
        out(['rows' => all($sql, $args), 'stats' => $stats, 'roles' => $roles]);
    }

    default:
        throw new ApiError('طلب غير معروف.', 404);
    }
}

/* ---------- GET endpoints: files and exports ---------- */
function handle_get(string $a): void {
    if ($a === 'file') {
        $u = need();
        $kind = $_GET['kind'] ?? ''; $id = (int)($_GET['id'] ?? 0);
        if ($kind === 'visit') {
            $r = one('SELECT v.report_file AS f, v.report_name AS n, t.supervisor_id, v.created_by FROM visits v JOIN trainees t ON t.id = v.trainee_id WHERE v.id = ?', [$id]);
            $ok = $r && ($u['role'] === 'admin' || ($u['role'] === 'supervisor' && ((int)$r['supervisor_id'] === (int)$u['id'] || (int)$r['created_by'] === (int)$u['id'])));
        } elseif ($kind === 'weekly') {
            $r = one('SELECT w.file AS f, w.file_name AS n, t.supervisor_id, w.trainee_id FROM weekly_reports w JOIN trainees t ON t.id = w.trainee_id WHERE w.id = ?', [$id]);
            $ok = $r && ($u['role'] === 'admin' || ($u['role'] === 'supervisor' && (int)$r['supervisor_id'] === (int)$u['id']) || ($u['role'] === 'trainee' && (int)$r['trainee_id'] === (int)$u['trainee_id']));
        } else $ok = false;
        if (!$ok || empty($r['f']) || !preg_match('/^[a-f0-9]{32}\.([a-z]{3,4})$/', $r['f'], $m)) { http_response_code(404); echo 'الملف غير موجود أو لا تملك صلاحية فتحه.'; exit; }
        $path = STORAGE_DIR . '/files/' . $r['f'];
        if (!is_file($path)) { http_response_code(404); echo 'الملف غير موجود.'; exit; }
        $mime = array_search($m[1], OK_MIME, true) ?: 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode($r['n'] ?: $r['f']));
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }
    if ($a === 'export') {
        need('admin');
        $kind = $_GET['kind'] ?? '';
        $d = date('Y-m-d');
        if ($kind === 'visits') {
            $rows = [['التاريخ', 'الأسبوع', 'المتدرب', 'الرقم التدريبي', 'القسم', 'التخصص', 'الجهة', 'نوع الزيارة', 'الانتظام', 'الأداء', 'لقاء المشرف الميداني', 'الملاحظات', 'المشرف', 'التقرير']];
            foreach (all('SELECT v.*, t.name, t.acad, t.dept, t.specialty, t.entity, u.name AS by_name FROM visits v JOIN trainees t ON t.id = v.trainee_id LEFT JOIN users u ON u.id = v.created_by ORDER BY v.visit_date') as $v)
                $rows[] = [$v['visit_date'], week_of($v['visit_date']), $v['name'], $v['acad'], $v['dept'], $v['specialty'], $v['entity'], $v['type'], $v['attendance'], $v['rating'], $v['met_field'] ? 'نعم' : 'لا', $v['notes'], $v['by_name'], $v['report_file'] ? 'مرفق' : ($v['report_url'] ?: 'لا يوجد')];
            csv_out("سجل-الزيارات-$d.csv", $rows);
        }
        if ($kind === 'trainees') {
            $rows = [['الرقم التدريبي', 'الاسم', 'رقم الهوية', 'الجوال', 'القسم', 'التخصص', 'المعدل', 'جهة التدريب', 'القطاع', 'المشرف الميداني', 'جوال المشرف الميداني', 'مشرف الكلية', 'اكتمال التسجيل', 'المباشرة', 'رقم الخطاب', 'عدد الزيارات', 'عدد التقارير الأسبوعية', 'تقييم الجهة', 'ملاحظات']];
            foreach (all('SELECT t.*, s.name AS sup, (SELECT COUNT(*) FROM visits v WHERE v.trainee_id = t.id) AS nv, (SELECT COUNT(*) FROM weekly_reports w WHERE w.trainee_id = t.id) AS nw, (SELECT MAX(total) FROM field_evals e WHERE e.trainee_id = t.id) AS ev FROM trainees t LEFT JOIN users s ON s.id = t.supervisor_id ORDER BY t.dept, t.name') as $t)
                $rows[] = [$t['acad'], $t['name'], $t['nid'], $t['phone'], $t['dept'], $t['specialty'], $t['gpa'], $t['entity'], $t['sector'], $t['field_supervisor'], $t['field_supervisor_phone'], $t['sup'], $t['reg_status'], $t['start_status'], $t['letter_no'], $t['nv'], $t['nw'], $t['ev'] === null ? '' : $t['ev'] . '%', $t['notes']];
            csv_out("كشف-المتدربين-$d.csv", $rows);
        }
        if ($kind === 'codes') {
            $rows = [['الرقم التدريبي', 'الاسم', 'القسم', 'الجوال', 'رمز التفعيل', 'حالة الحساب']];
            foreach (all('SELECT t.acad, t.name, t.dept, t.phone, u.activation_code, u.password_hash IS NOT NULL AS act FROM trainees t JOIN users u ON u.id = t.user_id ORDER BY t.dept, t.name') as $r)
                $rows[] = [$r['acad'], $r['name'], $r['dept'], $r['phone'], $r['activation_code'] ? substr($r['activation_code'], 0, 4) . '-' . substr($r['activation_code'], 4) : '', $r['act'] ? 'مفعّل' : 'بانتظار التفعيل'];
            csv_out("رموز-تفعيل-المتدربين-$d.csv", $rows);
        }
        if ($kind === 'graduates') {
            $rows = [['الرقم التدريبي', 'الاسم', 'الجوال', 'البريد', 'القسم', 'التخصص', 'المعدل', 'فصل التخرج', 'الحالة', 'جهة العمل', 'المسمى الوظيفي', 'القطاع', 'تاريخ التوظيف', 'آخر تواصل', 'ملاحظات']];
            foreach (all('SELECT * FROM graduates ORDER BY grad_term, name') as $g)
                $rows[] = [$g['acad'], $g['name'], $g['phone'], $g['email'], $g['dept'], $g['specialty'], $g['gpa'], $g['grad_term'], $g['status'], $g['employer'], $g['job_title'], $g['sector'], $g['employed_on'], $g['last_contact'], $g['notes']];
            csv_out("الخريجون-$d.csv", $rows);
        }
        if ($kind === 'evals') {
            $head = ['المتدرب', 'الرقم التدريبي', 'الجهة', 'المقيّم', 'صفته', 'التاريخ'];
            foreach (EVAL_CRITERIA as $c) $head[] = $c;
            array_push($head, 'النسبة', 'التوصية', 'الملاحظات');
            $rows = [$head];
            foreach (all('SELECT e.*, t.name, t.acad, t.entity FROM field_evals e JOIN trainees t ON t.id = e.trainee_id ORDER BY e.submitted_at') as $e) {
                $s = json_decode($e['scores'], true) ?: [];
                $r = [$e['name'], $e['acad'], $e['entity'], $e['evaluator_name'], $e['evaluator_title'], $e['submitted_at']];
                foreach (EVAL_CRITERIA as $i => $c) $r[] = $s[$i] ?? '';
                array_push($r, $e['total'] . '%', $e['recommend'], $e['comments']);
                $rows[] = $r;
            }
            csv_out("تقييمات-الجهات-$d.csv", $rows);
        }
        if ($kind === 'backup') {
            $tables = ['settings', 'users', 'trainees', 'visits', 'weekly_reports', 'field_evals', 'graduates', 'notices'];
            $dump = ['app' => 'coop-platform', 'version' => APP_VERSION, 'created_at' => date('c')];
            foreach ($tables as $t) $dump[$t] = all("SELECT * FROM $t");
            audit('backup', 'settings');
            header('Content-Type: application/json; charset=utf-8');
            header("Content-Disposition: attachment; filename=\"coop-backup-$d.json\"");
            header('Cache-Control: no-store');
            echo json_encode($dump, JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(404); echo 'نوع التصدير غير معروف.'; exit;
    }
    http_response_code(404); exit;
}

/* ---------- entry ---------- */
security_headers();
if (!installed()) fail('المنصة غير مثبّتة بعد. افتح install.php لإكمال التثبيت.', 503);
try {
    start_session();
    if (!empty($_SESSION['user'])) {
        $row = one('SELECT active FROM users WHERE id = ?', [$_SESSION['user']['id']]);
        if (!$row || !(int)$row['active']) { $_SESSION = ['csrf' => $_SESSION['csrf'] ?? bin2hex(random_bytes(24))]; }
    }
    $a = (string)($_GET['a'] ?? '');
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ($a === 'session') handle('session', []);
        handle_get($a);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('طريقة غير مدعومة.', 405);
    if (!hash_equals((string)$_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) fail('انتهت صلاحية الصفحة. حدّث الصفحة وأعد المحاولة.', 419);
    $in = $_POST;
    if (str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) $in = json_decode((string)file_get_contents('php://input'), true) ?: [];
    if (!empty($_SESSION['user']['must_change']) && !in_array($a, ['password', 'logout', 'session'], true)) fail('غيّر كلمة المرور المؤقتة أولاً.', 403);
    handle($a, $in);
} catch (ApiError $e) {
    fail($e->getMessage(), $e->status);
} catch (PDOException $e) {
    error_log('[coop] DB ' . $e->getMessage());
    fail('تعذّر حفظ البيانات أو قراءتها. أعد المحاولة، وإن تكرر فأبلغ مسؤول المنصة.', 500);
} catch (RuntimeException $e) {
    fail($e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('[coop] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('حدث خطأ في الخادم. أعد المحاولة، وإن تكرر فأبلغ مسؤول المنصة.', 500);
}

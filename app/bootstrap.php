<?php
declare(strict_types=1);

define('APP_DIR', __DIR__);
define('ROOT_DIR', dirname(__DIR__));
define('STORAGE_DIR', APP_DIR . '/storage');
define('APP_VERSION', '1.0.0');

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Riyadh');
ini_set('display_errors', '0');
error_reporting(E_ALL);

function config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $file = APP_DIR . '/config.php';
        $cfg = is_file($file) ? require $file : [];
    }
    return $cfg;
}

function installed(): bool { return is_file(APP_DIR . '/config.php'); }

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db_host'], (int)($c['db_port'] ?? 3306), $c['db_name']);
        $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+03:00'");
    }
    return $pdo;
}

function q(string $sql, array $args = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}
function one(string $sql, array $args = []): ?array { $r = q($sql, $args)->fetch(); return $r === false ? null : $r; }
function all(string $sql, array $args = []): array { return q($sql, $args)->fetchAll(); }
function val(string $sql, array $args = []) { $r = q($sql, $args)->fetchColumn(); return $r === false ? null : $r; }

function setting(string $k, ?string $default = null): ?string {
    static $cache = null;
    if ($cache === null) { $cache = []; foreach (all('SELECT k, v FROM settings') as $r) $cache[$r['k']] = $r['v']; }
    return $cache[$k] ?? $default;
}
function set_setting(string $k, ?string $v): void {
    q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$k, $v]);
}

function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }

function https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $dir = STORAGE_DIR . '/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) session_save_path($dir);
    session_name('coop_sid');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => https(), 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.gc_maxlifetime', '43200');
    ini_set('session.use_strict_mode', '1');
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
}

function security_headers(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    if (https()) header('Strict-Transport-Security: max-age=31536000');
}

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function to_ascii_digits(string $s): string {
    $ar = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩','۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    $en = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
    return str_replace($ar, $en, $s);
}
function digits_only($s): string { return preg_replace('/\D/', '', to_ascii_digits((string)$s)); }

function rand_code(int $len = 8): string {
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    $out = '';
    for ($i = 0; $i < $len; $i++) $out .= $chars[random_int(0, strlen($chars) - 1)];
    return $out;
}
function norm_code($s): string { return preg_replace('/[^a-z0-9]/', '', strtolower(to_ascii_digits((string)$s))); }

function audit(string $action, ?string $target = null, $targetId = null, string $details = ''): void {
    $u = $_SESSION['user'] ?? null;
    try {
        q('INSERT INTO audit_log (user_id, user_name, action, target, target_id, details, ip) VALUES (?,?,?,?,?,?,?)',
          [$u['id'] ?? null, $u['name'] ?? null, $action, $target, $targetId === null ? null : (string)$targetId, mb_substr($details, 0, 500), client_ip()]);
    } catch (Throwable $e) { /* audit must never break a request */ }
}

/* Semester */
function sem_start(): DateTimeImmutable { return new DateTimeImmutable(setting('semester_start', date('Y-m-d')) ?? date('Y-m-d')); }
function sem_weeks(): int { return max(1, (int)setting('semester_weeks', '17')); }
function week_of(string $date): int {
    $d = new DateTimeImmutable($date);
    $days = (int)floor(($d->getTimestamp() - sem_start()->getTimestamp()) / 86400);
    return (int)floor($days / 7) + 1;
}
function current_week(): int { return min(sem_weeks(), max(0, week_of(date('Y-m-d')))); }

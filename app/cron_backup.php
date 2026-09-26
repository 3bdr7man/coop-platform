<?php
/* نسخ احتياطي يومي — يُشغَّل من Cron Jobs في لوحة الاستضافة:
   php /home/USER/public_html/coop/app/cron_backup.php
   يحفظ نسخة مضغوطة في app/storage/backups ويبقي آخر 14 نسخة. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/bootstrap.php';
if (!installed()) exit("not installed\n");
$tables = ['settings', 'users', 'trainees', 'visits', 'weekly_reports', 'field_evals', 'graduates', 'notices'];
$dump = ['app' => 'coop-platform', 'version' => APP_VERSION, 'created_at' => date('c')];
foreach ($tables as $t) $dump[$t] = all("SELECT * FROM $t");
$dir = STORAGE_DIR . '/backups';
if (!is_dir($dir)) mkdir($dir, 0750, true);
$file = $dir . '/coop-' . date('Y-m-d_His') . '.json.gz';
file_put_contents($file, gzencode(json_encode($dump, JSON_UNESCAPED_UNICODE), 9));
$files = glob($dir . '/coop-*.json.gz') ?: [];
rsort($files);
foreach (array_slice($files, 14) as $old) @unlink($old);
q('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 30 DAY)');
echo "backup: $file\n";

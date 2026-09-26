<?php
declare(strict_types=1);
/* Minimal spreadsheet reader: .xlsx (first sheet) and .csv, no external libraries. */

function read_sheet(string $path, string $origName): array {
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    if ($ext === 'csv' || $ext === 'txt') return read_csv_file($path);
    if ($ext === 'xlsx') return read_xlsx($path);
    throw new RuntimeException('صيغة الملف غير مدعومة. استخدم ملف Excel بصيغة xlsx أو CSV.');
}

function read_csv_file(string $path): array {
    $raw = file_get_contents($path);
    if ($raw === false) throw new RuntimeException('تعذّرت قراءة الملف.');
    if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3);
    if (!mb_check_encoding($raw, 'UTF-8')) $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1256');
    $first = strtok($raw, "\n");
    $delim = (substr_count((string)$first, ';') > substr_count((string)$first, ',')) ? ';' : (substr_count((string)$first, "\t") > substr_count((string)$first, ',') ? "\t" : ',');
    $fh = fopen('php://memory', 'r+'); fwrite($fh, $raw); rewind($fh);
    $rows = [];
    while (($r = fgetcsv($fh, 0, $delim, '"', '')) !== false) $rows[] = array_map(fn($c) => trim((string)$c), $r);
    fclose($fh);
    return $rows;
}

function read_xlsx(string $path): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('الخادم لا يدعم قراءة ملفات Excel (امتداد zip غير مفعّل). احفظ الملف بصيغة CSV وارفعه.');
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new RuntimeException('ملف Excel تالف أو غير صالح.');
    $shared = [];
    $ss = $zip->getFromName('xl/sharedStrings.xml');
    if ($ss !== false) {
        $x = simplexml_load_string($ss, 'SimpleXMLElement', LIBXML_NONET);
        foreach ($x->si as $si) {
            if (isset($si->t)) { $shared[] = (string)$si->t; continue; }
            $t = ''; foreach ($si->r as $r) $t .= (string)$r->t; $shared[] = $t;
        }
    }
    $sheetPath = 'xl/worksheets/sheet1.xml';
    $wb = $zip->getFromName('xl/workbook.xml');
    $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
    if ($wb !== false && $rels !== false) {
        $w = simplexml_load_string($wb, 'SimpleXMLElement', LIBXML_NONET);
        $w->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $sheets = $w->xpath('//m:sheets/m:sheet');
        if ($sheets) {
            $rid = (string)$sheets[0]->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
            $r = simplexml_load_string($rels, 'SimpleXMLElement', LIBXML_NONET);
            foreach ($r->Relationship as $rel) {
                if ((string)$rel['Id'] === $rid) { $t = ltrim((string)$rel['Target'], '/'); $sheetPath = str_starts_with($t, 'xl/') ? $t : 'xl/' . $t; }
            }
        }
    }
    $xml = $zip->getFromName($sheetPath);
    $zip->close();
    if ($xml === false) throw new RuntimeException('لم يُعثر على ورقة بيانات في الملف.');
    $sx = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_COMPACT);
    $rows = [];
    foreach ($sx->sheetData->row as $row) {
        $cells = [];
        foreach ($row->c as $c) {
            $ref = (string)$c['r'];
            $col = col_index(preg_replace('/\d+/', '', $ref));
            $type = (string)$c['t'];
            if ($type === 's') $v = $shared[(int)$c->v] ?? '';
            elseif ($type === 'inlineStr') $v = (string)$c->is->t;
            else $v = (string)$c->v;
            if ($type === '' && preg_match('/^\d+\.0+$/', $v)) $v = (string)(int)$v;
            if ($type === '' && preg_match('/^\d+(\.\d+)?E\+\d+$/i', $v)) $v = number_format((float)$v, 0, '.', '');
            $cells[$col] = trim($v);
        }
        if (!$cells) continue;
        $max = max(array_keys($cells));
        $line = [];
        for ($i = 0; $i <= $max; $i++) $line[] = $cells[$i] ?? '';
        $rows[] = $line;
    }
    return $rows;
}

function col_index(string $letters): int {
    $n = 0;
    foreach (str_split(strtoupper($letters)) as $ch) $n = $n * 26 + (ord($ch) - 64);
    return $n - 1;
}

/* Guess which column holds which trainee field from Arabic/English headers. */
function guess_mapping(array $headers): array {
    $want = [
        'field_supervisor_phone' => ['جوال المشرف الميداني', 'جوال المشرف'],
        'field_supervisor' => ['المشرف الميداني', 'مشرف الجهة'],
        'supervisor_name' => ['مشرف الكلية', 'المشرف الأكاديمي', 'المدرب المشرف'],
        'sector' => ['القطاع', 'قطاع الجهة'],
        'letter_no' => ['رقم الخطاب'],
        'acad' => ['الرقم التدريبي', 'رقم المتدرب', 'الرقم الأكاديمي', 'رقم التدريب', 'الرقم الجامعي', 'student id', 'id'],
        'name' => ['اسم المتدرب', 'الاسم', 'اسم الطالب', 'name'],
        'nid' => ['رقم الهوية', 'السجل المدني', 'الهوية', 'national id'],
        'phone' => ['جوال المتدرب', 'الجوال', 'رقم الجوال', 'الهاتف', 'mobile', 'phone'],
        'dept' => ['القسم', 'department'],
        'specialty' => ['التخصص', 'specialty', 'major'],
        'gpa' => ['المعدل التراكمي', 'المعدل', 'gpa'],
        'entity' => ['جهة التدريب', 'الجهة', 'مكان التدريب'],
    ];
    $norm = fn($s) => preg_replace('/\s+/u', ' ', trim(str_replace(['أ','إ','آ','ة','ى'], ['ا','ا','ا','ه','ي'], mb_strtolower((string)$s))));
    $map = []; $used = [];
    foreach ($want as $field => $cands) {
        foreach ($headers as $i => $hd) {
            if (isset($used[$i])) continue;
            $n = $norm($hd);
            foreach ($cands as $c) {
                if ($n === $norm($c)) { $map[$field] = $i; $used[$i] = 1; continue 3; }
            }
        }
        foreach ($headers as $i => $hd) {
            if (isset($used[$i])) continue;
            $n = $norm($hd);
            foreach ($cands as $c) {
                if (mb_strlen($c) > 3 && mb_strpos($n, $norm($c)) !== false) { $map[$field] = $i; $used[$i] = 1; continue 3; }
            }
        }
    }
    return $map;
}

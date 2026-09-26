<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
security_headers();
header('Content-Type: text/html; charset=utf-8');
if (!installed()) { header('Location: install.php'); exit; }
$college = h(setting('college_name', 'الكلية التقنية ببيشة'));
$v = APP_VERSION;
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>منصة التدريب التعاوني – <?= $college ?></title>
<meta name="theme-color" content="#0D5A4E">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css?v=<?= $v ?>">
</head>
<body>
<div id="net" class="offline" hidden>لا يوجد اتصال بالإنترنت. ستُحدَّث البيانات عند عودة الاتصال.</div>
<header class="top"><div class="wrap">
  <div class="brand"><span class="mark txt" id="brandMark">TVTC</span><div><b>منصة التدريب التعاوني وشؤون الخريجين</b><span id="brandSub"><?= $college ?> – المؤسسة العامة للتدريب التقني والمهني</span></div></div>
  <div class="who" id="who"></div>
</div></header>
<nav class="tabs" id="tabs" hidden><div class="wrap" id="tabsInner"></div></nav>
<main><div class="wrap" id="app"><div class="empty">جارٍ فتح المنصة…</div></div></main>
<div id="drawer"></div>
<div id="modal"></div>
<div id="toast"></div>
<noscript><div class="wrap"><div class="panel">فعّل JavaScript في المتصفح لاستخدام المنصة.</div></div></noscript>
<script src="assets/app.js?v=<?= $v ?>"></script>
</body>
</html>

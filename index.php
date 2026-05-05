<?php
declare(strict_types=1);

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';

$route = $_GET['r'] ?? '';

if ($route === 'logout') {
    logout();
    header('Location: index.php');
    exit;
}

if (!isSetup()) {
    $error = '';
    if ($route === 'setup' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $pw = (string)($_POST['password'] ?? '');
        $pw2 = (string)($_POST['password2'] ?? '');
        if (strlen($pw) < 8) {
            $error = 'Password must be at least 8 characters.';
        } elseif ($pw !== $pw2) {
            $error = 'Passwords do not match.';
        } else {
            setupPassword($pw);
            login($pw);
            header('Location: index.php');
            exit;
        }
    }
    include __DIR__ . '/views/setup.php';
    exit;
}

if (!isAuthed()) {
    $error = '';
    if ($route === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $pw = (string)($_POST['password'] ?? '');
        if (login($pw)) {
            header('Location: index.php');
            exit;
        }
        $error = 'Wrong password.';
        usleep(500000);
    }
    include __DIR__ . '/views/login.php';
    exit;
}

if ($route === 'api') {
    require __DIR__ . '/lib/api.php';
    apiHandle((string)($_GET['action'] ?? ''));
    exit;
}

if ($route === 'import' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require __DIR__ . '/lib/parser.php';
    if (!checkCsrf((string)($_POST['csrf'] ?? ''))) {
        http_response_code(403);
        echo 'CSRF check failed';
        exit;
    }
    if (empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
        header('Location: index.php?msg=no_file');
        exit;
    }
    $html = file_get_contents($_FILES['file']['tmp_name']);
    $tree = parseNetscape($html);
    $counts = ['categories' => 0, 'bookmarks' => 0];
    db()->beginTransaction();
    try {
        importTree($tree, null, $counts);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        header('Location: index.php?msg=import_failed');
        exit;
    }
    header('Location: index.php?msg=imported&c=' . $counts['categories'] . '&b=' . $counts['bookmarks']);
    exit;
}

include __DIR__ . '/views/app.php';

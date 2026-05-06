<?php
declare(strict_types=1);

function isHttps(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function startSessionOnce(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => isHttps(),
        ]);
        session_name('BMSESS');
        session_start();
    }
}

function isSetup(): bool {
    return setting('password_hash') !== null;
}

function setupPassword(string $password): void {
    setting('password_hash', password_hash($password, PASSWORD_DEFAULT));
}

function login(string $password): bool {
    $hash = setting('password_hash');
    if (!$hash || !password_verify($password, $hash)) return false;
    startSessionOnce();
    session_regenerate_id(true);
    $_SESSION['authed'] = true;
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return true;
}

function logout(): void {
    startSessionOnce();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function isAuthed(): bool {
    startSessionOnce();
    return !empty($_SESSION['authed']);
}

function csrfToken(): string {
    startSessionOnce();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

function checkCsrf(string $token): bool {
    startSessionOnce();
    return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

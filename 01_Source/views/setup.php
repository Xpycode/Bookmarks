<?php /** @var string $error */ ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f1115">
<link rel="manifest" href="manifest.webmanifest">
<title>Set up your bookmark manager</title>
<link rel="stylesheet" href="<?= asset('app.css') ?>">
</head>
<body class="auth-page">
<form class="auth-card" method="post" action="index.php?r=setup" autocomplete="off">
    <h1>First-run setup</h1>
    <p>Pick a password to protect your bookmarks. This is the only account.</p>
    <?php if (!empty($error)): ?><div class="auth-error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <label>Password
        <input type="password" name="password" required minlength="8" autofocus>
    </label>
    <label>Repeat password
        <input type="password" name="password2" required minlength="8">
    </label>
    <button type="submit">Create account</button>
</form>
</body>
</html>

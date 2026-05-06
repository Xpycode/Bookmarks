<?php /** @var string $error */ ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in</title>
<link rel="stylesheet" href="public/app.css">
</head>
<body class="auth-page">
<form class="auth-card" method="post" action="index.php?r=login" autocomplete="on">
    <h1>Sign in</h1>
    <?php if (!empty($error)): ?><div class="auth-error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <label>Password
        <input type="password" name="password" required autofocus>
    </label>
    <button type="submit">Sign in</button>
</form>
</body>
</html>

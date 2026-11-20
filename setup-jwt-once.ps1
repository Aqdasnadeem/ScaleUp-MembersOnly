# Run ONCE. Creates a random 32-byte JWT secret in your Windows user environment. It is never printed or saved in a file.
# Warning: changing the secret logs everyone out (old tokens stop working).
$b = New-Object byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($b)
[Environment]::SetEnvironmentVariable("JWT_SECRET", [Convert]::ToBase64String($b), "User")
"JWT_SECRET saved for your user (length: " + [Convert]::ToBase64String($b).Length + "). Open a new PowerShell window."

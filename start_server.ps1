# AshaGuard GPS - Zero-Admin Raw TCP Socket Web Server
# Serves the public directory on port 3000 and allows external mobile connections without Admin rights

$port = 3000

# Bind to 0.0.0.0 (IPAddress.Any) to listen on all interfaces (loopback & Wi-Fi)
# This does NOT require Administrator rights in Windows!
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)

# Discover Wi-Fi IP Address
$ip = (Get-NetIPAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
if (-not $ip) {
    # Fallback to search any active ethernet/wireless IP
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch "127.0.0.1|169.254|172\." } | Select-Object -First 1).IPAddress
}

$publicDir = Join-Path $PSScriptRoot "..\frontend"

try {
    $listener.Start()
    
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " ASHA GPS Zone Detection App is running!" -ForegroundColor Green
    Write-Host " Local Link (on computer): http://localhost:$port/" -ForegroundColor Cyan
    if ($ip) {
        Write-Host " Mobile Link (on same Wi-Fi): http://${ip}:${port}/" -ForegroundColor Green
    } else {
        Write-Host " Wi-Fi IP could not be auto-detected. Make sure Wi-Fi is on." -ForegroundColor Yellow
    }
    Write-Host " Press Ctrl+C in this window to stop the server." -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Green

    # Request polling loop
    while ($true) {
        if (-not $listener.Pending()) {
            Start-Sleep -Milliseconds 30
            continue
        }

        try {
            $client = $listener.AcceptTcpClient()
            $stream = $client.GetStream()
            
            # Read HTTP request header
            $buffer = New-Object System.Byte[] 2048
            $readBytes = $stream.Read($buffer, 0, $buffer.Length)
            $requestStr = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $readBytes)
            
            # Parse GET requests
            if ($requestStr -match "GET (\S+) HTTP") {
                $urlPath = $Matches[1]
                $urlPath = $urlPath.Split('?')[0].Split('#')[0]
                if ($urlPath -eq "/") { $urlPath = "/index.html" }

                $subPath = $urlPath.TrimStart('/')
                $filePath = Join-Path $publicDir $subPath

                # Log request to console
                $clientIp = $client.Client.RemoteEndPoint.Address.IPAddressToString
                Write-Host "[$((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))] $clientIp -> GET $urlPath"

                if (Test-Path $filePath -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $mimeType = switch ($ext) {
                        ".html" { "text/html" }
                        ".css"  { "text/css" }
                        ".js"   { "text/javascript" }
                        ".json" { "application/json" }
                        ".png"  { "image/png" }
                        ".jpg"  { "image/jpeg" }
                        ".svg"  { "image/svg+xml" }
                        default { "application/octet-stream" }
                    }

                    $contentBytes = [System.IO.File]::ReadAllBytes($filePath)
                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $mimeType; charset=utf-8`r`nContent-Length: $($contentBytes.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($contentBytes, 0, $contentBytes.Length)
                } else {
                    $body = "404 Not Found"
                    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                    $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($bodyBytes.Length)`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
                }
            }
            $stream.Close()
            $client.Close()
        } catch {
            # Catch client socket closure errors silently to prevent loop crashes
            Write-Verbose "Socket Exception: $_"
        }
    }
} catch {
    Write-Error $_
} finally {
    if ($listener) {
        $listener.Stop()
    }
}

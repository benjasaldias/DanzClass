# Run once as Administrator to forward WSL2 ports to Windows host
# Allows iPhone on same WiFi to reach the Expo dev server

$wslIP = (wsl hostname -I).Trim().Split(' ')[0]
Write-Host "WSL2 IP: $wslIP"

# Forward Metro bundler and Expo DevTools ports
foreach ($port in @(8081, 19000, 19001, 19002)) {
    netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIP connectport=$port
}

# Allow through Windows Firewall
New-NetFirewallRule -DisplayName "Expo Dev Server" -Direction Inbound -LocalPort 8081,19000,19001,19002 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

$winIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" }).IPAddress
Write-Host ""
Write-Host "Done! Start Expo in WSL2 with:"
Write-Host "  REACT_NATIVE_PACKAGER_HOSTNAME=$winIP npx expo start"
Write-Host ""
Write-Host "Then scan the QR code with Expo Go on iPhone."
Write-Host "To remove the port forwarding later, run setup-wsl2-port-forward-remove.ps1"

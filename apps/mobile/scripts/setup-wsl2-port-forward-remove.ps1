# Run as Administrator to remove the WSL2 port forwarding rules
foreach ($port in @(8081, 19000, 19001, 19002)) {
    netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port
}
Remove-NetFirewallRule -DisplayName "Expo Dev Server" -ErrorAction SilentlyContinue
Write-Host "Port forwarding removed."

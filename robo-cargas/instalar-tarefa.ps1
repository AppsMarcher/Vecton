# Cria a tarefa agendada do robo no Windows (rodar uma vez, como administrador, no servidor do robo).
# A tarefa dispara a cada 15 minutos; o proprio robo decide, pela configuracao no Vecton
# (tabela carga_automatica_config), se ha carga devida naquele momento.
#
#   .\instalar-tarefa.ps1 -Conta "MARCHER\robo.vecton"
param(
  [Parameter(Mandatory = $true)][string]$Conta,
  [string]$Node = (Get-Command node).Source,
  [string]$Pasta = $PSScriptRoot
)

$cred = Get-Credential -UserName $Conta -Message "Senha da conta que vai executar o robo"
$senha = $cred.GetNetworkCredential().Password

# A senha do usuario do Vecton fica numa variavel de ambiente da CONTA do robo (nao em arquivo).
$vecton = Read-Host "Senha do usuario do Vecton (robo.vecton@marcher.com.br)" -AsSecureString
$vectonTxt = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($vecton))

$acao = New-ScheduledTaskAction -Execute $Node -Argument "src\index.js run" -WorkingDirectory $Pasta
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15)
$cfg = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Vecton - Robo de Cargas" -Action $acao -Trigger $gatilho -Settings $cfg `
  -User $Conta -Password $senha -RunLevel Limited -Force | Out-Null

# Variavel de ambiente de usuario (lida pela tarefa da conta do robo).
[Environment]::SetEnvironmentVariable("VECTON_ROBO_SENHA", $vectonTxt, "User")
Write-Host "Tarefa criada. Rode 'node src\index.js vendas --dry-run' para a primeira simulacao."
Write-Host "Obs.: a variavel VECTON_ROBO_SENHA foi gravada para o usuario atual; se a conta do robo for outra, defina-a logado como ela."

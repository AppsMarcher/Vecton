# Cria a tarefa agendada do robo no Windows (rodar uma vez, como administrador, no servidor do robo).
# A tarefa dispara a cada 15 minutos; o proprio robo decide, pela configuracao no Vecton
# (tabela carga_automatica_config), se ha carga devida naquele momento.
#
# IMPORTANTE: execute este script LOGADO COMO A CONTA QUE VAI RODAR A TAREFA. As senhas sao gravadas
# como variaveis de ambiente do USUARIO atual; se o script rodar com outra conta, a tarefa nao as enxerga.
#
#   .\instalar-tarefa.ps1 -Conta "MARCHER\svc_robo_vecton"
param(
  [Parameter(Mandatory = $true)][string]$Conta,
  [string]$Node = (Get-Command node).Source,
  [string]$Pasta = $PSScriptRoot
)

function Ler-Segredo($mensagem) {
  $s = Read-Host $mensagem -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

$cred = Get-Credential -UserName $Conta -Message "Senha da conta do Windows que vai executar a tarefa"
$senhaConta = $cred.GetNetworkCredential().Password

$vecton = Ler-Segredo "Senha do usuario do Vecton (robo.vecton@marcher.com.br)"
[Environment]::SetEnvironmentVariable("VECTON_ROBO_SENHA", $vecton, "User")

$cfg = Get-Content (Join-Path $Pasta "config.json") -Raw | ConvertFrom-Json
if ($cfg.protheus.auth -eq "sql") {
  $banco = Ler-Segredo "Senha do usuario do SQL Server ($($cfg.protheus.user))"
  [Environment]::SetEnvironmentVariable("PROTHEUS_SENHA", $banco, "User")
}

$acao = New-ScheduledTaskAction -Execute $Node -Argument "src\index.js run" -WorkingDirectory $Pasta
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15)
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Vecton - Robo de Cargas" -Action $acao -Trigger $gatilho -Settings $opcoes `
  -User $Conta -Password $senhaConta -RunLevel Limited -Force | Out-Null

Write-Host "Tarefa 'Vecton - Robo de Cargas' criada (a cada 15 min)."
Write-Host "Teste: node src\index.js vendas --dry-run   (nao grava no Vecton)"

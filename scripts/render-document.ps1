param(
  [string]$DocumentPath = (Join-Path $PSScriptRoot '..\docs\project-overview.docx'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\docs\.render'),
  [Parameter(Mandatory=$true)][string]$PopplerDirectory
)
$ErrorActionPreference = 'Stop'
$taskInputPath = (Resolve-Path -LiteralPath $DocumentPath).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$taskOutputPath = (Resolve-Path -LiteralPath $OutputDirectory).Path
$taskPdfPath = Join-Path $taskOutputPath 'project-overview.pdf'
$taskWord = $null
$taskDocument = $null
try {
  $taskWord = New-Object -ComObject Word.Application
  $taskWord.Visible = $false
  $taskWord.DisplayAlerts = 0
  $taskDocument = $taskWord.Documents.Open($taskInputPath, $false, $true)
  $taskDocument.ExportAsFixedFormat($taskPdfPath, 17)
} finally {
  if ($taskDocument) { $taskDocument.Close(0); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskDocument) }
  if ($taskWord) { $taskWord.Quit(); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskWord) }
}
& (Join-Path $PopplerDirectory 'pdfinfo.exe') $taskPdfPath
if ($LASTEXITCODE -ne 0) { throw 'PDF inspection failed' }
& (Join-Path $PopplerDirectory 'pdftoppm.exe') -r 110 -png $taskPdfPath (Join-Path $taskOutputPath 'page')
if ($LASTEXITCODE -ne 0) { throw 'Page rendering failed' }
Get-ChildItem -LiteralPath $taskOutputPath -Filter 'page-*.png' | Select-Object Name,Length

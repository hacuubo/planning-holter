<#
    copier-sauvegardes.ps1
    ----------------------
    Recopie chaque jour les sauvegardes du planning Holter dans un dossier
    du cabinet (dossier partagé, OneDrive, disque réseau…).

    C'est ce qui répond à la demande : « les données doivent être sauvegardées
    sur un cloud ET dans un dossier qu'on définira, sur 7 jours glissants ».

    ------------------------------------------------------------------------
    INSTALLATION (une seule fois, sur l'ordinateur qui reste allumé)
    ------------------------------------------------------------------------
    1. Copiez ce fichier et le fichier « parametres-sauvegarde.txt » dans un
       dossier de votre choix, par exemple  C:\PlanningHolter\
    2. Ouvrez « parametres-sauvegarde.txt » et complétez les 3 lignes.
    3. Ouvrez le Planificateur de tâches Windows :
         • Créer une tâche de base…
         • Nom : « Sauvegarde planning Holter »
         • Déclencheur : Tous les jours, à 08h00
         • Action : Démarrer un programme
             Programme  : powershell.exe
             Arguments  : -ExecutionPolicy Bypass -File "C:\PlanningHolter\copier-sauvegardes.ps1"
         • Terminer.
    ------------------------------------------------------------------------
#>

$ErrorActionPreference = 'Stop'

# --- Lecture des paramètres --------------------------------------------------

$dossierScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$fichierParametres = Join-Path $dossierScript 'parametres-sauvegarde.txt'

if (-not (Test-Path $fichierParametres)) {
    Write-Error "Fichier de paramètres introuvable : $fichierParametres"
    exit 1
}

$parametres = @{}
foreach ($ligne in Get-Content $fichierParametres -Encoding UTF8) {
    if ($ligne -match '^\s*#' -or $ligne -notmatch '=') { continue }
    $cle, $valeur = $ligne -split '=', 2
    $parametres[$cle.Trim()] = $valeur.Trim()
}

$adresseSupabase   = $parametres['ADRESSE_SUPABASE']
$cleService        = $parametres['CLE_SERVICE']
$dossierDestination = $parametres['DOSSIER_DESTINATION']
$joursConservation = 7
if ($parametres['JOURS_CONSERVATION']) { $joursConservation = [int]$parametres['JOURS_CONSERVATION'] }

if (-not $adresseSupabase -or -not $cleService -or -not $dossierDestination) {
    Write-Error "Complétez ADRESSE_SUPABASE, CLE_SERVICE et DOSSIER_DESTINATION dans $fichierParametres"
    exit 1
}

$adresseSupabase = $adresseSupabase.TrimEnd('/')
if (-not (Test-Path $dossierDestination)) {
    New-Item -ItemType Directory -Path $dossierDestination -Force | Out-Null
}

$entetes = @{
    'apikey'        = $cleService
    'Authorization' = "Bearer $cleService"
    'Content-Type'  = 'application/json'
}

# --- Liste des sauvegardes disponibles ---------------------------------------

Write-Output "Consultation de l'espace de sauvegarde…"
$corps = @{ prefix = ''; limit = 1000; sortBy = @{ column = 'name'; order = 'asc' } } | ConvertTo-Json
$fichiers = Invoke-RestMethod -Method Post -Uri "$adresseSupabase/storage/v1/object/list/sauvegardes" `
                              -Headers $entetes -Body $corps

if (-not $fichiers) {
    Write-Output "Aucune sauvegarde disponible pour le moment."
    exit 0
}

# --- Téléchargement des fichiers manquants -----------------------------------

$telecharges = 0
foreach ($fichier in $fichiers) {
    $destination = Join-Path $dossierDestination $fichier.name
    if (Test-Path $destination) { continue }

    $url = "$adresseSupabase/storage/v1/object/sauvegardes/" + [uri]::EscapeDataString($fichier.name)
    try {
        Invoke-WebRequest -Uri $url -Headers $entetes -OutFile $destination -UseBasicParsing
        Write-Output "Téléchargé : $($fichier.name)"
        $telecharges++
    }
    catch {
        Write-Warning "Échec du téléchargement de $($fichier.name) : $_"
    }
}

# --- Purge locale : on ne garde que les 7 derniers jours ---------------------

$limite = (Get-Date).AddDays(-$joursConservation)
$supprimes = 0
foreach ($local in Get-ChildItem -Path $dossierDestination -File) {
    if ($local.Name -notmatch '(\d{2})-(\d{2})-(\d{4})\.') { continue }
    $dateFichier = Get-Date -Year ([int]$Matches[3]) -Month ([int]$Matches[2]) -Day ([int]$Matches[1]) `
                            -Hour 0 -Minute 0 -Second 0
    if ($dateFichier -lt $limite) {
        Remove-Item $local.FullName -Force -Confirm:$false
        Write-Output "Supprimé (plus de $joursConservation jours) : $($local.Name)"
        $supprimes++
    }
}

Write-Output ""
Write-Output "Terminé : $telecharges fichier(s) copié(s), $supprimes supprimé(s)."
Write-Output "Dossier : $dossierDestination"

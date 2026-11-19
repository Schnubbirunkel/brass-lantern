; Brass Lantern – Windows installer (per user, no admin rights needed)
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "Brass Lantern"
!define EXENAME "Brass Lantern.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\BrassLantern"
!ifndef VERSION
  !define VERSION "1.1.0"
!endif

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\BrassLantern" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Brass Lantern starten"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_GERMAN} "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=${LANG_GERMAN} "FileDescription" "${APPNAME} Setup"
VIAddVersionKey /LANG=${LANG_GERMAN} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_GERMAN} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_GERMAN} "LegalCopyright" "GPL-3.0"

!macro Assoc EXT
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "BrassLantern.Story" ""
!macroend
!macro UnAssoc EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "BrassLantern.Story"
!macroend

Section "Brass Lantern" SecMain
  SectionIn RO
  ; close a running instance
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "Software\BrassLantern" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "Brass Lantern"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" "$0"
  ; "Open with" registration for story files
  WriteRegStr HKCU "Software\Classes\BrassLantern.Story" "" "Interactive-Fiction-Story"
  WriteRegStr HKCU "Software\Classes\BrassLantern.Story\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\BrassLantern.Story\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'
  !insertmacro Assoc z3
  !insertmacro Assoc z4
  !insertmacro Assoc z5
  !insertmacro Assoc z8
  !insertmacro Assoc zblorb
  !insertmacro Assoc zlb
  !insertmacro Assoc ulx
  !insertmacro Assoc gblorb
  !insertmacro Assoc glb
  !insertmacro Assoc blorb
  !insertmacro Assoc gam
  !insertmacro Assoc t3
  !insertmacro Assoc hex
  !insertmacro Assoc taf
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Verknüpfung auf dem Desktop" SecDesktop
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\BrassLantern"
  DeleteRegKey HKCU "Software\Classes\BrassLantern.Story"
  !insertmacro UnAssoc z3
  !insertmacro UnAssoc z4
  !insertmacro UnAssoc z5
  !insertmacro UnAssoc z8
  !insertmacro UnAssoc zblorb
  !insertmacro UnAssoc zlb
  !insertmacro UnAssoc ulx
  !insertmacro UnAssoc gblorb
  !insertmacro UnAssoc glb
  !insertmacro UnAssoc blorb
  !insertmacro UnAssoc gam
  !insertmacro UnAssoc t3
  !insertmacro UnAssoc hex
  !insertmacro UnAssoc taf
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

LangString DESC_Main ${LANG_GERMAN} "Das Programm selbst."
LangString DESC_Desktop ${LANG_GERMAN} "Legt eine Verknüpfung auf dem Desktop an."
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_Main)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_Desktop)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

!macro NSIS_HOOK_POSTINSTALL
  ; Runtime data lives in %PROGRAMDATA%\Drake, not %LOCALAPPDATA%\Drake: the
  ; scheduled task below runs as SYSTEM, and %LOCALAPPDATA% for SYSTEM
  ; resolves to the systemprofile, not the interactive user. %PROGRAMDATA%
  ; resolves the same for both. The unelevated tray also writes plugins\
  ; under this directory, so it needs write access for ordinary users.
  CreateDirectory "$%PROGRAMDATA%\Drake"
  ; S-1-5-32-545 is the well-known Users SID. Do not use the name "Users" —
  ; it is localized and would fail on a non-English Windows.
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$%PROGRAMDATA%\Drake" /grant *S-1-5-32-545:(OI)(CI)M'

  ; The task's action is fixed. Never accept the registry value as a
  ; parameter: any unprivileged process could then trigger this task and have
  ; Windows run an arbitrary elevated command at the next client launch.
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Create /F /TN "Drake Slot Activation" /SC ONCE /ST 00:00 /RL HIGHEST /RU "SYSTEM" /TR "\"$INSTDIR\Drake.exe\" --activate-slot"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The uninstaller already runs elevated, so it can clear the IFEO value
  ; directly. --deactivate-slot only removes it when it still points at our
  ; own core.dll, leaving another product's value untouched.
  nsExec::ExecToLog '"$INSTDIR\Drake.exe" --deactivate-slot'
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /F /TN "Drake Slot Activation"'
!macroend

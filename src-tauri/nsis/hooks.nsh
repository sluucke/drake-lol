!macro NSIS_HOOK_POSTINSTALL
  ; The task's action is fixed. Never accept the registry value as a
  ; parameter: any unprivileged process could then trigger this task and have
  ; Windows run an arbitrary elevated command at the next client launch.
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Create /F /TN "Drake Slot Activation" /SC ONCE /ST 00:00 /RL HIGHEST /RU "SYSTEM" /TR "\"$INSTDIR\Drake.exe\" --activate-slot"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /F /TN "Drake Slot Activation"'
!macroend

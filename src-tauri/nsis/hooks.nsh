!macro NSIS_HOOK_POSTINSTALL
  ; Runtime data lives in %PROGRAMDATA%\Drake, not %LOCALAPPDATA%\Drake: the
  ; scheduled task below runs as SYSTEM, and %LOCALAPPDATA% for SYSTEM
  ; resolves to the systemprofile, not the interactive user. %PROGRAMDATA%
  ; resolves the same for both.
  ;
  ; The ACLs below are load-bearing, not housekeeping. core.dll is named by a
  ; machine-wide HKLM value and is executed inside whichever user's session
  ; launches League -- including an administrator's. If a standard user could
  ; write it, user A could replace it and have it run as user B. So only the
  ; two directories the unelevated tray actually writes are opened up:
  ;
  ;   Drake\               default ACL (admins write, users read)
  ;   Drake\loader\core.dll  placed here by this elevated installer, admin-only
  ;   Drake\loader\plugins\  Users:M -- the tray deploys our plugin here
  ;   Drake\state\           Users:M -- settings.json lives here
  CreateDirectory "$%PROGRAMDATA%\Drake"
  ; Strips any explicit grant left by an older Drake, which granted Users
  ; modify over the whole tree (and therefore over core.dll). Without this,
  ; upgrading from such an install would keep the weak ACL forever. /T walks
  ; the existing tree; /C keeps going if a single file is locked.
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$%PROGRAMDATA%\Drake" /reset /T /C'

  CreateDirectory "$%PROGRAMDATA%\Drake\loader"
  CreateDirectory "$%PROGRAMDATA%\Drake\loader\plugins"
  CreateDirectory "$%PROGRAMDATA%\Drake\state"

  ; The vendored loader ships as a bundle resource. Tauri's generated
  ; installer.nsi writes it to $INSTDIR\vendor\pengu-loader\core.dll in
  ; "Section Install", which runs before this hook, so the file is on disk
  ; here. Copying it from the elevated installer is what lets core.dll keep
  ; an admin-only ACL: the unelevated tray no longer needs to write it.
  ; If the copy fails (most plausibly: core.dll is mapped by a client running
  ; under our own loader during an upgrade), the tray notices the mismatch on
  ; its next tick and reports it as an Inactive reason asking for a reinstall.
  CopyFiles /SILENT "$INSTDIR\vendor\pengu-loader\core.dll" "$%PROGRAMDATA%\Drake\loader\core.dll"

  ; S-1-5-32-545 is the well-known Users SID. Do not use the name "Users" —
  ; it is localized and would fail on a non-English Windows.
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$%PROGRAMDATA%\Drake\loader\plugins" /grant *S-1-5-32-545:(OI)(CI)M'
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$%PROGRAMDATA%\Drake\state" /grant *S-1-5-32-545:(OI)(CI)M'

  ; The task's action is fixed. Never accept the registry value as a
  ; parameter: any unprivileged process could then trigger this task and have
  ; Windows run an arbitrary elevated command at the next client launch.
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Create /F /TN "Drake Slot Activation" /SC ONCE /ST 00:00 /RL HIGHEST /RU "SYSTEM" /TR "\"$INSTDIR\Drake.exe\" --activate-slot"'

  ; Without this the whole activation design is dead on arrival, and silently:
  ; a task created by an elevated installer with /RU SYSTEM gets a default DACL
  ; that grants standard users NOTHING. The unelevated tray then gets "Access
  ; denied" from both /Query and /Run, so it can never claim the slot. Measured
  ; on a real install, not theorised.
  ;
  ; So grant Users read+execute on the task object:
  ;   BA = Administrators, SY = SYSTEM  -> full control (GA)
  ;   BU = Users                        -> read + execute (GR GX) only
  ; Users can therefore TRIGGER the task, but not read its definition for
  ; modification, redefine it, or delete it.
  ;
  ; Letting any local user pull this trigger is deliberate and safe by
  ; construction, not an oversight: the action takes no arguments, Drake.exe
  ; lives in an admin-only $INSTDIR, core.dll is admin-only inside
  ; %PROGRAMDATA%\Drake\loader, and `elevate::activate` re-reads the slot and
  ; writes one fixed value derived from that fixed path -- declining outright
  ; if anyone else owns it. The worst an unprivileged caller can achieve is
  ; the state Drake was going to reach anyway.
  ;
  ; schtasks.exe has no flag for this, so it goes through the Task Scheduler
  ; COM API. The script is written to $PLUGINSDIR (a temp dir NSIS wipes on
  ; exit) rather than inlined, because escaping nested quotes through
  ; nsExec into PowerShell is unreadable and easy to get silently wrong.
  InitPluginsDir
  FileOpen $0 "$PLUGINSDIR\drake-task-acl.ps1" w
  FileWrite $0 '$$ErrorActionPreference = $\'Stop$\'$\r$\n'
  FileWrite $0 '$$svc = New-Object -ComObject Schedule.Service$\r$\n'
  FileWrite $0 '$$svc.Connect()$\r$\n'
  FileWrite $0 '$$task = $$svc.GetFolder($\"\$\").GetTask($\"Drake Slot Activation$\")$\r$\n'
  FileWrite $0 '$$task.SetSecurityDescriptor($\"D:(A;;GA;;;BA)(A;;GA;;;SY)(A;;GRGX;;;BU)$\", 0)$\r$\n'
  FileClose $0
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\drake-task-acl.ps1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Must run here, not in NSIS_HOOK_POSTUNINSTALL: by the time POSTUNINSTALL
  ; fires, the bundler's own Section Uninstall has already deleted
  ; "$INSTDIR\Drake.exe" and removed $INSTDIR itself, so calling the binary
  ; there fails silently and leaves the stale IFEO value behind pointing at
  ; a core.dll that no longer exists. PREUNINSTALL runs before any of that,
  ; while $INSTDIR\Drake.exe still exists. Do not move this back to
  ; POSTUNINSTALL. The uninstaller already runs elevated, so it can clear
  ; the IFEO value directly. --deactivate-slot only removes the value when it
  ; still points at our own core.dll, leaving another product's value
  ; untouched -- but it always removes our own plugin folder from whichever
  ; loader is hosting it (ours or a third party's) and then deletes
  ; %PROGRAMDATA%\Drake. Leaving our plugin running inside somebody else's
  ; product after we are gone is not acceptable.
  nsExec::ExecToLog '"$INSTDIR\Drake.exe" --deactivate-slot'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; schtasks.exe lives in $SYSDIR and does not depend on $INSTDIR surviving,
  ; so this is fine to run after the bundler has removed the install dir.
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /F /TN "Drake Slot Activation"'
  ; Belt and braces: --deactivate-slot above already removes this. If Drake.exe
  ; could not run (a corrupt install), this still clears the runtime tree.
  RMDir /r "$%PROGRAMDATA%\Drake"
!macroend

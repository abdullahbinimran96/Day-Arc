Set WshShell = CreateObject("WScript.Shell")
strCurrentDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurrentDir

' Run Electron GUI executable directly (0 = hide window, False = don't wait)
electronExe = strCurrentDir & "\node_modules\electron\dist\electron.exe"

If CreateObject("Scripting.FileSystemObject").FileExists(electronExe) Then
    WshShell.Run """" & electronExe & """ .", 0, False
Else
    WshShell.Run "cmd /c npm start", 0, False
End If

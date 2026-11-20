param([string]$Title = "Silverium DB", [string]$Message = "Nuovo contenuto rilevato nel Vault!")
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$Nodes = $Template.GetElementsByTagName("text")
$Nodes.Item(0).AppendChild($Template.CreateTextNode($Title)) | Out-Null
$Nodes.Item(1).AppendChild($Template.CreateTextNode($Message)) | Out-Null
$Toast = [Windows.UI.Notifications.ToastNotification]::new($Template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Silverium DB").Show($Toast)

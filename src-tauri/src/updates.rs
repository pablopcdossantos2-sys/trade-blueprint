use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

fn updater_flag_enabled(value: Option<&str>) -> bool {
    matches!(value, Some("1"))
}

pub fn plugin_enabled() -> bool {
    updater_flag_enabled(option_env!("TRADE_BLUEPRINT_UPDATER_ENABLED"))
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    if !plugin_enabled() {
        return Err(
            "Esta compilação local não possui o atualizador automático assinado habilitado."
                .to_string(),
        );
    }

    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Não foi possível iniciar o atualizador: {error}"))?;

    let update = updater
        .check()
        .await
        .map_err(|error| format!("Não foi possível verificar atualizações: {error}"))?;

    Ok(update.map(|item| UpdateInfo {
        version: item.version,
        notes: item.body,
        date: item.date.map(|value| value.to_string()),
    }))
}

#[tauri::command]
pub async fn install_update(app: AppHandle, expected_version: String) -> Result<bool, String> {
    if !plugin_enabled() {
        return Err(
            "Esta compilação local não possui o atualizador automático assinado habilitado."
                .to_string(),
        );
    }

    // O timeout cobre também o corpo do download; 30s interrompia conexões lentas.
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| format!("Não foi possível iniciar o atualizador: {error}"))?;

    let Some(update) = updater
        .check()
        .await
        .map_err(|error| format!("Não foi possível verificar a atualização: {error}"))?
    else {
        return Err("Nenhuma atualização está disponível.".to_string());
    };

    if update.version != expected_version {
        return Err("A versão disponível mudou. Verifique as atualizações novamente.".to_string());
    }

    crate::desktop_storage::create_pre_update_backup(&app)
        .map_err(|error| format!("Não foi possível criar o backup pré-atualização: {error}"))?;

    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Não foi possível baixar/verificar a atualização: {error}"))?;

    update
        .install(bytes)
        .map_err(|error| format!("Não foi possível instalar a atualização: {error}"))?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::updater_flag_enabled;

    #[test]
    fn updater_requires_explicit_release_flag() {
        assert!(updater_flag_enabled(Some("1")));
        assert!(!updater_flag_enabled(Some("0")));
        assert!(!updater_flag_enabled(Some("true")));
        assert!(!updater_flag_enabled(None));
    }
}

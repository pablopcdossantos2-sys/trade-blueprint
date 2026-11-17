use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

// Nome legado preservado para manter o mesmo banco após o rebranding.
const DB_FILE: &str = "plano-de-trade.sqlite3";
const DEFAULT_BACKUP_FOLDER: &str = "backups";
const ATTACHMENT_FOLDER: &str = "attachments";
const AUTO_BACKUP_LIMIT: usize = 10;
const SAFETY_BACKUP_LIMIT: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityInfo {
    pub ok: bool,
    pub message: String,
    pub database_path: String,
    pub backup_directory: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSaveResult {
    pub saved: bool,
    pub backup_warning: Option<String>,
}

fn timestamp() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("Relógio do sistema inválido: {error}"))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar a pasta de dados: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Não foi possível criar a pasta de dados: {error}"))?;
    Ok(dir)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(DB_FILE))
}

fn attachment_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_dir(app)?.join(ATTACHMENT_FOLDER);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível criar a pasta de anexos: {error}"))?;
    Ok(directory)
}

fn attachment_file_name(id: &str) -> String {
    let mut encoded = String::with_capacity(id.len() * 2 + 8);
    for byte in id.as_bytes() {
        encoded.push_str(&format!("{byte:02x}"));
    }
    format!("{encoded}.dataurl")
}

fn attachment_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(attachment_directory(app)?.join(attachment_file_name(id)))
}

fn is_attachment_object(object: &serde_json::Map<String, Value>) -> bool {
    ["id", "name", "dataUrl", "createdAt"]
        .iter()
        .all(|key| object.get(*key).and_then(Value::as_str).is_some())
}

fn collect_attachment_ids(value: &Value, ids: &mut BTreeSet<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_attachment_ids(item, ids);
            }
        }
        Value::Object(object) => {
            if is_attachment_object(object) {
                if let Some(id) = object.get("id").and_then(Value::as_str) {
                    ids.insert(id.to_string());
                }
            }
            for item in object.values() {
                collect_attachment_ids(item, ids);
            }
        }
        _ => {}
    }
}

fn collect_unresolved_attachment_ids(value: &Value, ids: &mut BTreeSet<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_unresolved_attachment_ids(item, ids);
            }
        }
        Value::Object(object) => {
            if is_attachment_object(object) {
                let data_url_is_empty = object
                    .get("dataUrl")
                    .and_then(Value::as_str)
                    .map(str::is_empty)
                    .unwrap_or(true);
                if data_url_is_empty {
                    if let Some(id) = object.get("id").and_then(Value::as_str) {
                        ids.insert(id.to_string());
                    }
                }
            }
            for item in object.values() {
                collect_unresolved_attachment_ids(item, ids);
            }
        }
        _ => {}
    }
}

fn write_attachment_if_missing(app: &AppHandle, id: &str, data_url: &str) -> Result<(), String> {
    let path = attachment_path(app, id)?;
    if path.exists() {
        return Ok(());
    }
    fs::write(&path, data_url.as_bytes()).map_err(|error| {
        format!(
            "Não foi possível salvar o anexo {}: {error}",
            path.to_string_lossy()
        )
    })
}

fn externalize_attachment_data(
    app: &AppHandle,
    state_json: &str,
) -> Result<(String, BTreeSet<String>), String> {
    let mut value: Value = serde_json::from_str(state_json)
        .map_err(|error| format!("Estado JSON inválido: {error}"))?;
    let mut ids = BTreeSet::new();
    collect_attachment_ids(&value, &mut ids);

    if value.get("attachmentData").is_none() {
        return Ok((state_json.to_string(), ids));
    }

    let entries: Vec<(String, String)> = value
        .get("attachmentData")
        .and_then(Value::as_object)
        .map(|data| {
            data.iter()
                .filter_map(|(id, value)| value.as_str().filter(|item| !item.is_empty()).map(|item| (id.clone(), item.to_string())))
                .collect()
        })
        .unwrap_or_default();

    for (id, data_url) in &entries {
        write_attachment_if_missing(app, id, data_url)?;
    }

    for id in &ids {
        if !attachment_path(app, id)?.exists() {
            return Err(format!(
                "O estado referencia o anexo {id}, mas o arquivo correspondente não está disponível."
            ));
        }
    }

    let root = value
        .as_object_mut()
        .ok_or_else(|| "O estado principal deve ser um objeto JSON.".to_string())?;
    root.insert(
        "attachmentData".to_string(),
        Value::Object(serde_json::Map::new()),
    );

    serde_json::to_string(&value)
        .map(|json| (json, ids))
        .map_err(|error| format!("Não foi possível serializar o estado sem anexos embutidos: {error}"))
}

fn hydrate_attachment_data(app: &AppHandle, state_json: &str) -> Result<String, String> {
    let mut value: Value = serde_json::from_str(state_json)
        .map_err(|error| format!("Estado JSON inválido: {error}"))?;
    let mut ids = BTreeSet::new();
    // Backups antigos (v1-v8) ainda podem trazer dataUrl dentro do próprio Attachment.
    // Só buscamos arquivos físicos para referências realmente externalizadas (dataUrl vazio).
    collect_unresolved_attachment_ids(&value, &mut ids);
    if ids.is_empty() {
        return Ok(state_json.to_string());
    }

    let root = value
        .as_object_mut()
        .ok_or_else(|| "O estado principal deve ser um objeto JSON.".to_string())?;
    let entry = root
        .entry("attachmentData".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(serde_json::Map::new());
    }
    let data = entry
        .as_object_mut()
        .ok_or_else(|| "attachmentData inválido.".to_string())?;

    for id in ids {
        let already_embedded = data
            .get(&id)
            .and_then(Value::as_str)
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        if already_embedded {
            continue;
        }

        let path = attachment_path(app, &id)?;
        let data_url = fs::read_to_string(&path).map_err(|error| {
            format!(
                "Não foi possível ler o arquivo do anexo {}: {error}",
                path.to_string_lossy()
            )
        })?;
        data.insert(id, Value::String(data_url));
    }

    serde_json::to_string(&value)
        .map_err(|error| format!("Não foi possível reidratar os anexos do estado: {error}"))
}

fn cleanup_attachment_files(app: &AppHandle, keep: &BTreeSet<String>) -> Result<(), String> {
    let directory = attachment_directory(app)?;
    let keep_names: BTreeSet<String> = keep.iter().map(|id| attachment_file_name(id)).collect();

    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Não foi possível listar a pasta de anexos: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Não foi possível ler um anexo: {error}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".dataurl") && !keep_names.contains(&name) {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "Não foi possível remover o anexo órfão {}: {error}",
                    path.to_string_lossy()
                )
            })?;
        }
    }
    Ok(())
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let connection = Connection::open(&path)
        .map_err(|error| format!("Não foi possível abrir o banco SQLite: {error}"))?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| format!("Não foi possível preparar o banco SQLite: {error}"))?;
    Ok(connection)
}

fn validate_state_json(state_json: &str) -> Result<(), String> {
    let value: Value = serde_json::from_str(state_json)
        .map_err(|error| format!("Estado JSON inválido: {error}"))?;
    let schema = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "O estado não contém schemaVersion válido.".to_string())?;
    if schema == 0 {
        return Err("schemaVersion não pode ser zero.".to_string());
    }
    Ok(())
}

fn get_config(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Não foi possível ler a configuração {key}: {error}"))
}

fn set_config(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO app_config(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|error| format!("Não foi possível salvar a configuração {key}: {error}"))?;
    Ok(())
}

fn backup_directory_internal(app: &AppHandle, connection: &Connection) -> Result<PathBuf, String> {
    if let Some(configured) = get_config(connection, "backup_directory")? {
        let path = PathBuf::from(configured);
        // O disco removível/rede configurado pode estar indisponível. Nesses
        // casos usamos o diretório padrão para não bloquear a recuperação.
        if fs::create_dir_all(&path).is_ok() {
            let probe = path.join(format!(".trade-blueprint-write-test-{}", std::process::id()));
            if fs::write(&probe, b"ok").is_ok() {
                let _ = fs::remove_file(probe);
                return Ok(path);
            }
        }
    }
    let path = app_data_dir(app)?.join(DEFAULT_BACKUP_FOLDER);
    fs::create_dir_all(&path)
        .map_err(|error| format!("Não foi possível criar a pasta padrão de backup: {error}"))?;
    Ok(path)
}

fn load_state_from_connection(connection: &Connection) -> Result<Option<String>, String> {
    connection
        .query_row("SELECT json FROM app_state WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(|error| format!("Não foi possível ler o estado do banco: {error}"))
}

fn write_raw_backup_file(
    app: &AppHandle,
    connection: &Connection,
    state_json: &str,
    kind: &str,
) -> Result<String, String> {
    let directory = backup_directory_internal(app, connection)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Relógio do sistema inválido: {error}"))?
        .as_nanos();
    let path = directory.join(format!("trade-blueprint-{kind}-{stamp}.json"));
    let temporary = directory.join(format!(".trade-blueprint-{kind}-{stamp}.tmp"));
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("Não foi possível iniciar o backup: {error}"))?;
        file.write_all(state_json.as_bytes())
            .map_err(|error| format!("Não foi possível escrever o backup: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Não foi possível sincronizar o backup: {error}"))?;
        fs::rename(&temporary, &path)
            .map_err(|error| format!("Não foi possível concluir o backup: {error}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result?;
    Ok(path.to_string_lossy().to_string())
}

fn write_backup_file(
    app: &AppHandle,
    connection: &Connection,
    state_json: &str,
    kind: &str,
) -> Result<String, String> {
    validate_state_json(state_json)?;
    write_raw_backup_file(app, connection, state_json, kind)
}

// Mesmo com anexos ausentes, preservar o JSON bruto e os anexos físicos que
// sobreviveram. Esse backup degradado é um ponto de resgate manual, não um
// backup completo: nunca alegamos que seus anexos estão íntegros.
fn write_resilient_backup(
    app: &AppHandle,
    connection: &Connection,
    stored: &str,
    kind: &str,
) -> Result<String, String> {
    match hydrate_attachment_data(app, stored) {
        Ok(hydrated) => write_backup_file(app, connection, &hydrated, kind),
        Err(_) => {
            let path = write_raw_backup_file(app, connection, stored, kind)?;
            let surviving = PathBuf::from(format!("{path}.attachments"));
            fs::create_dir_all(&surviving)
                .map_err(|error| format!("Não foi possível criar a cópia dos anexos sobreviventes: {error}"))?;
            let source = attachment_directory(app)?;
            for entry in fs::read_dir(source)
                .map_err(|error| format!("Não foi possível listar os anexos sobreviventes: {error}"))?
            {
                let entry = entry.map_err(|error| format!("Falha ao ler anexo: {error}"))?;
                if entry.file_type().map_err(|error| error.to_string())?.is_file() {
                    fs::copy(entry.path(), surviving.join(entry.file_name()))
                        .map_err(|error| format!("Não foi possível preservar anexo: {error}"))?;
                }
            }
            Ok(path)
        }
    }
}

fn rotate_backup_kind(directory: &Path, kind: &str, limit: usize) -> Result<(), String> {
    let current_prefix = format!("trade-blueprint-{kind}-");
    let legacy_prefix = format!("plano-de-trade-{kind}-");
    let mut files: Vec<PathBuf> = fs::read_dir(directory)
        .map_err(|error| format!("Não foi possível listar os backups: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    (name.starts_with(&current_prefix) || name.starts_with(&legacy_prefix))
                        && name.ends_with(".json")
                })
                .unwrap_or(false)
        })
        .collect();

    files.sort();
    if files.len() > limit {
        let remove_count = files.len() - limit;
        for path in files.into_iter().take(remove_count) {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "Não foi possível remover o backup antigo {}: {error}",
                    path.to_string_lossy()
                )
            })?;
        }
    }
    Ok(())
}

fn maybe_create_automatic_backup(
    app: &AppHandle,
    connection: &Connection,
    state_json: &str,
    local_day: Option<&str>,
) -> Result<(), String> {
    let current_marker = local_day
        .filter(|value| {
            value.len() == 10
                && value.as_bytes()[4] == b'-'
                && value.as_bytes()[7] == b'-'
                && value
                    .chars()
                    .enumerate()
                    .all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit())
        })
        .map(str::to_string)
        .unwrap_or_else(|| (timestamp().unwrap_or_default() / 86_400).to_string());
    if get_config(connection, "last_auto_backup_day")?.as_deref() == Some(current_marker.as_str()) {
        return Ok(());
    }

    write_backup_file(app, connection, state_json, "auto")?;
    let directory = backup_directory_internal(app, connection)?;
    rotate_backup_kind(&directory, "auto", AUTO_BACKUP_LIMIT)?;
    set_config(connection, "last_auto_backup_day", &current_marker)?;
    Ok(())
}

fn save_state_internal(
    app: &AppHandle,
    connection: &Connection,
    state_json: &str,
    make_auto_backup: bool,
    local_day: Option<&str>,
) -> Result<Option<String>, String> {
    validate_state_json(state_json)?;
    let (stored_json, attachment_ids) = externalize_attachment_data(app, state_json)?;
    let stamp = timestamp()?;
    connection
        .execute(
            "INSERT INTO app_state(id, json, updated_at) VALUES(1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
            params![stored_json, stamp as i64],
        )
        .map_err(|error| format!("Não foi possível salvar o estado no SQLite: {error}"))?;

    let _ = cleanup_attachment_files(app, &attachment_ids);

    let backup_warning = if make_auto_backup {
        maybe_create_automatic_backup(app, connection, state_json, local_day).err()
    } else {
        None
    };
    Ok(backup_warning)
}

#[tauri::command]
pub fn load_desktop_state(app: AppHandle) -> Result<Option<String>, String> {
    let connection = open_db(&app)?;
    match load_state_from_connection(&connection)? {
        Some(json) => hydrate_attachment_data(&app, &json).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn save_desktop_state(
    app: AppHandle,
    state_json: String,
    local_day: Option<String>,
) -> Result<DesktopSaveResult, String> {
    let connection = open_db(&app)?;
    let backup_warning =
        save_state_internal(&app, &connection, &state_json, true, local_day.as_deref())?;
    Ok(DesktopSaveResult {
        saved: true,
        backup_warning,
    })
}

#[tauri::command]
pub fn get_backup_directory(app: AppHandle) -> Result<String, String> {
    let connection = open_db(&app)?;
    Ok(backup_directory_internal(&app, &connection)?
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn set_backup_directory(app: AppHandle, path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("A pasta de backup não pode ficar vazia.".to_string());
    }
    let directory = PathBuf::from(path.trim());
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível criar/acessar a pasta escolhida: {error}"))?;

    let test_path = directory.join(".trade-blueprint-write-test");
    fs::write(&test_path, b"ok")
        .map_err(|error| format!("A pasta escolhida não permite gravação: {error}"))?;
    let _ = fs::remove_file(test_path);

    let connection = open_db(&app)?;
    set_config(
        &connection,
        "backup_directory",
        &directory.to_string_lossy(),
    )?;
    set_config(&connection, "last_auto_backup_day", "")?;
    Ok(directory.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_desktop_backup(app: AppHandle) -> Result<String, String> {
    let connection = open_db(&app)?;
    let stored = load_state_from_connection(&connection)?
        .ok_or_else(|| "Ainda não existe estado salvo no banco desktop.".to_string())?;
    write_resilient_backup(&app, &connection, &stored, "manual")
}

#[tauri::command]
pub fn preview_desktop_backup(path: String) -> Result<String, String> {
    let incoming = fs::read_to_string(PathBuf::from(path.trim()))
        .map_err(|error| format!("Não foi possível ler o backup selecionado: {error}"))?;
    validate_state_json(&incoming)?;
    Ok(incoming)
}

#[tauri::command]
pub fn restore_desktop_backup(app: AppHandle, path: String) -> Result<String, String> {
    let connection = open_db(&app)?;
    let incoming = fs::read_to_string(PathBuf::from(path.trim()))
        .map_err(|error| format!("Não foi possível ler o backup selecionado: {error}"))?;
    validate_state_json(&incoming)?;

    if let Some(current) = load_state_from_connection(&connection)? {
        write_resilient_backup(&app, &connection, &current, "pre-restore")?;
        let directory = backup_directory_internal(&app, &connection)?;
        rotate_backup_kind(&directory, "pre-restore", SAFETY_BACKUP_LIMIT)?;
    }

    let _ = save_state_internal(&app, &connection, &incoming, false, None)?;
    Ok(incoming)
}

#[tauri::command]
pub fn check_desktop_integrity(app: AppHandle) -> Result<IntegrityInfo, String> {
    let connection = open_db(&app)?;
    let quick_check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Falha ao executar PRAGMA quick_check: {error}"))?;

    let state = load_state_from_connection(&connection)?;
    let integrity_error = state.as_deref().and_then(|json| {
        hydrate_attachment_data(&app, json)
            .and_then(|hydrated| validate_state_json(&hydrated))
            .err()
    });

    let ok = quick_check.eq_ignore_ascii_case("ok") && integrity_error.is_none();
    Ok(IntegrityInfo {
        ok,
        message: if !quick_check.eq_ignore_ascii_case("ok") {
            format!("SQLite retornou: {quick_check}")
        } else if let Some(error) = integrity_error {
            format!("Estado/anexos incompletos: {error}. Não apague os arquivos locais antes do resgate.")
        } else {
            "Banco SQLite e estado JSON íntegros.".to_string()
        },
        database_path: db_path(&app)?.to_string_lossy().to_string(),
        backup_directory: backup_directory_internal(&app, &connection)?
            .to_string_lossy()
            .to_string(),
    })
}

pub fn create_pre_update_backup(app: &AppHandle) -> Result<Option<String>, String> {
    let connection = open_db(app)?;
    let Some(stored) = load_state_from_connection(&connection)? else {
        return Ok(None);
    };
    let path = write_resilient_backup(app, &connection, &stored, "pre-update")?;
    let directory = backup_directory_internal(app, &connection)?;
    rotate_backup_kind(&directory, "pre-update", SAFETY_BACKUP_LIMIT)?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::{
        attachment_file_name, collect_attachment_ids, collect_unresolved_attachment_ids,
        rotate_backup_kind, validate_state_json,
    };
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_backup_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "trade-blueprint-{label}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    #[test]
    fn rotates_only_the_requested_backup_kind() {
        let directory = temp_backup_dir("rotation");

        for index in 0..7 {
            fs::write(
                directory.join(format!("trade-blueprint-pre-update-{index:02}.json")),
                b"{}",
            )
            .expect("write pre-update");
        }
        fs::write(directory.join("trade-blueprint-manual-00.json"), b"{}")
            .expect("write manual");

        rotate_backup_kind(&directory, "pre-update", 5).expect("rotate");

        let names: Vec<String> = fs::read_dir(&directory)
            .expect("read dir")
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
            .collect();

        assert_eq!(
            names.iter().filter(|name| name.contains("pre-update")).count(),
            5
        );
        assert!(names
            .iter()
            .any(|name| name == "trade-blueprint-manual-00.json"));

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn attachment_file_name_is_path_safe_and_stable() {
        assert_eq!(
            attachment_file_name("img-1"),
            "696d672d31.dataurl"
        );
        assert!(!attachment_file_name("../unsafe").contains('/'));
        assert!(!attachment_file_name("../unsafe").contains('\\'));
    }

    #[test]
    fn collects_only_attachment_like_ids() {
        let value: serde_json::Value = serde_json::json!({
            "id": "root",
            "attachments": [
                {
                    "id": "img-1",
                    "name": "grafico.webp",
                    "dataUrl": "",
                    "createdAt": "2026-10-16T12:00:00.000Z"
                }
            ]
        });
        let mut ids = std::collections::BTreeSet::new();
        collect_attachment_ids(&value, &mut ids);
        assert_eq!(ids.into_iter().collect::<Vec<_>>(), vec!["img-1".to_string()]);
    }

    #[test]
    fn legacy_inline_attachment_does_not_require_external_file() {
        let value: serde_json::Value = serde_json::json!({
            "attachments": [
                {
                    "id": "img-inline",
                    "name": "legado.webp",
                    "dataUrl": "data:image/webp;base64,AAAA",
                    "createdAt": "2026-10-16T12:00:00.000Z"
                },
                {
                    "id": "img-external",
                    "name": "novo.webp",
                    "dataUrl": "",
                    "createdAt": "2026-10-16T12:00:00.000Z"
                }
            ]
        });
        let mut ids = std::collections::BTreeSet::new();
        collect_unresolved_attachment_ids(&value, &mut ids);
        assert_eq!(
            ids.into_iter().collect::<Vec<_>>(),
            vec!["img-external".to_string()]
        );
    }

    #[test]
    fn validates_schema_version() {
        assert!(validate_state_json(r#"{"schemaVersion":8}"#).is_ok());
        assert!(validate_state_json(r#"{"value":1}"#).is_err());
        assert!(validate_state_json("not json").is_err());
    }
}

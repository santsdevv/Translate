use std::collections::HashMap;
use std::sync::OnceLock;

use parking_lot::Mutex;

use crate::error::{AppError, AppResult};
use crate::settings::Provider;

const SERVICE: &str = "com.translate.desktop";

fn cache() -> &'static Mutex<HashMap<&'static str, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<&'static str, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn entry(provider: Provider) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, provider.key_id()).map_err(|e| AppError::Other(e.to_string()))
}

pub fn get(provider: Provider) -> Option<String> {
    let id = provider.key_id();
    if let Some(v) = cache().lock().get(id) {
        return v.clone();
    }
    let value = entry(provider)
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|k| !k.trim().is_empty());
    cache().lock().insert(id, value.clone());
    value
}

pub fn set(provider: Provider, key: &str) -> AppResult<()> {
    let key = key.trim();
    let e = entry(provider)?;
    if key.is_empty() {
        match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(err) => return Err(AppError::Other(err.to_string())),
        }
        cache().lock().insert(provider.key_id(), None);
    } else {
        e.set_password(key)
            .map_err(|err| AppError::Other(format!("não foi possível salvar a chave: {err}")))?;
        cache()
            .lock()
            .insert(provider.key_id(), Some(key.to_string()));
    }
    Ok(())
}

pub fn has(provider: Provider) -> bool {
    get(provider).is_some()
}

pub fn hint(provider: Provider) -> Option<String> {
    get(provider).map(|k| {
        let tail: String = k
            .chars()
            .rev()
            .take(4)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("••••{tail}")
    })
}

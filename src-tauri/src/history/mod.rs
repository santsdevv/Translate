use std::path::Path;

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: i64,
    pub created_at: i64,
    pub source_text: String,
    pub translated_text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub detected_lang: Option<String>,
    pub provider: String,
    pub favorite: bool,
}

pub struct NewEntry<'a> {
    pub source_text: &'a str,
    pub translated_text: &'a str,
    pub source_lang: &'a str,
    pub target_lang: &'a str,
    pub detected_lang: Option<&'a str>,
    pub provider: &'a str,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Query {
    pub search: String,
    pub favorites_only: bool,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub items: Vec<Entry>,
    pub total: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total: u32,
    pub today: u32,
    pub week: u32,
    pub favorites: u32,
    pub top_pair: Option<(String, String)>,
}

pub struct History {
    conn: Mutex<Connection>,
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS translations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at      INTEGER NOT NULL,
    source_text     TEXT    NOT NULL,
    translated_text TEXT    NOT NULL,
    source_lang     TEXT    NOT NULL,
    target_lang     TEXT    NOT NULL,
    detected_lang   TEXT,
    provider        TEXT    NOT NULL,
    favorite        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_translations_created ON translations(created_at DESC);
"#;

fn row_to_entry(r: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    Ok(Entry {
        id: r.get(0)?,
        created_at: r.get(1)?,
        source_text: r.get(2)?,
        translated_text: r.get(3)?,
        source_lang: r.get(4)?,
        target_lang: r.get(5)?,
        detected_lang: r.get(6)?,
        provider: r.get(7)?,
        favorite: r.get::<_, i64>(8)? != 0,
    })
}

const COLUMNS: &str =
    "id, created_at, source_text, translated_text, source_lang, target_lang, detected_lang, provider, favorite";

fn like_pattern(search: &str) -> String {
    let escaped = search
        .trim()
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

impl History {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[cfg(test)]
    pub fn in_memory() -> AppResult<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn insert(&self, e: NewEntry<'_>, limit: u32) -> AppResult<Entry> {
        let now = chrono::Utc::now().timestamp_millis();
        let conn = self.conn.lock();
        let recent: Option<i64> = conn
            .query_row(
                "SELECT id FROM translations WHERE source_text = ?1 AND target_lang = ?2 AND created_at > ?3
                 ORDER BY created_at DESC, id DESC LIMIT 1",
                params![e.source_text, e.target_lang, now - 10_000],
                |r| r.get(0),
            )
            .optional()?;
        let id = if let Some(id) = recent {
            conn.execute(
                "UPDATE translations SET created_at = ?1, translated_text = ?2, provider = ?3 WHERE id = ?4",
                params![now, e.translated_text, e.provider, id],
            )?;
            id
        } else {
            conn.execute(
                "INSERT INTO translations (created_at, source_text, translated_text, source_lang, target_lang, detected_lang, provider)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![now, e.source_text, e.translated_text, e.source_lang, e.target_lang, e.detected_lang, e.provider],
            )?;
            conn.last_insert_rowid()
        };
        conn.execute(
            "DELETE FROM translations WHERE favorite = 0 AND id NOT IN (
                SELECT id FROM translations ORDER BY created_at DESC, id DESC LIMIT ?1)",
            params![limit],
        )?;
        let entry = conn.query_row(
            &format!("SELECT {COLUMNS} FROM translations WHERE id = ?1"),
            [id],
            row_to_entry,
        )?;
        Ok(entry)
    }

    pub fn list(&self, q: &Query) -> AppResult<Page> {
        let conn = self.conn.lock();
        let limit = if q.limit == 0 { 100 } else { q.limit.min(500) };
        let pattern = like_pattern(&q.search);
        let filter =
            "(?1 = '%%' OR source_text LIKE ?1 ESCAPE '\\' OR translated_text LIKE ?1 ESCAPE '\\')
                      AND (?2 = 0 OR favorite = 1)";
        let total: u32 = conn.query_row(
            &format!("SELECT COUNT(*) FROM translations WHERE {filter}"),
            params![pattern, q.favorites_only as i64],
            |r| r.get(0),
        )?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM translations WHERE {filter} ORDER BY created_at DESC, id DESC LIMIT ?3 OFFSET ?4"
        ))?;
        let items = stmt
            .query_map(
                params![pattern, q.favorites_only as i64, limit, q.offset],
                row_to_entry,
            )?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Page { items, total })
    }

    pub fn all(&self) -> AppResult<Vec<Entry>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM translations ORDER BY created_at DESC, id DESC"
        ))?;
        let items = stmt
            .query_map([], row_to_entry)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn set_favorite(&self, id: i64, favorite: bool) -> AppResult<()> {
        self.conn.lock().execute(
            "UPDATE translations SET favorite = ?1 WHERE id = ?2",
            params![favorite as i64, id],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: i64) -> AppResult<()> {
        self.conn
            .lock()
            .execute("DELETE FROM translations WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn clear(&self, keep_favorites: bool) -> AppResult<u32> {
        let n = if keep_favorites {
            self.conn
                .lock()
                .execute("DELETE FROM translations WHERE favorite = 0", [])?
        } else {
            self.conn.lock().execute("DELETE FROM translations", [])?
        };
        Ok(n as u32)
    }

    pub fn stats(&self) -> AppResult<Stats> {
        let conn = self.conn.lock();
        let now = chrono::Local::now();
        let midnight = now
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .and_then(|d| d.and_local_timezone(chrono::Local).single())
            .map(|d| d.timestamp_millis())
            .unwrap_or(0);
        let week_ago = now.timestamp_millis() - 7 * 24 * 3600 * 1000;
        let count =
            |sql: &str, p: i64| -> rusqlite::Result<u32> { conn.query_row(sql, [p], |r| r.get(0)) };
        let total = count("SELECT COUNT(*) FROM translations WHERE ?1 = ?1", 0)?;
        let today = count(
            "SELECT COUNT(*) FROM translations WHERE created_at >= ?1",
            midnight,
        )?;
        let week = count(
            "SELECT COUNT(*) FROM translations WHERE created_at >= ?1",
            week_ago,
        )?;
        let favorites = count("SELECT COUNT(*) FROM translations WHERE favorite = ?1", 1)?;
        let top_pair = conn
            .query_row(
                "SELECT COALESCE(detected_lang, source_lang), target_lang, COUNT(*) c FROM translations
                 GROUP BY 1, 2 ORDER BY c DESC LIMIT 1",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?;
        Ok(Stats {
            total,
            today,
            week,
            favorites,
            top_pair,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new<'a>(src: &'a str) -> NewEntry<'a> {
        NewEntry {
            source_text: src,
            translated_text: "t",
            source_lang: "auto",
            target_lang: "pt",
            detected_lang: Some("en"),
            provider: "google",
        }
    }

    #[test]
    fn insert_list_search_and_limit() {
        let h = History::in_memory().unwrap();
        for i in 0..5 {
            h.insert(new(&format!("hello {i} 100%")), 3).unwrap();
        }
        let page = h
            .list(&Query {
                limit: 10,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(page.total, 3);
        let found = h
            .list(&Query {
                search: "4 100%".into(),
                limit: 10,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(found.total, 1);
    }

    #[test]
    fn dedupes_recent_and_keeps_favorites() {
        let h = History::in_memory().unwrap();
        let a = h.insert(new("same"), 10).unwrap();
        let b = h.insert(new("same"), 10).unwrap();
        assert_eq!(a.id, b.id);
        h.set_favorite(a.id, true).unwrap();
        for i in 0..5 {
            h.insert(new(&format!("x{i}")), 2).unwrap();
        }
        let favs = h
            .list(&Query {
                favorites_only: true,
                limit: 10,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(favs.total, 1);
        let s = h.stats().unwrap();
        assert_eq!(s.favorites, 1);
        assert_eq!(s.top_pair, Some(("en".into(), "pt".into())));
    }
}

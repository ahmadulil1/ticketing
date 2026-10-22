use std::collections::HashSet;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::client::{ApiError, NotificationItem, NotificationsPage, SigapHttp};
use super::consts::{DEFAULT_POLL_INTERVAL, MAX_BASELINE_PAGES, MAX_JITTER, MAX_POPUPS_PER_CYCLE};
use super::{
    emit_state, ensure_access_token, save_seen, set_baseline_done, SigapState,
};

/// Jitter acak 0..=MAX_JITTER detik (hindari semua klien poll bersamaan).
fn jitter_secs() -> u64 {
    let mut b = [0u8; 1];
    if getrandom::getrandom(&mut b).is_err() {
        return 0;
    }
    (b[0] as u64) % (MAX_JITTER + 1)
}

/// Mulai loop polling notifikasi. Hanya satu loop per akun per proses
/// (bukan per window) karena task hidup di state Rust.
pub fn start(app: &AppHandle) {
    let st = app.state::<SigapState>();
    {
        let mut inner = st.lock();
        if inner.notify_running {
            return;
        }
        inner.notify_running = true;
    }
    let app_task = app.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let mut backoff = DEFAULT_POLL_INTERVAL;
        loop {
            match poll_cycle(&app_task).await {
                Ok(()) => {
                    backoff = DEFAULT_POLL_INTERVAL;
                    let st = app_task.state::<SigapState>();
                    {
                        let mut inner = st.lock();
                        inner.online = true;
                    }
                }
                Err(ApiError::Unauthorized(msg)) => {
                    // Sesi tak valid / dicabut: berhenti, minta pairing ulang.
                    let st = app_task.state::<SigapState>();
                    {
                        let mut inner = st.lock();
                        inner.notify_running = false;
                        inner.status = super::SigapStatus::Expired;
                        inner.last_error = Some(msg);
                    }
                    emit_state(&app_task);
                    break;
                }
                Err(e) => {
                    let st = app_task.state::<SigapState>();
                    {
                        let mut inner = st.lock();
                        inner.last_error = Some(e.message());
                        if e.is_uncertain() || matches!(e, ApiError::Network(_)) {
                            inner.online = false;
                        }
                    }
                    emit_state(&app_task);
                    backoff = (backoff * 2).min(300);
                }
            }
            let base = {
                let st = app_task.state::<SigapState>();
                let inner = st.lock();
                inner.poll_interval
            };
            tokio::time::sleep(Duration::from_secs(base.max(backoff) + jitter_secs())).await;
        }
    });
    let mut guard = st.notify_task.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(handle);
}

/// Hentikan loop polling (logout / ganti akun).
pub fn stop(app: &AppHandle) {
    let st = app.state::<SigapState>();
    {
        let mut inner = st.lock();
        inner.notify_running = false;
    }
    let handle = st.notify_task.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(h) = handle {
        h.abort();
    }
}

/// Telusuri halaman notifikasi.
///
/// `stop_on_seen` = true: berhenti setelah halaman yang memuat ID yang sudah
/// pernah dilihat (isi halaman itu tetap dipindai penuh supaya ID baru di
/// dalam halaman tak terlewat).
///
/// Balikin (item_baru, mencapai_id_lama).
pub async fn walk_pages<F, Fut>(
    mut fetch: F,
    seen: &HashSet<String>,
    stop_on_seen: bool,
    max_pages: usize,
) -> Result<(Vec<NotificationItem>, bool), ApiError>
where
    F: FnMut(Option<String>) -> Fut,
    Fut: std::future::Future<Output = Result<NotificationsPage, ApiError>>,
{
    let mut cursor: Option<String> = None;
    let mut out: Vec<NotificationItem> = Vec::new();
    let mut reached_seen = false;
    for _ in 0..max_pages {
        let page = fetch(cursor.clone()).await?;
        for item in page.items {
            if stop_on_seen && seen.contains(&item.id) {
                reached_seen = true;
                continue;
            }
            if !out.iter().any(|f| f.id == item.id) {
                out.push(item);
            }
        }
        if reached_seen {
            break;
        }
        match page.next_cursor {
            Some(c) if !c.is_empty() => cursor = Some(c),
            _ => break,
        }
    }
    Ok((out, reached_seen))
}

/// Satu siklus polling: baseline (hanya saat login pertama) atau delta notifikasi baru.
pub async fn poll_cycle(app: &AppHandle) -> Result<(), ApiError> {
    let token = ensure_access_token(app).await?;
    let http = SigapHttp::new().map_err(ApiError::Network)?;

    let (user_id, baseline_done, seen_snapshot) = {
        let st = app.state::<SigapState>();
        let inner = st.lock();
        let user_id = inner
            .account
            .as_ref()
            .map(|a| a.user_id.clone())
            .unwrap_or_default();
        let seen = inner.seen.clone();
        (user_id, inner.baseline_done, seen)
    };

    if user_id.is_empty() {
        return Err(ApiError::Unauthorized("Belum terhubung ke SIGAP".into()));
    }

    if !baseline_done {
        // Sinkronisasi pertama: paginasi penuh, jadi baseline; TIDAK memunculkan popup lama.
        let http_ref = &http;
        let token_ref = &token;
        let app_ref = &app;
        let (items, _) = walk_pages(
            move |cursor: Option<String>| {
                async move {
                    let page = http_ref.get_notifications(token_ref, cursor.as_deref()).await?;
                    apply_poll_interval(app_ref, page.poll_interval);
                    Ok::<NotificationsPage, ApiError>(page)
                }
            },
            &HashSet::new(),
            false,
            MAX_BASELINE_PAGES,
        )
        .await?;
        let st = app.state::<SigapState>();
        {
            let mut inner = st.lock();
            for item in &items {
                if inner.seen.insert(item.id.clone()) {
                    inner.seen_order.push_back(item.id.clone());
                }
            }
            let mut merged = items.clone();
            merged.extend(inner.inbox.iter().cloned());
            merged.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            merged.truncate(100);
            inner.inbox = merged;
            inner.baseline_done = true;
            inner.last_sync = Some(super::now_secs());
        }
        trim_seen(app, &user_id);
        set_baseline_done(app, &user_id);
        emit_state(app);
        return Ok(());
    }

    // Delta: lanjutkan pagination sampai ketemu ID yang sudah pernah dilihat.
    let http_ref = &http;
    let token_ref = &token;
    let app_ref = &app;
    let (mut fresh, _reached) = walk_pages(
        move |cursor: Option<String>| {
            async move {
                let page = http_ref.get_notifications(token_ref, cursor.as_deref()).await?;
                apply_poll_interval(app_ref, page.poll_interval);
                Ok::<NotificationsPage, ApiError>(page)
            }
        },
        &seen_snapshot,
        true,
        MAX_BASELINE_PAGES,
    )
    .await?;
    if fresh.is_empty() {
        let st = app.state::<SigapState>();
        {
            let mut inner = st.lock();
            inner.last_sync = Some(super::now_secs());
        }
        emit_state(app);
        return Ok(());
    }

    // Server mengurutkan menurun (terbaru dulu); tampilkan lama ke baru.
    fresh.reverse();

    let detail = {
        let st = app.state::<SigapState>();
        let inner = st.lock();
        inner.detail_enabled
    };
    let permission = {
        let st = app.state::<SigapState>();
        let inner = st.lock();
        inner.permission_granted
    };

    {
        let st = app.state::<SigapState>();
        let mut inner = st.lock();
        for item in &fresh {
            if inner.seen.insert(item.id.clone()) {
                inner.seen_order.push_back(item.id.clone());
            }
        }
        let mut merged = fresh.clone();
        merged.extend(inner.inbox.iter().cloned());
        merged.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        merged.truncate(100);
        inner.inbox = merged;
        inner.last_sync = Some(super::now_secs());
    }
    trim_seen(app, &user_id);

    // Popup OS: hanya bila izin diberikan, dan dibatasi agar tidak membanjir
    // saat ada backlog offline yang besar.
    if permission {
        for item in fresh.iter().take(MAX_POPUPS_PER_CYCLE) {
            show_popup(app, item, detail);
        }
    }
    for item in &fresh {
        let _ = app.emit("sigap-notification", item);
    }
    emit_state(app);
    Ok(())
}

/// Interval polling mengikuti nilai dari server (default 30 detik).
fn apply_poll_interval(app: &AppHandle, poll_interval: Option<i64>) {
    if let Some(secs) = poll_interval {
        let st = app.state::<SigapState>();
        let mut inner = st.lock();
        inner.poll_interval = (secs as u64).clamp(15, 300);
    }
}

fn trim_seen(app: &AppHandle, user_id: &str) {    const MAX_SEEN: usize = 2000;
    let st = app.state::<SigapState>();
    let mut inner = st.lock();
    while inner.seen_order.len() > MAX_SEEN {
        if let Some(old) = inner.seen_order.pop_front() {
            inner.seen.remove(&old);
        }
    }
    let order = inner.seen_order.clone();
    drop(inner);
    save_seen(app, user_id, &order);
}

/// Tampilkan notifikasi native. Default generik (aman untuk layar terkunci).
fn show_popup(app: &AppHandle, item: &NotificationItem, detail: bool) {
    use tauri_plugin_notification::NotificationExt;
    let (title, body) = if detail {
        (
            item.title.clone().unwrap_or_else(|| "SIGAP".into()),
            item.message.clone().unwrap_or_default(),
        )
    } else {
        ("SIGAP".to_string(), "Ada notifikasi baru".to_string())
    };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

/// Refresh manual (dipakai command fetch notifikasi).
pub async fn refresh_now(app: &AppHandle) -> Result<(), ApiError> {
    poll_cycle(app).await
}

/// Tandai notifikasi dibaca di server. Hanya dipanggil setelah pengguna membuka.
pub async fn mark_read(app: &AppHandle, id: &str) -> Result<(), String> {
    let token = ensure_access_token(app).await.map_err(|e| e.message())?;
    let http = SigapHttp::new().map_err(|e| e.to_string())?;
    http.mark_read(&token, id).await.map_err(|e| e.message())?;
    {
        let st = app.state::<SigapState>();
        let mut inner = st.lock();
        if let Some(item) = inner.inbox.iter_mut().find(|i| i.id == id) {
            item.is_read = Some(true);
        }
    }
    emit_state(app);
    Ok(())
}

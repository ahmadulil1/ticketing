//! Tes integrasi SIGAP terhadap mock server lokal yang mengikuti kontrak.
//!
//! Mock dibuat di dalam tes (tanpa dependensi tambahan). Build produksi tetap
//! terkunci ke origin staging; hanya `#[cfg(test)]` yang boleh menunjuk
//! base URL lain.

use std::collections::{HashSet, VecDeque};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::rc::Rc;
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;

use super::client::{ApiError, NotificationItem, NotificationsPage, SigapHttp};
use super::notify::walk_pages;
use super::{code_challenge, random_verifier, validate_path, validate_verification_uri};

// ---------------------------------------------------------------- mock server

struct MockResponse {
    status: u16,
    reason: &'static str,
    headers: Vec<(String, String)>,
    body: String,
}

impl MockResponse {
    fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            reason: "OK",
            headers: vec![("Content-Type".into(), "application/json".into())],
            body: body.to_string(),
        }
    }

    fn with_status(status: u16, reason: &'static str, body: &str) -> Self {
        let mut r = Self::json(status, body);
        r.reason = reason;
        r
    }
}

struct CapturedRequest {
    method: String,
    path: String,
    query: String,
    headers: Vec<(String, String)>,
    body: String,
}

impl CapturedRequest {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// Jalankan mock HTTP server sekali. Balikin base URL + channel request.
fn spawn_mock(responses: Vec<MockResponse>) -> (String, Receiver<CapturedRequest>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
    let addr = listener.local_addr().unwrap();
    let queue = Arc::new(Mutex::new(VecDeque::from(responses)));
    let (tx, rx) = channel();

    thread::spawn(move || {
        for incoming in listener.incoming() {
            let mut stream = match incoming {
                Ok(s) => s,
                Err(_) => break,
            };
            let mut buf = Vec::new();
            let mut tmp = [0u8; 1024];
            // Baca header sampai \r\n\r\n (sisanya bisa sudah berisi body)
            let head_end = loop {
                if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                    break pos + 4;
                }
                let n = match stream.read(&mut tmp) {
                    Ok(0) => break buf.len(),
                    Ok(n) => n,
                    Err(_) => break buf.len(),
                };
                buf.extend_from_slice(&tmp[..n]);
            };
            let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
            let mut body_bytes = buf[head_end..].to_vec();
            let mut lines = head.split("\r\n");
            let request_line = lines.next().unwrap_or("").to_string();
            let mut parts = request_line.split_whitespace();
            let method = parts.next().unwrap_or("").to_string();
            let target = parts.next().unwrap_or("/").to_string();
            let (path, query) = match target.split_once('?') {
                Some((p, q)) => (p.to_string(), q.to_string()),
                None => (target.clone(), String::new()),
            };
            let headers: Vec<(String, String)> = lines
                .filter_map(|l| l.split_once(':'))
                .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
                .collect();
            let content_length = headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
                .and_then(|(_, v)| v.parse::<usize>().ok())
                .unwrap_or(0);
            while body_bytes.len() < content_length {
                let n = match stream.read(&mut tmp) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                body_bytes.extend_from_slice(&tmp[..n]);
            }
            let body = String::from_utf8_lossy(&body_bytes).to_string();

            let _ = tx.send(CapturedRequest {
                method,
                path,
                query,
                headers,
                body,
            });

            let response = {
                let mut q = queue.lock().unwrap();
                q.pop_front().unwrap_or_else(|| {
                    MockResponse::with_status(500, "Internal Server Error", "{}")
                })
            };
            let mut head = format!("HTTP/1.1 {} {}\r\n", response.status, response.reason);
            head.push_str(&format!("Content-Length: {}\r\n", response.body.len()));
            head.push_str("Connection: close\r\n");
            for (k, v) in &response.headers {
                head.push_str(&format!("{}: {}\r\n", k, v));
            }
            head.push_str("\r\n");
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(response.body.as_bytes());
            let _ = stream.flush();
        }
    });

    (format!("http://{}", addr), rx)
}

// --------------------------------------------------------------------- tes

#[test]
fn s256_challenge_sesuai_rfc7636() {
    // Contoh resmi RFC 7636 appendix B.
    let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    assert_eq!(
        code_challenge(verifier),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
}

#[test]
fn verifier_acak_urlsafe_panjang_43() {
    let v = random_verifier();
    assert_eq!(v.len(), 43);
    assert!(v
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    assert_ne!(v, random_verifier());
}

#[test]
fn verification_uri_hanya_diterima_bila_aman() {
    let ok = "https://sigap.marison-testing.biz.id/desktop/authorize?request=11111111-1111-4111-8111-111111111111";
    assert!(validate_verification_uri(ok));
    // http (bukan https)
    assert!(!validate_verification_uri(
        "http://sigap.marison-testing.biz.id/desktop/authorize?request=11111111-1111-4111-8111-111111111111"
    ));
    // host lain
    assert!(!validate_verification_uri(
        "https://evil.example/desktop/authorize?request=11111111-1111-4111-8111-111111111111"
    ));
    // path lain
    assert!(!validate_verification_uri(
        "https://sigap.marison-testing.biz.id/phishing?request=11111111-1111-4111-8111-111111111111"
    ));
    // request bukan UUID
    assert!(!validate_verification_uri(
        "https://sigap.marison-testing.biz.id/desktop/authorize?request=abc"
    ));
    // tanpa query
    assert!(!validate_verification_uri(
        "https://sigap.marison-testing.biz.id/desktop/authorize"
    ));
}

#[test]
fn path_notifikasi_hanya_relatif_aman() {
    assert_eq!(validate_path("/dashboard/surat/12"), Some("/dashboard/surat/12".into()));
    assert_eq!(validate_path("/calendar"), Some("/calendar".into()));
    // cross-origin
    assert!(validate_path("//evil.example/x").is_none());
    assert!(validate_path("https://evil.example").is_none());
    // path traversal
    assert!(validate_path("/dashboard/../../etc").is_none());
    // kontrol karakter
    assert!(validate_path("/dash\nboard").is_none());
    // kosong
    assert!(validate_path("").is_none());
}

#[tokio::test]
async fn pairing_mengirim_payload_kontrak() {
    let (base, rx) = spawn_mock(vec![MockResponse::json(
        200,
        r#"{"device_code":"dc-1","user_code":"01234567","verification_uri":"https://sigap.marison-testing.biz.id/desktop/authorize?request=11111111-1111-4111-8111-111111111111","expires_in":300,"interval":5,"client_id":"sigap-desktop-staging"}"#,
    )]);

    let http = SigapHttp::with_base(&base).unwrap();
    let created = http.create_pairing("inst-1", "LAPTOP-KEUANGAN", "windows", "challenge")
        .await
        .expect("pairing gagal");
    assert_eq!(created.user_code, "01234567");
    assert_eq!(created.interval, Some(5));

    let req = rx.recv().unwrap();
    assert_eq!(req.method, "POST");
    assert_eq!(req.path, "/api/desktop/pairings");
    assert!(req.body.contains("\"client_id\":\"sigap-desktop-staging\""));
    assert!(req.body.contains("\"installation_id\":\"inst-1\""));
    assert!(req.body.contains("\"device_name\":\"LAPTOP-KEUANGAN\""));
    assert!(req.body.contains("\"platform\":\"windows\""));
    assert!(req.body.contains("\"code_challenge_method\":\"S256\""));
    // tak ada kredensial di query string
    assert!(req.query.is_empty());
}

#[tokio::test]
async fn token_pending_429_dan_401_ditangani_benar() {
    let (base, rx) = spawn_mock(vec![
        MockResponse::with_status(202, "Accepted", r#"{"error":"authorization_pending"}"#),
        MockResponse::with_status(429, "Too Many Requests", r#"{"error":"slow_down"}"#),
        MockResponse::with_status(401, "Unauthorized", r#"{"error":"access_denied"}"#),
    ]);

    let http = SigapHttp::with_base(&base).unwrap();

    match http.poll_token("dc-1", "verifier").await {
        Err(ApiError::Pending) => {}
        other => panic!("harus Pending, dapat {:?}", other.err()),
    }

    match http.poll_token("dc-1", "verifier").await {
        Err(ApiError::RateLimited { retry_after }) => assert!(retry_after >= 1),
        other => panic!("harus RateLimited, dapat {:?}", other.err()),
    }

    match http.poll_token("dc-1", "verifier").await {
        Err(ApiError::Unauthorized(_)) => {}
        other => panic!("harus Unauthorized, dapat {:?}", other.err()),
    }

    // header Retry-After dipatuhi
    let req = rx.recv().unwrap();
    assert_eq!(req.path, "/api/desktop/token");
    assert!(req.body.contains("\"device_code\":\"dc-1\""));
    assert!(req.body.contains("\"code_verifier\":\"verifier\""));
}

#[tokio::test]
async fn token_sukses_diparse_dengan_field_kontrak() {
    let (base, _rx) = spawn_mock(vec![MockResponse::json(
        200,
        r#"{"token_type":"Bearer","access_token":"AT-1","refresh_token":"RT-1","expires_in":600,"session_id":"s-1","user_id":"u-1","session_expires_at":"2026-11-21T00:00:00Z","scope":"profile:read notifications:read notifications:mark_read"}"#,
    )]);
    let http = SigapHttp::with_base(&base).unwrap();
    let token = http.poll_token("dc-1", "verifier").await.unwrap();
    assert_eq!(token.access_token, "AT-1");
    assert_eq!(token.refresh_token, "RT-1");
    assert_eq!(token.expires_in, 600);
    assert_eq!(token.user_id.as_deref(), Some("u-1"));
}

#[tokio::test]
async fn notifikasi_memakai_bearer_dan_cursor_before() {
    let (base, rx) = spawn_mock(vec![MockResponse::json(
        200,
        r#"{"items":[{"id":"n1","type":"surat","title":"Surat baru","message":"Isi","is_read":false,"created_at":"2026-10-22T10:00:00Z","read_at":null,"path":"/dashboard/surat/1"}],"next_cursor":"cur-2","poll_interval":30}"#,
    )]);
    let http = SigapHttp::with_base(&base).unwrap();
    let page = http.get_notifications("AT-1", Some("cur-1")).await.unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].id, "n1");
    assert!(page.items[0].unread());
    assert_eq!(page.next_cursor.as_deref(), Some("cur-2"));
    assert_eq!(page.poll_interval, Some(30));

    let req = rx.recv().unwrap();
    assert_eq!(req.method, "GET");
    assert_eq!(req.path, "/api/desktop/notifications");
    assert_eq!(req.query, "before=cur-1");
    assert_eq!(req.header("Authorization"), Some("Bearer AT-1"));
}

#[tokio::test]
async fn mark_read_mengirim_bearer_ke_id_yang_diminta() {
    let (base, rx) = spawn_mock(vec![MockResponse::json(200, "{}")]);
    let http = SigapHttp::with_base(&base).unwrap();
    http.mark_read("AT-1", "n1").await.unwrap();
    let req = rx.recv().unwrap();
    assert_eq!(req.method, "POST");
    assert_eq!(req.path, "/api/desktop/notifications/n1/read");
    assert_eq!(req.header("Authorization"), Some("Bearer AT-1"));
}

#[tokio::test]
async fn redirect_lintas_origin_tidak_diikuti() {
    // Server membalas 302 ke host lain; klien harusreporting error, bukan
    // mengikuti redirect yang membawa kredensial.
    let mut resp = MockResponse::with_status(302, "Found", "");
    resp.headers.push((
        "Location".into(),
        "https://evil.example/api/desktop/me".into(),
    ));
    let (base, _rx) = spawn_mock(vec![resp]);
    let http = SigapHttp::with_base(&base).unwrap();
    match http.get_me("AT-1").await {
        Err(ApiError::Http(302, _)) => {}
        other => panic!("redirect tak boleh diikuti, dapat {:?}", other.err()),
    }
}

#[tokio::test]
async fn me_mengambil_identitas_dan_perangkat() {
    let (base, rx) = spawn_mock(vec![MockResponse::json(
        200,
        r#"{"user":{"id":"u-1","full_name":"Budi"},"device":{"id":"d-1","name":"LAPTOP-KEUANGAN"}}"#,
    )]);
    let http = SigapHttp::with_base(&base).unwrap();
    let me = http.get_me("AT-1").await.unwrap();
    assert_eq!(me.user.unwrap().full_name.as_deref(), Some("Budi"));
    assert_eq!(me.device.unwrap().name.as_deref(), Some("LAPTOP-KEUANGAN"));
    let req = rx.recv().unwrap();
    assert_eq!(req.path, "/api/desktop/me");
    assert_eq!(req.header("Cache-Control"), Some("no-store"));
}

// ------------------------------------------------- logika pagination notifikasi

fn item(id: &str) -> NotificationItem {
    NotificationItem {
        id: id.to_string(),
        kind: Some("surat".into()),
        title: Some(format!("Judul {}", id)),
        message: None,
        is_read: Some(false),
        created_at: Some(format!("2026-10-22T10:00:0{}Z", id)),
        read_at: None,
        path: Some("/dashboard/surat/1".into()),
    }
}

fn page(ids: &[&str], next: Option<&str>) -> NotificationsPage {
    NotificationsPage {
        items: ids.iter().map(|i| item(i)).collect(),
        next_cursor: next.map(|s| s.to_string()),
        poll_interval: Some(30),
    }
}

#[tokio::test]
async fn pagination_berhenti_saat_mencapai_id_lama() {
    let pages = Rc::new(vec![
        page(&["n3", "n2"], Some("c1")),
        page(&["n5", "n4"], Some("c2")),
        page(&["n6"], None),
    ]);
    let seen: HashSet<String> = ["n5"].iter().map(|s| s.to_string()).collect();
    let mut idx = 0usize;
    let pages_c = pages.clone();
    let (fresh, reached) = walk_pages(
        move |_cursor: Option<String>| {
            let pages_c = pages_c.clone();
            let i = idx;
            idx += 1;
            async move { Ok(pages_c[i].clone()) }
        },
        &seen,
        true,
        10,
    )
    .await
    .unwrap();

    assert!(reached, "h should've sampai ID yang sudah pernah dilihat");
    let ids: Vec<&str> = fresh.iter().map(|f| f.id.as_str()).collect();
    // n5 sudah pernah dilihat -> dilewati; n4 (baru, di halaman yang sama) tetap diambil.
    assert_eq!(ids, vec!["n3", "n2", "n4"]);
}

#[tokio::test]
async fn baseline_mengambil_semua_halaman() {
    let pages = Rc::new(vec![
        page(&["n3", "n2"], Some("c1")),
        page(&["n1"], None),
    ]);
    let mut idx = 0usize;
    let pages_c = pages.clone();
    let (all, reached) = walk_pages(
        move |_cursor: Option<String>| {
            let pages_c = pages_c.clone();
            let i = idx;
            idx += 1;
            async move { Ok(pages_c[i].clone()) }
        },
        &HashSet::new(),
        false,
        10,
    )
    .await
    .unwrap();

    assert!(!reached);
    let ids: Vec<&str> = all.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, vec!["n3", "n2", "n1"]);
}

#[tokio::test]
async fn id_duplikat_hanya_diambil_satu_kali() {
    let pages = Rc::new(vec![page(&["n1", "n1", "n2"], None)]);
    let mut idx = 0usize;
    let pages_c = pages.clone();
    let (all, _) = walk_pages(
        move |_cursor: Option<String>| {
            let pages_c = pages_c.clone();
            let i = idx;
            idx += 1;
            async move { Ok(pages_c[i].clone()) }
        },
        &HashSet::new(),
        false,
        10,
    )
    .await
    .unwrap();

    let ids: Vec<&str> = all.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, vec!["n1", "n2"]);
}

#[tokio::test]
async fn cursor_dikirim_ke_halaman_berikutnya() {
    let pages = Rc::new(vec![page(&["n2"], Some("cursor-2")), page(&["n1"], None)]);
    let cursors = Rc::new(std::cell::RefCell::new(Vec::new()));
    let mut idx = 0usize;
    let pages_c = pages.clone();
    let cursors_c = cursors.clone();
    let (all, _) = walk_pages(
        move |cursor: Option<String>| {
            let pages_c = pages_c.clone();
            let cursors_c = cursors_c.clone();
            let i = idx;
            idx += 1;
            cursors_c.borrow_mut().push(cursor.clone());
            async move { Ok(pages_c[i].clone()) }
        },
        &HashSet::new(),
        false,
        10,
    )
    .await
    .unwrap();

    let seen_cursors = cursors.borrow();
    assert_eq!(seen_cursors.len(), 2);
    assert_eq!(seen_cursors[0], None);
    assert_eq!(seen_cursors[1].as_deref(), Some("cursor-2"));
    assert_eq!(all.len(), 2);
}

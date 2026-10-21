use core_graphics::event::{
    CGEvent, CGEventType, CGEventTapLocation, CGMouseButton,
};
use core_graphics::event_source::{
    CGEventSource, CGEventSourceStateID,
};
use core_graphics::geometry::CGPoint;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::remote_control::RemoteControlState;

/// Peristiwa input dari web viewer.
///
/// Koordinat boleh ternormalisasi (`norm: true`, nilai 0..1 relatif terhadap
/// area gambar) atau absolut (px layar). Viewer memakai ternormalisasi karena
/// frame yang dikirim sudah di-downscale — jadi tidak perlu tahu ukuran layar.
///
/// Format JSON: {"type":"MouseMove","x":0.5,"y":0.2,"norm":true}
/// (internally tagged — cocok dengan payload yang dikirim web viewer)
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum RemoteInput {
    MouseMove { x: f64, y: f64, norm: bool },
    MouseDown { button: String, x: f64, y: f64, norm: bool },
    MouseUp { button: String, x: f64, y: f64, norm: bool },
    KeyDown { key: String },
    KeyUp { key: String },
}

/// Terima peristiwa input dari frontend, lakukan inject ke OS via CGEventPost.
#[tauri::command]
pub async fn remote_inject_input(
    state: State<'_, RemoteControlState>,
    session_id: String,
    input: RemoteInput,
) -> Result<(), String> {
    // Koordinat ternormalisasi -> absolut memakai ukuran layar terakhir
    let (screen_w, screen_h) = state.screen_size(&session_id);

    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .map_err(|_| "tidak bisa buat event source".to_string())?;

    match input {
        RemoteInput::MouseMove { x, y, norm } => {
            let (ax, ay) = resolve(x, y, norm, screen_w, screen_h);
            let point = CGPoint::new(ax, ay);
            let event = CGEvent::new_mouse_event(
                source,
                CGEventType::MouseMoved,
                point,
                CGMouseButton::Left,
            )
            .map_err(|_| "tidak bisa buat event mouse move".to_string())?;
            event.post(CGEventTapLocation::HID);
        }
        RemoteInput::MouseDown { button, x, y, norm } => {
            let (ax, ay) = resolve(x, y, norm, screen_w, screen_h);
            let point = CGPoint::new(ax, ay);
            let btn = parse_mouse_button(&button);
            let event = CGEvent::new_mouse_event(
                source,
                CGEventType::LeftMouseDown,
                point,
                btn,
            )
            .map_err(|_| "tidak bisa buat event mouse down".to_string())?;
            event.post(CGEventTapLocation::HID);
        }
        RemoteInput::MouseUp { button, x, y, norm } => {
            let (ax, ay) = resolve(x, y, norm, screen_w, screen_h);
            let point = CGPoint::new(ax, ay);
            let btn = parse_mouse_button(&button);
            let event = CGEvent::new_mouse_event(
                source,
                CGEventType::LeftMouseUp,
                point,
                btn,
            )
            .map_err(|_| "tidak bisa buat event mouse up".to_string())?;
            event.post(CGEventTapLocation::HID);
        }
        RemoteInput::KeyDown { key } => {
            inject_key(source, &key, true)?;
        }
        RemoteInput::KeyUp { key } => {
            inject_key(source, &key, false)?;
        }
    }

    Ok(())
}

/// Ubah koordinat ternormalisasi (0..1) menjadi piksel absolut layar.
fn resolve(x: f64, y: f64, norm: bool, screen_w: f64, screen_h: f64) -> (f64, f64) {
    if norm {
        (x * screen_w, y * screen_h)
    } else {
        (x, y)
    }
}

/// Parse nama tombol mouse dari string
fn parse_mouse_button(button: &str) -> CGMouseButton {
    match button {
        "right" => CGMouseButton::Right,
        "center" | "middle" => CGMouseButton::Center,
        _ => CGMouseButton::Left,
    }
}

/// Inject tombol keyboard via CGEventPost
fn inject_key(source: CGEventSource, key: &str, press: bool) -> Result<(), String> {
    let keycode = key_to_cg_keycode(key);
    let event = CGEvent::new_keyboard_event(source, keycode, press)
        .map_err(|_| "tidak bisa buat event keyboard".to_string())?;
    event.post(CGEventTapLocation::HID);
    Ok(())
}

/// Map string kunci ke CGKeyCode (macOS virtual key codes)
fn key_to_cg_keycode(key: &str) -> u16 {
    let k = key.to_lowercase();
    match k.as_str() {
        "a" => 0, "s" => 1, "d" => 2, "f" => 3, "h" => 4, "g" => 5, "z" => 6,
        "x" => 7, "c" => 8, "v" => 9, "b" => 11, "q" => 12, "w" => 13, "e" => 14,
        "r" => 15, "t" => 16, "y" => 17, "1" => 18, "2" => 19, "3" => 20, "4" => 21,
        "6" => 22, "5" => 23, "=" => 24, "9" => 25, "7" => 26, "-" => 27, "8" => 28,
        "0" => 29, "]" => 30, "o" => 31, "u" => 32, "[" => 33, "i" => 34, "p" => 35,
        "l" => 37, "j" => 38, "'" => 39, "k" => 40, ";" => 41, "\\" => 42, "," => 43,
        "/" => 44, "n" => 45, "m" => 46, "." => 47, "tab" => 48, "space" => 49,
        "`" => 50, "delete" => 51, "enter" => 52, "escape" => 53, "command" => 55,
        "shift" => 56, "capslock" => 57, "option" => 58, "control" => 59,
        "rightshift" => 60, "rightoption" => 61, "rightcontrol" => 62,
        "fn" => 63, "f17" => 64, "volumeup" => 72, "volumedown" => 73,
        "mute" => 74, "f18" => 75, "f19" => 76, "f20" => 77, "f5" => 96,
        "f6" => 97, "f7" => 98, "f3" => 99, "f8" => 100, "f9" => 101, "f11" => 103,
        "f13" => 105, "f16" => 107, "f14" => 109, "f10" => 111, "f12" => 113,
        "f15" => 114, "help" => 115, "home" => 116, "pageup" => 117,
        "forwarddelete" => 118, "end" => 119, "pagedown" => 120, "left" => 123,
        "right" => 124, "down" => 125, "up" => 126,
        _ => 0,
    }
}
